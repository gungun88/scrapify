import crypto, { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { backendConfig } from '../config'
import { getDb } from '../db/client'
import { users } from '../db/schema'

// 当前认证身份，由 requireUser 从 X-User-* header 解析并 upsert 后注入
export interface AuthenticatedUser {
  id: string
  email: string
  displayName: string | null
  imageUrl: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}

// /api/health 公开放行，其余 endpoint 全部要求登录
const PUBLIC_PATHS = new Set(['/api/health'])

export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const path = request.url.split('?')[0] ?? request.url
  if (PUBLIC_PATHS.has(path)) {
    return
  }

  if (!backendConfig.hmacSecret) {
    request.log.error(
      'SCRAPIFY_BACKEND_HMAC_SECRET is not set; refusing to authenticate any request',
    )
    return reply.status(500).send({ message: 'Server auth not configured.' })
  }

  const sub = headerString(request.headers['x-user-sub'])
  const email = headerString(request.headers['x-user-email'])
  const name = headerString(request.headers['x-user-name'])
  const image = headerString(request.headers['x-user-image'])
  const sig = headerString(request.headers['x-user-sig'])

  if (!sub || !email || !sig) {
    return reply.status(401).send({ message: 'Missing user credentials.' })
  }

  const expected = signUserHeaders(sub, email, name, image)
  if (!safeEqualHex(sig, expected)) {
    return reply.status(401).send({ message: 'Invalid user signature.' })
  }

  try {
    const user = await upsertUser({ sub, email, name: name || null, image: image || null })
    request.user = user
  } catch (error) {
    request.log.error({ err: error }, 'failed to upsert authenticated user')
    return reply.status(500).send({ message: 'Failed to load user account.' })
  }
}

function headerString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
}

function signUserHeaders(sub: string, email: string, name: string, image: string) {
  const message = [sub, email, name, image].join('|')
  return crypto.createHmac('sha256', backendConfig.hmacSecret).update(message).digest('hex')
}

function safeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

interface UpsertInput {
  sub: string
  email: string
  name: string | null
  image: string | null
}

async function upsertUser(info: UpsertInput): Promise<AuthenticatedUser> {
  const db = getDb()
  // 用 email 作为冲突键，原因：email 唯一约束在 INSERT 阶段会先于 google_sub 被 PG 检测到，
  // 用 google_sub 当 target 时如果 email 已存在会绕过 ON CONFLICT 直接报错。
  // Google 账号 email 唯一且稳定，set 里同时更新 google_sub 处理"换 Google 账号但同 email"边界。
  const [row] = await db
    .insert(users)
    .values({
      id: `user-${randomUUID().slice(0, 12)}`,
      email: info.email,
      googleSub: info.sub,
      displayName: info.name,
      imageUrl: info.image,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        googleSub: info.sub,
        displayName: info.name,
        imageUrl: info.image,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
    })

  if (!row) {
    throw new Error('upsertUser returned no row')
  }

  return row
}
