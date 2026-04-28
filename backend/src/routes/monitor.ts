import type { FastifyInstance } from 'fastify'
import { getDatabase } from '../services/data-store'

export async function registerMonitorRoutes(app: FastifyInstance) {
  app.get('/api/monitor', async (_request, reply) => {
    const db = await getDatabase()
    return reply.send(db.monitorItems)
  })
}
