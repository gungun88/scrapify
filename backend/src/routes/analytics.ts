import type { FastifyInstance } from 'fastify'
import { getDatabase } from '../services/data-store'
import { buildAnalyticsSnapshot } from '../services/analytics-builder'

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get('/api/analytics', async (_request, reply) => {
    const db = await getDatabase()
    return reply.send(buildAnalyticsSnapshot(db))
  })
}
