import type { FastifyInstance } from 'fastify'

export async function registerUserRoutes(app: FastifyInstance) {
  app.get('/api/me', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ message: 'Not authenticated' })
    }

    return reply.send({
      id: request.user.id,
      email: request.user.email,
      displayName: request.user.displayName,
      imageUrl: request.user.imageUrl,
    })
  })
}
