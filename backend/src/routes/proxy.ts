import type { FastifyInstance } from 'fastify'
import { getDatabase } from '../services/data-store'

export async function registerProxyRoutes(app: FastifyInstance) {
  app.get('/api/proxy', async (_request, reply) => {
    const db = await getDatabase()
    return reply.send(db.proxyItems)
  })
}
