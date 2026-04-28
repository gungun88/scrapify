import type { FastifyInstance } from 'fastify'

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'scrapify-backend',
    timestamp: new Date().toISOString(),
  }))
}
