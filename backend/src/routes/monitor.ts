import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { getDatabase, saveDatabase } from '../services/data-store'
import { runMonitorRefresh } from '../services/monitor-runtime'
import type { MonitorItem } from '../types'

interface CreateMonitorBody {
  url?: unknown
  site?: unknown
  currency?: unknown
}

const ALLOWED_CURRENCIES = new Set(['$', '€', '£', '¥'])

function deriveSiteFromUrl(parsed: URL) {
  const host = parsed.hostname.replace(/^www\./i, '')
  if (!host) {
    return parsed.hostname || 'Unknown'
  }

  const [name] = host.split('.')
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : host
}

export async function registerMonitorRoutes(app: FastifyInstance) {
  app.get('/api/monitor', async (_request, reply) => {
    const db = await getDatabase()
    return reply.send(db.monitorItems)
  })

  app.post('/api/monitor/refresh', async (_request, reply) => {
    await runMonitorRefresh()
    const db = await getDatabase()
    return reply.send(db.monitorItems)
  })

  app.post<{ Body: CreateMonitorBody }>('/api/monitor', async (request, reply) => {
    const body = request.body || {}
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''

    if (!rawUrl) {
      return reply.status(400).send({ message: 'Monitor URL is required.' })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
    } catch {
      return reply.status(400).send({ message: 'Monitor URL is invalid.' })
    }

    const rawSite = typeof body.site === 'string' ? body.site.trim() : ''
    const rawCurrency = typeof body.currency === 'string' ? body.currency.trim() : ''
    const currency = rawCurrency && ALLOWED_CURRENCIES.has(rawCurrency) ? rawCurrency : '$'

    const item: MonitorItem = {
      id: `monitor-${randomUUID().slice(0, 8)}`,
      site: rawSite || deriveSiteFromUrl(parsedUrl),
      url: parsedUrl.toString(),
      price: 0,
      currency,
      change: 0,
      status: 'stable',
      history: [],
      lastCheckedAt: null,
    }

    const db = await getDatabase()
    db.monitorItems.unshift(item)
    await saveDatabase()

    void runMonitorRefresh().catch(() => undefined)

    return reply.status(201).send(item)
  })

  app.delete<{ Params: { id: string } }>('/api/monitor/:id', async (request, reply) => {
    const db = await getDatabase()
    const index = db.monitorItems.findIndex((item) => item.id === request.params.id)

    if (index === -1) {
      return reply.status(404).send({ message: 'Monitor item not found.' })
    }

    db.monitorItems.splice(index, 1)
    await saveDatabase()

    return reply.status(204).send()
  })
}
