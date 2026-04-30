import type { FastifyInstance } from 'fastify'
import { getDatabase } from '../services/data-store'
import { runProxyRefresh } from '../services/proxy-runtime'

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
}
