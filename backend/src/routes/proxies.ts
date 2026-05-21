import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  getDatabase,
  markProxyDeleted,
  markProxyDirty,
  saveDatabase,
} from '../services/data-store'
import { invalidateProxyAgent } from '../services/proxy-pool'
import { testProxyById, triggerProxyRefresh } from '../services/proxy-runtime'
import { assertPublicHostname, SsrfBlockedError } from '../services/url-guard'
import type { NewProxyForm, ProxyRecord, ProxyScheme } from '../types'

const MAX_PROXIES_PER_USER = 10
const MAX_HOST_LENGTH = 255
const MAX_LABEL_LENGTH = 64
const MAX_CRED_LENGTH = 128

function userIdOf(request: FastifyRequest): string {
  if (!request.user) {
    throw new Error('requireUser hook did not run before proxies route')
  }
  return request.user.id
}

function normalizeNewProxy(body: unknown): NewProxyForm | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid payload' }
  const v = body as Record<string, unknown>

  const scheme: ProxyScheme | null = v.scheme === 'http' || v.scheme === 'https' ? v.scheme : null
  if (!scheme) return { error: 'scheme must be http or https' }

  const rawHost = typeof v.host === 'string' ? v.host.trim() : ''
  if (!rawHost || rawHost.length > MAX_HOST_LENGTH) {
    return { error: 'host required (≤255 chars)' }
  }

  const port = typeof v.port === 'number' && Number.isInteger(v.port) ? v.port : null
  if (port === null || port < 1 || port > 65535) {
    return { error: 'port must be an integer in [1,65535]' }
  }

  const username =
    typeof v.username === 'string' && v.username.length > 0 && v.username.length <= MAX_CRED_LENGTH
      ? v.username
      : null
  const password =
    typeof v.password === 'string' && v.password.length > 0 && v.password.length <= MAX_CRED_LENGTH
      ? v.password
      : null
  const label =
    typeof v.label === 'string' && v.label.length > 0 && v.label.length <= MAX_LABEL_LENGTH
      ? v.label
      : null
  const countryCode =
    typeof v.countryCode === 'string' && /^[A-Za-z]{2}$/.test(v.countryCode)
      ? v.countryCode.toUpperCase()
      : null

  return { scheme, host: rawHost, port, username, password, label, countryCode }
}

function toResponse(proxy: ProxyRecord): Omit<ProxyRecord, 'password'> & { hasPassword: boolean } {
  const { password, ...rest } = proxy
  return { ...rest, hasPassword: password !== null }
}

export async function registerProxyRoutes(app: FastifyInstance) {
  app.get('/api/proxies', async (request, reply) => {
    const userId = userIdOf(request)
    const db = await getDatabase()
    const list = db.proxies
      .filter((p) => p.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map(toResponse)
    return reply.send(list)
  })

  app.post(
    '/api/proxies',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = userIdOf(request)
      const normalized = normalizeNewProxy(request.body)
      if ('error' in normalized) {
        return reply.status(400).send({ message: normalized.error })
      }

      // SSRF 防护:host 必须是公网。攻击者拿"代理"当跳板 SSRF 内网就指望这一关。
      // 后续如有内网代理诉求(企业内网 squid),加 ALLOWED_PRIVATE_PROXY_HOSTS env。
      try {
        await assertPublicHostname(normalized.host)
      } catch (error) {
        if (error instanceof SsrfBlockedError) {
          return reply.status(400).send({ message: `Host not allowed: ${error.message}` })
        }
        throw error
      }

      const db = await getDatabase()
      const userCount = db.proxies.filter((p) => p.userId === userId).length
      if (userCount >= MAX_PROXIES_PER_USER) {
        return reply.status(400).send({
          message: `Reached per-user proxy limit (${MAX_PROXIES_PER_USER})`,
        })
      }

      const record: ProxyRecord = {
        id: `proxy-${randomUUID().slice(0, 12)}`,
        userId,
        scheme: normalized.scheme,
        host: normalized.host,
        port: normalized.port,
        username: normalized.username ?? null,
        password: normalized.password ?? null,
        label: normalized.label ?? null,
        countryCode: normalized.countryCode ?? null,
        status: 'unknown',
        latencyMs: null,
        lastCheckedAt: null,
        consecutiveFailures: 0,
        createdAt: new Date().toISOString(),
      }
      db.proxies.unshift(record)
      markProxyDirty(record.id)
      await saveDatabase()

      // 创建后立即探活一次,让用户尽快看到 online/offline。
      // 不 await:用户拿到 201 就够,探活完成后下次 GET 列表自然刷新。
      void testProxyById(record.id).catch(() => {})

      return reply.status(201).send(toResponse(record))
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/proxies/:id',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = userIdOf(request)
      const db = await getDatabase()
      const idx = db.proxies.findIndex(
        (p) => p.id === request.params.id && p.userId === userId,
      )
      if (idx < 0) {
        return reply.status(404).send({ message: 'Proxy not found' })
      }
      const removed = db.proxies.splice(idx, 1)[0]
      markProxyDeleted(removed.id)
      invalidateProxyAgent(removed.id)
      await saveDatabase()
      return reply.status(204).send()
    },
  )

  app.post(
    '/api/proxies/refresh',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = userIdOf(request)
      await triggerProxyRefresh(userId)
      return reply.status(204).send()
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/proxies/:id/test',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = userIdOf(request)
      const db = await getDatabase()
      const proxy = db.proxies.find(
        (p) => p.id === request.params.id && p.userId === userId,
      )
      if (!proxy) {
        return reply.status(404).send({ message: 'Proxy not found' })
      }
      const result = await testProxyById(proxy.id)
      return reply.send(result ?? { ok: false, latencyMs: null })
    },
  )
}
