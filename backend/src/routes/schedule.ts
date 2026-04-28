import type { FastifyInstance } from 'fastify'
import { getDatabase, saveDatabase } from '../services/data-store'
import type { ScheduleJob } from '../types'

export async function registerScheduleRoutes(app: FastifyInstance) {
  app.get('/api/schedule', async (_request, reply) => {
    const db = await getDatabase()
    return reply.send(db.scheduleJobs)
  })

  app.patch<{ Params: { id: string }; Body: Partial<ScheduleJob> }>(
    '/api/schedule/:id',
    async (request, reply) => {
      const db = await getDatabase()
      const job = db.scheduleJobs.find((item) => item.id === request.params.id)

      if (!job) {
        return reply.status(404).send({ message: 'Schedule not found' })
      }

      Object.assign(job, request.body)
      await saveDatabase()

      return reply.send(job)
    },
  )
}
