import type { FastifyInstance } from 'fastify'
import { getDatabase, saveDatabase } from '../services/data-store'
import { applyTaskPatch, createRuntimeTask, toTask, toTaskDetail } from '../services/task-runtime'
import type { NewTaskForm, TaskDetail, TaskResultRow, TaskRuntimeRecord } from '../types'

type TaskExportFormat = 'csv' | 'json'

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
    return reply.send(db.tasks.map(toTask))
  })

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const db = await getDatabase()
    const task = db.tasks.find((item) => item.id === request.params.id)

    if (!task) {
      return reply.status(404).send({ message: 'Task not found' })
    }

    return reply.send(toTaskDetail(task))
  })

  app.get<{ Params: { id: string } }>('/api/tasks/:id/logs', async (request, reply) => {
    const db = await getDatabase()
    const task = db.tasks.find((item) => item.id === request.params.id)

    if (!task) {
      return reply.status(404).send({ message: 'Task not found' })
    }

    return reply.send(task.logs)
  })

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    '/api/tasks/:id/export',
    async (request, reply) => {
      const db = await getDatabase()
      const task = db.tasks.find((item) => item.id === request.params.id)

      if (!task) {
        return reply.status(404).send({ message: 'Task not found' })
      }

      const format = normalizeExportFormat(request.query?.format)

      if (!format) {
        return reply.status(400).send({ message: 'Unsupported export format. Use csv or json.' })
      }

      const rows = getTaskExportRows(task)

      if (rows.length === 0) {
        return reply.status(409).send({ message: 'Task result is not available for export yet.' })
      }

      const exportedAt = new Date().toISOString()
      if (task.result) {
        task.result.exportedAt = exportedAt
        await saveDatabase()
      }

      const isPartialExport = task.resultItems.length === 0 && task.result?.preview.length
      const filename = buildTaskExportFilename(task, format)

      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      reply.header('X-Scrapify-Export-Partial', isPartialExport ? 'true' : 'false')

      if (format === 'json') {
        reply.type('application/json; charset=utf-8')
        return reply.send({
          taskId: task.id,
          url: task.url,
          source: task.result?.source ?? null,
          exportedAt,
          partial: Boolean(isPartialExport),
          itemCount: rows.length,
          items: rows,
        })
      }

      const csv = buildCsvContent(rows)
      reply.type('text/csv; charset=utf-8')
      return reply.send(`\uFEFF${csv}`)
    },
  )

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

  app.patch<{ Params: { id: string }; Body: Partial<TaskDetail> }>('/api/tasks/:id', async (request, reply) => {
    const db = await getDatabase()
    const task = db.tasks.find((item) => item.id === request.params.id)

    if (!task) {
      return reply.status(404).send({ message: 'Task not found' })
    }

    const changed = applyTaskPatch(task, request.body || {})

    if (changed) {
      await saveDatabase()
    }

    return reply.send(toTaskDetail(task))
  })
}

function normalizeExportFormat(value: string | undefined): TaskExportFormat | null {
  if (value === 'csv' || value === 'json') {
    return value
  }

  if (!value) {
    return 'csv'
  }

  return null
}

function getTaskExportRows(task: TaskRuntimeRecord): TaskResultRow[] {
  if (task.resultItems.length > 0) {
    return task.resultItems.map((row) => ({ ...row }))
  }

  if (task.result?.preview.length) {
    return task.result.preview.map((row) => ({ ...row }))
  }

  return []
}

function buildTaskExportFilename(task: TaskRuntimeRecord, format: TaskExportFormat) {
  const sanitizedId = task.id.replace(/[^a-zA-Z0-9-_]/g, '-')
  return `scrapify-${sanitizedId}.${format}`
}

function buildCsvContent(rows: TaskResultRow[]) {
  const headers = rows.reduce<string[]>((result, row) => {
    for (const key of Object.keys(row)) {
      if (!result.includes(key)) {
        result.push(key)
      }
    }

    return result
  }, [])

  const lines = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(formatCsvCell(row[header]))).join(',')),
  ]

  return lines.join('\n')
}

function formatCsvCell(value: TaskResultRow[string]) {
  if (Array.isArray(value)) {
    return value.join(' | ')
  }

  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}
