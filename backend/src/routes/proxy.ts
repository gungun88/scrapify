import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { getDatabase, saveDatabase } from '../services/data-store'
import { runProxyRefresh } from '../services/proxy-runtime'
import type { ProxyItem } from '../types'

interface CreateProxyBody {
  ip?: unknown
  port?: unknown
  country?: unknown
  flag?: unknown
}

function isValidPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535
}

function isValidIpString(value: string) {
  // Loose check: non-empty, must contain dot or colon, no whitespace.
  return /^[A-Za-z0-9.:_-]+$/.test(value) && (value.includes('.') || value.includes(':'))
}

export async function registerProxyRoutes(app: FastifyInstance) {
  app.get('/api/proxy', async (_request, reply) => {
    const db = await getDatabase()
    return reply.send(db.proxyItems)
  })

  app.post('/api/proxy/refresh', async (_request, reply) => {
    await runProxyRefresh()
    const db = await getDatabase()
    return reply.send(db.proxyItems)
  })

  app.post<{ Body: CreateProxyBody }>('/api/proxy', async (request, reply) => {
    const body = request.body || {}
    const rawIp = typeof body.ip === 'string' ? body.ip.trim() : ''

    if (!rawIp || !isValidIpString(rawIp)) {
      return reply.status(400).send({ message: 'Proxy IP is invalid.' })
    }

    if (!isValidPort(body.port)) {
      return reply.status(400).send({ message: 'Proxy port must be an integer between 1 and 65535.' })
    }

    const country = typeof body.country === 'string' && body.country.trim() ? body.country.trim() : 'Unknown'
    const flag = typeof body.flag === 'string' && body.flag.trim() ? body.flag.trim().toUpperCase().slice(0, 4) : '--'

    const item: ProxyItem = {
      id: `proxy-${randomUUID().slice(0, 8)}`,
      ip: rawIp,
      port: body.port,
      country,
      flag,
      latency: 0,
      traffic: '0 GB',
      status: 'offline',
      lastCheckedAt: null,
      lastHeartbeatAt: null,
      consecutiveFailures: 0,
    }

    const db = await getDatabase()
    db.proxyItems.unshift(item)
    await saveDatabase()

    void runProxyRefresh().catch(() => undefined)

    return reply.status(201).send(item)
  })

  app.delete<{ Params: { id: string } }>('/api/proxy/:id', async (request, reply) => {
    const db = await getDatabase()
    const index = db.proxyItems.findIndex((item) => item.id === request.params.id)

    if (index === -1) {
      return reply.status(404).send({ message: 'Proxy item not found.' })
    }

    db.proxyItems.splice(index, 1)
    await saveDatabase()

    return reply.status(204).send()
  })
}
