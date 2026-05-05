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

      const csv = buildShopifyCsvContent(rows)
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
  if (format === 'csv') {
    // 与 Shopify 后台导出文件命名习惯保持一致
    return `products_export-${sanitizedId}.csv`
  }
  return `scrapify-${sanitizedId}.${format}`
}

// Shopify Admin → Products → Export 用的 CSV 模板列头（顺序固定，不能变）。
// 任何不能从采集结果填出的列都输出空字符串。
const SHOPIFY_CSV_COLUMNS: readonly string[] = [
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Product Category',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  'Option1 Linked To',
  'Option2 Name',
  'Option2 Value',
  'Option2 Linked To',
  'Option3 Name',
  'Option3 Value',
  'Option3 Linked To',
  'Variant SKU',
  'Variant Grams',
  'Variant Inventory Tracker',
  'Variant Inventory Qty',
  'Variant Inventory Policy',
  'Variant Fulfillment Service',
  'Variant Price',
  'Variant Compare At Price',
  'Variant Requires Shipping',
  'Variant Taxable',
  'Unit Price Total Measure',
  'Unit Price Total Measure Unit',
  'Unit Price Base Measure',
  'Unit Price Base Measure Unit',
  'Variant Barcode',
  'Image Src',
  'Image Position',
  'Image Alt Text',
  'Gift Card',
  'SEO Title',
  'SEO Description',
  'Google Shopping / Google Product Category',
  'Google Shopping / Gender',
  'Google Shopping / Age Group',
  'Google Shopping / MPN',
  'Google Shopping / Condition',
  'Google Shopping / Custom Product',
  'Google Shopping / Custom Label 0',
  'Google Shopping / Custom Label 1',
  'Google Shopping / Custom Label 2',
  'Google Shopping / Custom Label 3',
  'Google Shopping / Custom Label 4',
  'Variant Image',
  'Variant Weight Unit',
  'Variant Tax Code',
  'Cost per item',
  'Included / United States',
  'Price / United States',
  'Compare At Price / United States',
  'Status',
] as const

function pickString(row: TaskResultRow, key: string): string {
  const value = row[key]
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

function pickNumberAsString(row: TaskResultRow, key: string): string {
  const value = row[key]
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? String(numeric) : ''
  }
  return ''
}

function pickStringArray(row: TaskResultRow, key: string): string[] {
  const value = row[key]
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : typeof item === 'number' ? String(item) : ''))
      .filter((item) => item.length > 0)
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value]
  }
  return []
}

function deriveHandle(row: TaskResultRow): string {
  const handle = pickString(row, 'handle')
  if (handle) return handle

  const url = pickString(row, 'url')
  if (url) {
    const match = url.match(/\/products\/([^/?#]+)/i)
    if (match?.[1]) return match[1]
  }

  return pickString(row, 'id')
}

interface ShopifyRow {
  values: Record<string, string>
}

function buildShopifyRowsForProduct(row: TaskResultRow): ShopifyRow[] {
  const handle = deriveHandle(row)
  const title = pickString(row, 'title')
  const vendor = pickString(row, 'vendor')
  const sku = pickString(row, 'sku')
  const tags = pickStringArray(row, 'tags').join(', ')
  const inventory = pickNumberAsString(row, 'inventory') || '0'
  const price = pickNumberAsString(row, 'price')
  const compareAtPrice = pickNumberAsString(row, 'compareAtPrice')
  const images = pickStringArray(row, 'images')

  // 第一行：完整产品信息 + 第一张图（如有）
  const firstImage = images[0] ?? ''
  const baseRow: Record<string, string> = {
    Handle: handle,
    Title: title,
    'Body (HTML)': '',
    Vendor: vendor,
    'Product Category': '',
    Type: '',
    Tags: tags,
    Published: 'TRUE',
    'Option1 Name': 'Title',
    'Option1 Value': 'Default Title',
    'Option1 Linked To': '',
    'Option2 Name': '',
    'Option2 Value': '',
    'Option2 Linked To': '',
    'Option3 Name': '',
    'Option3 Value': '',
    'Option3 Linked To': '',
    'Variant SKU': sku,
    'Variant Grams': '0',
    'Variant Inventory Tracker': 'shopify',
    'Variant Inventory Qty': inventory,
    'Variant Inventory Policy': 'deny',
    'Variant Fulfillment Service': 'manual',
    'Variant Price': price,
    'Variant Compare At Price': compareAtPrice,
    'Variant Requires Shipping': 'TRUE',
    'Variant Taxable': 'TRUE',
    'Unit Price Total Measure': '',
    'Unit Price Total Measure Unit': '',
    'Unit Price Base Measure': '',
    'Unit Price Base Measure Unit': '',
    'Variant Barcode': '',
    'Image Src': firstImage,
    'Image Position': firstImage ? '1' : '',
    'Image Alt Text': '',
    'Gift Card': 'FALSE',
    'SEO Title': '',
    'SEO Description': '',
    'Google Shopping / Google Product Category': '',
    'Google Shopping / Gender': '',
    'Google Shopping / Age Group': '',
    'Google Shopping / MPN': '',
    'Google Shopping / Condition': '',
    'Google Shopping / Custom Product': '',
    'Google Shopping / Custom Label 0': '',
    'Google Shopping / Custom Label 1': '',
    'Google Shopping / Custom Label 2': '',
    'Google Shopping / Custom Label 3': '',
    'Google Shopping / Custom Label 4': '',
    'Variant Image': '',
    'Variant Weight Unit': 'kg',
    'Variant Tax Code': '',
    'Cost per item': '',
    'Included / United States': 'TRUE',
    'Price / United States': '',
    'Compare At Price / United States': '',
    Status: 'draft',
  }

  const rows: ShopifyRow[] = [{ values: baseRow }]

  // 多张图：后续行只填 Handle + Image Src + Image Position（Shopify 模板规范）
  for (let index = 1; index < images.length; index += 1) {
    const extra: Record<string, string> = {}
    for (const column of SHOPIFY_CSV_COLUMNS) {
      extra[column] = ''
    }
    extra.Handle = handle
    extra['Image Src'] = images[index]
    extra['Image Position'] = String(index + 1)
    rows.push({ values: extra })
  }

  return rows
}

function buildShopifyCsvContent(rows: TaskResultRow[]) {
  const lines: string[] = [SHOPIFY_CSV_COLUMNS.map((column) => escapeCsvValue(column)).join(',')]

  for (const row of rows) {
    const shopifyRows = buildShopifyRowsForProduct(row)
    for (const shopifyRow of shopifyRows) {
      const cells = SHOPIFY_CSV_COLUMNS.map((column) => escapeCsvValue(shopifyRow.values[column] ?? ''))
      lines.push(cells.join(','))
    }
  }

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
