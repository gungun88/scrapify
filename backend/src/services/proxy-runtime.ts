import net from 'node:net'
import type { ProxyRecord, ProxyStatus } from '../types'
import { getDatabase, markProxyDirty, saveDatabase } from './data-store'
import { invalidateProxyAgent } from './proxy-pool'

// 代理探活 worker。
// - setInterval 60s 一次,每轮对所有代理做 TCP connect 测试。
// - 同时 5 路 probe,单 probe 5s 超时(worst case 100 代理 / 5 路 = ~100s,可接受)。
// - 失败累加 consecutive_failures;达 5 次标 status='offline'。
// - 成功复位 consecutive_failures,status='online',记 latency_ms。
// - dirty 策略:status 转换才 markProxyDirty;latency/last_checked 每 LATENCY_FLUSH_INTERVAL
//   轮才落盘一次(中间只更新内存)。这样 100 代理 × 60s 间隔的稳态 IO 接近 0。

const TICK_MS = 60_000
const PROBE_CONCURRENCY = 5
const PROBE_TIMEOUT_MS = 5_000
const FAILURE_THRESHOLD = 5
const LATENCY_FLUSH_INTERVAL = 5 // 每 5 轮(默认 5min)把 latency/last_checked 落盘一次

let proxyWorkerTimer: NodeJS.Timeout | null = null
let proxyWorkerBusy = false
let tickCounter = 0

interface ProbeResult {
  proxyId: string
  ok: boolean
  latencyMs: number | null
}

function probeOnce(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ ok: boolean; latencyMs: number | null }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = new net.Socket()
    let settled = false

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, latencyMs: ok ? Date.now() - start : null })
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))

    try {
      socket.connect(port, host)
    } catch {
      finish(false)
    }
  })
}

async function probeProxy(proxy: ProxyRecord): Promise<ProbeResult> {
  const result = await probeOnce(proxy.host, proxy.port, PROBE_TIMEOUT_MS)
  return { proxyId: proxy.id, ok: result.ok, latencyMs: result.latencyMs }
}

async function probeBatch(batch: ProxyRecord[]): Promise<ProbeResult[]> {
  return Promise.all(batch.map(probeProxy))
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

function applyResult(
  proxy: ProxyRecord,
  result: ProbeResult,
  shouldFlushLatency: boolean,
): boolean {
  const prevStatus = proxy.status
  let nextStatus: ProxyStatus = prevStatus
  let dirty = false

  proxy.lastCheckedAt = new Date().toISOString()

  if (result.ok) {
    proxy.consecutiveFailures = 0
    proxy.latencyMs = result.latencyMs
    nextStatus = 'online'
  } else {
    proxy.consecutiveFailures += 1
    if (proxy.consecutiveFailures >= FAILURE_THRESHOLD) {
      nextStatus = 'offline'
    }
  }

  if (nextStatus !== prevStatus) {
    proxy.status = nextStatus
    dirty = true
    if (nextStatus === 'offline') {
      // 离线了:释放对应的 agent 连接池
      invalidateProxyAgent(proxy.id)
    }
  } else if (shouldFlushLatency) {
    // 状态没变,但每 N 轮 flush 一次 latency/last_checked,避免 last_checked 长期不持久
    dirty = true
  }

  return dirty
}

async function tickProxyWorker(): Promise<void> {
  if (proxyWorkerBusy) return
  proxyWorkerBusy = true
  tickCounter += 1
  const shouldFlushLatency = tickCounter % LATENCY_FLUSH_INTERVAL === 0

  try {
    const db = await getDatabase()
    if (db.proxies.length === 0) return

    const targets = db.proxies.slice()
    const batches = chunk(targets, PROBE_CONCURRENCY)

    let anyDirty = false
    for (const batch of batches) {
      const results = await probeBatch(batch)
      for (const result of results) {
        const proxy = db.proxies.find((p) => p.id === result.proxyId)
        if (!proxy) continue
        const dirty = applyResult(proxy, result, shouldFlushLatency)
        if (dirty) {
          markProxyDirty(proxy.id)
          anyDirty = true
        }
      }
    }

    if (anyDirty) {
      await saveDatabase()
    }
  } catch (error) {
    console.warn('[proxy-runtime] tick failed', error)
  } finally {
    proxyWorkerBusy = false
  }
}

// 路由手动触发某用户全部代理重新探活
export async function triggerProxyRefresh(userId: string): Promise<void> {
  const db = await getDatabase()
  const targets = db.proxies.filter((p) => p.userId === userId)
  if (targets.length === 0) return
  const batches = chunk(targets, PROBE_CONCURRENCY)
  let anyDirty = false
  for (const batch of batches) {
    const results = await probeBatch(batch)
    for (const result of results) {
      const proxy = db.proxies.find((p) => p.id === result.proxyId)
      if (!proxy) continue
      // 手动 refresh:总是 flush(用户期望看到最新延迟)
      const dirty = applyResult(proxy, result, true)
      if (dirty) {
        markProxyDirty(proxy.id)
        anyDirty = true
      }
    }
  }
  if (anyDirty) {
    await saveDatabase()
  }
}

// 单个代理手动 test
export async function testProxyById(
  proxyId: string,
): Promise<{ ok: boolean; latencyMs: number | null } | null> {
  const db = await getDatabase()
  const proxy = db.proxies.find((p) => p.id === proxyId)
  if (!proxy) return null
  const result = await probeProxy(proxy)
  const dirty = applyResult(proxy, result, true)
  if (dirty) {
    markProxyDirty(proxy.id)
    await saveDatabase()
  }
  return { ok: result.ok, latencyMs: result.latencyMs }
}

export function startProxyWorker(): void {
  if (proxyWorkerTimer) return
  // 启动后稍等 5s 跑首轮,避开 server 启动期 IO 抖动
  setTimeout(() => {
    void tickProxyWorker()
  }, 5_000)
  proxyWorkerTimer = setInterval(() => {
    void tickProxyWorker()
  }, TICK_MS)
}

export function stopProxyWorker(): void {
  if (proxyWorkerTimer) {
    clearInterval(proxyWorkerTimer)
    proxyWorkerTimer = null
  }
}
