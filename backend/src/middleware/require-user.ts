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

// 统一 401 响应:无论 missing / invalid signature / ts 过期都返回同样的文案,
// 避免给攻击者枚举 header 名称、确认密钥泄露等额外信息。
// 具体原因仍写入服务端日志(redact 过的)。
function rejectUnauthorized(reply: FastifyReply) {
  return reply.status(401).send({ message: 'Unauthorized' })
}

// HMAC 时间戳窗口:5 分钟。超过窗口的签名一律拒绝,把"无限重放"降级为"5 分钟内可重放"。
const HMAC_TS_WINDOW_MS = 5 * 60 * 1000

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
  const ts = headerString(request.headers['x-user-ts'])
  const sig = headerString(request.headers['x-user-sig'])

  if (!sub || !email || !sig || !ts) {
    request.log.warn({ path, hasSub: !!sub, hasEmail: !!email, hasSig: !!sig, hasTs: !!ts }, 'auth: missing credentials')
    return rejectUnauthorized(reply)
  }

  // ts 必须是整数毫秒时间戳,并落在 [now-5min, now+5min] 窗口内
  const tsNumber = Number(ts)
  if (!Number.isInteger(tsNumber) || Math.abs(Date.now() - tsNumber) > HMAC_TS_WINDOW_MS) {
    request.log.warn({ path, tsSkew: Date.now() - tsNumber }, 'auth: ts out of window')
    return rejectUnauthorized(reply)
  }

  const expected = signUserHeaders(sub, email, name, image, ts)
  if (!safeEqualHex(sig, expected)) {
    request.log.warn({ path }, 'auth: invalid signature')
    return rejectUnauthorized(reply)
  }

  try {
    const user = await upsertUser({ sub, email, name: name || null, image: image || null })
    request.user = user
  } catch (error) {
    // 只记 message + code,不记完整 err(避免 SQL/参数泄露到日志)
    const err = error as { message?: string; code?: string }
    request.log.error({ msg: err.message, code: err.code }, 'auth: failed to upsert user')
    return reply.status(500).send({ message: 'Failed to load user account.' })
  }
}

function headerString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
}

function signUserHeaders(sub: string, email: string, name: string, image: string, ts: string) {
  const message = [sub, email, name, image, ts].join('|')
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
