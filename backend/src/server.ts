import './env-loader'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { backendConfig } from './config'
import { closeDbConnections, getRedis, initDb } from './db/client'
import { requireUser } from './middleware/require-user'
import { registerHealthRoutes } from './routes/health'
import { registerTaskRoutes } from './routes/tasks'
import { registerUserRoutes } from './routes/users'
import { loadDatabase } from './services/data-store'
import { startTaskWorker } from './services/task-runtime'

async function createServer() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: backendConfig.corsOrigin === '*' ? true : backendConfig.corsOrigin,
    credentials: true,
  })

  await app.register(rateLimit, {
    max: backendConfig.rateLimit.global,
    timeWindow: backendConfig.rateLimit.timeWindow,
    redis: getRedis(),
    nameSpace: 'scrapify-rl-',
    keyGenerator: (request) => {
      const forwarded = request.headers['x-forwarded-for']
      if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0]?.trim() || request.ip
      }
      return request.ip
    },
  })

  // 全局鉴权 hook：/api/health 公开放行（hook 内部判断），其余 endpoint 必须带签名
  app.addHook('preHandler', requireUser)

  await registerHealthRoutes(app)
  await registerUserRoutes(app)
  await registerTaskRoutes(app)

  return app
}

async function start() {
  await initDb()
  await loadDatabase()
  startTaskWorker()
  const app = await createServer()

  // 优雅关闭：让 PGlite 释放 postmaster.pid 锁，避免下次启动崩溃
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, 'shutting down gracefully')
    try {
      await app.close()
    } catch (error) {
      app.log.error({ err: error }, 'error closing fastify')
    }
    try {
      await closeDbConnections()
    } catch (error) {
      app.log.error({ err: error }, 'error closing db connections')
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  try {
    await app.listen({
      host: backendConfig.host,
      port: backendConfig.port,
    })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void start()
