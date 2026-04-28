import type { FastifyInstance } from 'fastify'
import { getDatabase, saveDatabase } from '../services/data-store'
import { advanceTask, createRuntimeTask, toTask } from '../services/task-runtime'
import type { NewTaskForm, Task } from '../types'

function isValidNewTaskForm(body: unknown): body is NewTaskForm {
  if (!body || typeof body !== 'object') {
    return false
  }

  const value = body as Record<string, unknown>

  return (
    typeof value.url === 'string' &&
    typeof value.mode === 'string' &&
    typeof value.region === 'string' &&
    Array.isArray(value.fields) &&
    typeof value.concurrency === 'number' &&
    typeof value.delay === 'string'
  )
}

export async function registerTaskRoutes(app: FastifyInstance) {
  app.get('/api/tasks', async (_request, reply) => {
    const db = await getDatabase()
    db.tasks.forEach(advanceTask)
    return reply.send(db.tasks.map(toTask))
  })

  app.post('/api/tasks', async (request, reply) => {
    if (!isValidNewTaskForm(request.body)) {
      return reply.status(400).send({ message: 'Invalid task payload' })
    }

    if (!request.body.url.trim()) {
      return reply.status(400).send({ message: 'Task URL is required' })
    }

    const db = await getDatabase()
    const task = createRuntimeTask(request.body)
    db.tasks.unshift(task)
    await saveDatabase()

    return reply.status(201).send(toTask(task))
  })

  app.patch<{ Params: { id: string }; Body: Partial<Task> }>('/api/tasks/:id', async (request, reply) => {
    const db = await getDatabase()
    const task = db.tasks.find((item) => item.id === request.params.id)

    if (!task) {
      return reply.status(404).send({ message: 'Task not found' })
    }

    if (typeof request.body.url === 'string') {
      task.url = request.body.url
    }

    if (typeof request.body.progress === 'number') {
      task.progress = Math.max(0, Math.min(100, request.body.progress))
    }

    if (typeof request.body.itemCount === 'number') {
      task.itemCount = Math.max(0, request.body.itemCount)
    }

    if (typeof request.body.status === 'string') {
      task.status = request.body.status
    }

    if (typeof request.body.elapsed === 'string') {
      task.elapsed = request.body.elapsed
    }

    task.updatedAtMs = Date.now()
    await saveDatabase()

    return reply.send(toTask(task))
  })
}
