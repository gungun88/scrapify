import type { FastifyInstance } from 'fastify'
import { getDatabase, saveDatabase } from '../services/data-store'
import { refreshScheduleJob } from '../services/schedule-runtime'
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

      if (typeof request.body?.enabled === 'boolean' || typeof request.body?.cron === 'string' || request.body?.taskTemplate) {
        refreshScheduleJob(job)
      }

      await saveDatabase()

      return reply.send(job)
    },
  )
}
