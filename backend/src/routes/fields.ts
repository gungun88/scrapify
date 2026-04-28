import type { FastifyInstance } from 'fastify'
import { getDatabase, saveDatabase } from '../services/data-store'
import type { FieldConfig } from '../types'

function isFieldConfigArray(body: unknown): body is FieldConfig[] {
  return Array.isArray(body)
}

export async function registerFieldRoutes(app: FastifyInstance) {
  app.get('/api/fields', async (_request, reply) => {
    const db = await getDatabase()
    return reply.send(db.fieldConfigs)
  })

  app.put('/api/fields', async (request, reply) => {
    if (!isFieldConfigArray(request.body)) {
      return reply.status(400).send({ message: 'Invalid field config payload' })
    }

    const db = await getDatabase()
    db.fieldConfigs = request.body
    await saveDatabase()
    return reply.send(db.fieldConfigs)
  })
}
