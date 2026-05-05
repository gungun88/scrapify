/* eslint-disable @typescript-eslint/no-explicit-any */
import { backendConfig } from '../config'
import * as schema from './schema'

// 双驱动 db client：
// - DATABASE_URL=pglite://<dir> 或 'memory:' → 嵌入式 PGlite（dev 默认，无需 docker）
// - DATABASE_URL=postgres://... → 真 Postgres（生产）
//
// - REDIS_URL=mock:// 或空 → ioredis-mock（dev 默认，无需 docker）
// - REDIS_URL=redis://... → 真 Redis
//
// 启动入口必须先 `await initDb()` 再访问 getDb() / getRedis()。

type AnyDb = any

let dbInstance: AnyDb = null
let dbDriver: 'pg' | 'pglite' | null = null
let pool: any = null
let pgliteInstance: any = null
let redisInstance: any = null

function isPgliteUrl(url: string) {
  return !url || url.startsWith('pglite:') || url === 'memory:'
}

function isMockRedisUrl(url: string) {
  return !url || url === 'mock://' || url === 'mock:' || url === 'memory:'
}

function resolvePgliteDataDir(url: string): string | undefined {
  const trimmed = url.replace(/^pglite:(\/\/)?/, '').replace(/^memory:/, '')
  if (!trimmed || trimmed === 'memory') {
    // Pure in-memory PGlite（不持久化）
    return undefined
  }
  return trimmed
}

export async function initDb() {
  if (dbInstance) {
    return dbInstance
  }

  const url = backendConfig.databaseUrl

  if (isPgliteUrl(url)) {
    const { PGlite } = await import('@electric-sql/pglite')
    const dataDir = resolvePgliteDataDir(url)

    // PGlite dev 路径：上次进程被强杀（kill -9）时会残留 postmaster.pid，
    // 导致 wasm recovery 失败而无法启动。PGlite 是单进程嵌入式，没有真正的并发锁，
    // 所以启动前直接清掉 stale 锁文件是安全的。
    if (dataDir) {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const lockPath = path.join(dataDir, 'postmaster.pid')
      try {
        await fs.unlink(lockPath)
        // eslint-disable-next-line no-console
        console.log(`[db] removed stale PGlite lock at ${lockPath}`)
      } catch {
        // 不存在或无法删除都不影响后续启动
      }
    }

    pgliteInstance = dataDir ? new PGlite(dataDir) : new PGlite()
    await pgliteInstance.waitReady

    const { drizzle } = await import('drizzle-orm/pglite')
    const db = drizzle(pgliteInstance as any, { schema })

    // 自动应用迁移（PGlite 模式下不依赖 drizzle-kit migrate CLI）
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(db, { migrationsFolder: 'backend/src/db/migrations' })

    dbInstance = db
    dbDriver = 'pglite'
    // eslint-disable-next-line no-console
    console.log(`[db] PGlite ready (dataDir=${dataDir ?? 'memory'})`)
  } else {
    const { Pool } = await import('pg')
    pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
    })
    pool.on('error', (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('[db] pg pool error:', error)
    })

    const { drizzle } = await import('drizzle-orm/node-postgres')
    dbInstance = drizzle(pool, { schema })
    dbDriver = 'pg'
    // eslint-disable-next-line no-console
    console.log('[db] pg ready')
  }

  return dbInstance
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return dbInstance
}

export function getDbDriver() {
  return dbDriver
}

export function getRedis() {
  if (redisInstance) {
    return redisInstance
  }

  const url = backendConfig.redisUrl

  if (isMockRedisUrl(url)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RedisMock = require('ioredis-mock')
    redisInstance = new RedisMock()
    // eslint-disable-next-line no-console
    console.log('[db] redis ready (ioredis-mock, in-memory)')
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis')
    redisInstance = new Redis(url, {
      maxRetriesPerRequest: null,
      enableAutoPipelining: true,
    })
    // eslint-disable-next-line no-console
    console.log('[db] redis ready (real)')
  }

  redisInstance.on('error', (error: Error) => {
    // eslint-disable-next-line no-console
    console.error('[db] redis error:', error)
  })

  return redisInstance
}

export async function closeDbConnections() {
  const tasks: Promise<unknown>[] = []

  if (pool) {
    tasks.push(pool.end())
    pool = null
  }

  if (pgliteInstance) {
    tasks.push(pgliteInstance.close())
    pgliteInstance = null
  }

  if (redisInstance) {
    tasks.push(
      Promise.resolve(redisInstance.quit?.())
        .catch(() => undefined)
        .then(() => undefined),
    )
    redisInstance = null
  }

  await Promise.all(tasks)
  dbInstance = null
  dbDriver = null
}

export type DbClient = AnyDb
