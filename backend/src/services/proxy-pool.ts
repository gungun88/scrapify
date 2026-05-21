import { ProxyAgent } from 'undici'
import type { ProxyRecord } from '../types'
import { getDatabase, markProxyDirty } from './data-store'

// 用户级代理池:safe-http.ts 用 pickProxyForUser 拿当前最优代理,
// getProxyAgent 拿对应的 undici dispatcher。
//
// Agent 实例按"内容签名"(scheme+host+port+credentials)缓存:同一个 proxyId
// 在内容没变的情况下复用同一个 ProxyAgent,避免每次 fetch new 一个新 agent
// 造成连接池 churn。CRUD 时主动 invalidate。
//
// 连接级错误(ECONNREFUSED 等)由 recordProxyFailure 递增 consecutive_failures,
// 连续 5 次将代理标 status='offline';任何 HTTP 响应都视为代理透传成功。

interface CachedAgent {
  agent: ProxyAgent
  signature: string
}

const agentCache = new Map<string, CachedAgent>()

const PROXY_FAILURE_THRESHOLD = 5
const PROXY_PICK_FAILURE_GATE = 3

const PROXY_CONNECTION_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])

function buildProxyUrl(proxy: ProxyRecord): string {
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : proxy.username
        ? `${encodeURIComponent(proxy.username)}@`
        : ''
  return `${proxy.scheme}://${auth}${proxy.host}:${proxy.port}`
}

function buildSignature(proxy: ProxyRecord): string {
  return `${proxy.scheme}|${proxy.host}|${proxy.port}|${proxy.username ?? ''}|${proxy.password ?? ''}`
}

// 给 safe-http 用:每用户挑一个"online + 失败次数低 + 延迟最低"的代理。
// 没有可用代理时返回 null,调用方决定 fallback(默认走直连 + WARN 日志)。
export async function pickProxyForUser(userId: string): Promise<ProxyRecord | null> {
  const db = await getDatabase()
  const candidates = db.proxies.filter(
    (p) =>
      p.userId === userId &&
      p.status === 'online' &&
      p.consecutiveFailures < PROXY_PICK_FAILURE_GATE,
  )
  if (candidates.length === 0) return null
  candidates.sort(
    (a, b) =>
      (a.latencyMs ?? Number.MAX_SAFE_INTEGER) - (b.latencyMs ?? Number.MAX_SAFE_INTEGER),
  )
  return candidates[0] ?? null
}

// 返回 dispatcher 给 fetch 用。复用同 signature 的 agent,内容变了就 invalidate 再建。
export function getProxyAgent(proxy: ProxyRecord): ProxyAgent {
  const signature = buildSignature(proxy)
  const cached = agentCache.get(proxy.id)
  if (cached && cached.signature === signature) {
    return cached.agent
  }
  // 内容变了或第一次:关掉旧的,建新的
  if (cached) {
    void cached.agent.close().catch(() => {})
  }
  const agent = new ProxyAgent({
    uri: buildProxyUrl(proxy),
    // 连接超时短一点,代理坏掉时让上层 retry 早点切换
    connectTimeout: 10_000,
  })
  agentCache.set(proxy.id, { agent, signature })
  return agent
}

// CRUD 路由 + worker 在代理被删 / 内容变更时主动调一次,释放底层连接池。
export function invalidateProxyAgent(proxyId: string): void {
  const cached = agentCache.get(proxyId)
  if (!cached) return
  void cached.agent.close().catch(() => {})
  agentCache.delete(proxyId)
}

// 关闭所有缓存的 agent;server graceful shutdown 时用。
export async function closeAllProxyAgents(): Promise<void> {
  const agents = [...agentCache.values()].map((c) => c.agent)
  agentCache.clear()
  await Promise.allSettled(agents.map((a) => a.close()))
}

function extractErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const direct = (error as { code?: unknown }).code
    if (typeof direct === 'string') return direct
    const cause = (error as { cause?: unknown }).cause
    if (cause && typeof cause === 'object') {
      const inner = (cause as { code?: unknown }).code
      if (typeof inner === 'string') return inner
    }
  }
  return null
}

export function isProxyConnectionError(error: unknown): boolean {
  const code = extractErrorCode(error)
  return code !== null && PROXY_CONNECTION_ERROR_CODES.has(code)
}

// 命中连接级错误时递增 consecutive_failures;达到阈值标 offline。
// 任何 HTTP 响应(包括上游 502 / 504)都视为代理透传成功,不递增。
export async function recordProxyFailure(proxyId: string): Promise<void> {
  const db = await getDatabase()
  const proxy = db.proxies.find((p) => p.id === proxyId)
  if (!proxy) return
  proxy.consecutiveFailures += 1
  proxy.lastCheckedAt = new Date().toISOString()
  if (proxy.consecutiveFailures >= PROXY_FAILURE_THRESHOLD && proxy.status !== 'offline') {
    proxy.status = 'offline'
    invalidateProxyAgent(proxyId)
  }
  markProxyDirty(proxyId)
}

// proxy-runtime 探活成功时 / 路由手动 test 成功时复位
export async function recordProxySuccess(
  proxyId: string,
  latencyMs: number,
): Promise<void> {
  const db = await getDatabase()
  const proxy = db.proxies.find((p) => p.id === proxyId)
  if (!proxy) return
  const wasOffline = proxy.status !== 'online'
  proxy.consecutiveFailures = 0
  proxy.latencyMs = latencyMs
  proxy.lastCheckedAt = new Date().toISOString()
  proxy.status = 'online'
  if (wasOffline) {
    markProxyDirty(proxyId)
  }
}
