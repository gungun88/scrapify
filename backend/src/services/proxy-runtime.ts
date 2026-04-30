import net from 'node:net'
import { getDatabase, saveDatabase } from './data-store'
import { clamp, formatTrafficGb, nowIso, parseTrafficGb } from './runtime-utils'

const PROXY_TICK_MS = 15_000
const PROXY_CONNECT_TIMEOUT_MS = 4_000

let proxyWorkerTimer: NodeJS.Timeout | null = null
let proxyWorkerBusy = false

type ProbeResult =
  | {
      status: 'online' | 'slow'
      latency: number
    }
  | {
      status: 'offline'
      latency: 0
    }

function probeTcpEndpoint(host: string, port: number) {
  return new Promise<ProbeResult>((resolve) => {
    const socket = new net.Socket()
    const startedAt = Date.now()
    let settled = false

    const finalize = (result: ProbeResult) => {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(PROXY_CONNECT_TIMEOUT_MS)

    socket.once('connect', () => {
      const latency = Math.max(1, Date.now() - startedAt)
      finalize({
        status: latency >= 320 ? 'slow' : 'online',
        latency,
      })
    })

    socket.once('timeout', () => finalize({ status: 'offline', latency: 0 }))
    socket.once('error', () => finalize({ status: 'offline', latency: 0 }))

    socket.connect(port, host)
  })
}

async function refreshProxyItems() {
  if (proxyWorkerBusy) {
    return
  }

  proxyWorkerBusy = true

  try {
    const db = await getDatabase()
    const checkedAt = Date.now()
    let changed = false

    for (const item of db.proxyItems) {
      const currentTraffic = parseTrafficGb(item.traffic)
      const result = await probeTcpEndpoint(item.ip, item.port)

      item.lastCheckedAt = nowIso(checkedAt)
      item.status = result.status

      if (result.status === 'offline') {
        item.consecutiveFailures += 1
        item.latency = 0
      } else {
        item.consecutiveFailures = 0
        item.latency = clamp(result.latency, result.status === 'slow' ? 320 : 1, result.status === 'slow' ? 5000 : 319)
        item.lastHeartbeatAt = nowIso(checkedAt)
      }

      const trafficIncrement = result.status === 'online' ? 0.2 : result.status === 'slow' ? 0.1 : 0
      item.traffic = formatTrafficGb(currentTraffic + trafficIncrement)
      changed = true
    }

    if (changed) {
      await saveDatabase()
    }
  } finally {
    proxyWorkerBusy = false
  }
}

export function startProxyWorker() {
  if (proxyWorkerTimer) {
    return
  }

  void refreshProxyItems()
  proxyWorkerTimer = setInterval(() => {
    void refreshProxyItems()
  }, PROXY_TICK_MS)
  proxyWorkerTimer.unref?.()
}

export function stopProxyWorker() {
  if (!proxyWorkerTimer) {
    return
  }

  clearInterval(proxyWorkerTimer)
  proxyWorkerTimer = null
}

export async function runProxyRefresh() {
  await refreshProxyItems()
}
