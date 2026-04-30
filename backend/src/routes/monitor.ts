import type { FastifyInstance } from 'fastify'
import { getDatabase } from '../services/data-store'
import { runMonitorRefresh } from '../services/monitor-runtime'

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
}
