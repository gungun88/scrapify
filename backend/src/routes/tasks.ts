import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getDatabase, markTaskDirty, saveDatabase } from '../services/data-store'
import { createRuntimeTask, toTask } from '../services/task-runtime'
import { assertPublicHostname, SsrfBlockedError } from '../services/url-guard'
import type { DatabaseShape, NewTaskForm, TaskResultRow, TaskRuntimeRecord } from '../types'

type TaskExportFormat = 'csv' | 'json'

const MAX_TASK_URL_LENGTH = 2048

function normalizeNewTaskForm(body: unknown): NewTaskForm | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const value = body as Record<string, unknown>

  if (typeof value.url !== 'string' || value.url.length > MAX_TASK_URL_LENGTH) {
    return null
  }

  // platform 容错:不传 / 非字符串 / 空串 都默认 'auto',createRuntimeTask 会再兜一次
  const platform =
    typeof value.platform === 'string' && value.platform.trim() ? value.platform : 'auto'

  // catalogLimit 容错:接受 number > 0 / 'all' / 其它 → null(等价于无限制)
  // 'all' 在前端是显式选项,后端统一存 null(便于 collector 用 `limit ?? Infinity` 判断)
  let catalogLimit: NewTaskForm['catalogLimit'] = null
  if (typeof value.catalogLimit === 'number' && value.catalogLimit > 0) {
    catalogLimit = Math.floor(value.catalogLimit)
  } else if (value.catalogLimit === 'all') {
    catalogLimit = 'all'
  }

  return { url: value.url, platform, catalogLimit }
}

function findUserTask(db: DatabaseShape, userId: string, taskId: string) {
  return db.tasks.find((task) => task.id === taskId && task.userId === userId)
}

function userIdOf(request: FastifyRequest): string {
  if (!request.user) {
    throw new Error('requireUser hook did not run before tasks route')
  }
  return request.user.id
}

export async function registerTaskRoutes(app: FastifyInstance) {
  // 前端每 2s 轮询一次,30/min/user 是基础需求。120 留足 +UI 切换 +多页打开的余量。
  app.get(
    '/api/tasks',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = userIdOf(request)
      const db = await getDatabase()
      return reply.send(db.tasks.filter((task) => task.userId === userId).map(toTask))
    },
  )

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const userId = userIdOf(request)
    const db = await getDatabase()
    const task = findUserTask(db, userId, request.params.id)

    if (!task) {
      return reply.status(404).send({ message: 'Task not found' })
    }

    return reply.send(toTask(task))
  })

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    '/api/tasks/:id/export',
    async (request, reply) => {
      const userId = userIdOf(request)
      const db = await getDatabase()
      const task = findUserTask(db, userId, request.params.id)

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
        markTaskDirty(task.id)
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
      return reply.send(`﻿${csv}`)
    },
  )

  app.post(
    '/api/tasks',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const form = normalizeNewTaskForm(request.body)
    if (!form) {
      return reply.status(400).send({ message: 'Invalid task payload' })
    }

    if (!form.url.trim()) {
      return reply.status(400).send({ message: 'Task URL is required' })
    }

    // SSRF 入口校验:解析 hostname → 私网/保留段拒绝 → DNS 解析二次校验。
    // 不让坏 URL 进 worker 执行队列。
    let parsedUrl: URL
    try {
      parsedUrl = new URL(form.url.trim().startsWith('http') ? form.url.trim() : `https://${form.url.trim()}`)
    } catch {
      return reply.status(400).send({ message: 'Invalid task URL' })
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return reply.status(400).send({ message: 'Only http/https URLs are allowed' })
    }
    try {
      await assertPublicHostname(parsedUrl.hostname)
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        return reply.status(400).send({ message: `URL not allowed: ${error.message}` })
      }
      throw error
    }

    const userId = userIdOf(request)
    const db = await getDatabase()
    const task = createRuntimeTask(form, userId)
    db.tasks.unshift(task)
    markTaskDirty(task.id)
    await saveDatabase()

    return reply.status(201).send(toTask(task))
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
// 按 products_export.csv（85 列）严格对齐，含 28 个 metafields 自定义列。
// 这些 metafields 列采集填不出，全部输出空字符串。
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
  'Material (product.metafields.custom.material)',
  'shippingLabel (product.metafields.custom.shippinglabel)',
  'EComposer product countdown end at (product.metafields.ecomposer.countdown)',
  'EComposer product countdown start at (product.metafields.ecomposer.countdown_from)',
  'product_highlights (product.metafields.google_feed.product_highlights)',
  'Google: Custom Product (product.metafields.mm-google-shopping.custom_product)',
  'Product rating count (product.metafields.reviews.rating_count)',
  'Backrest type (product.metafields.shopify.backrest-type)',
  'Color (product.metafields.shopify.color-pattern)',
  'Door glass finish (product.metafields.shopify.door-glass-finish)',
  'Door material (product.metafields.shopify.door-material)',
  'Features (product.metafields.shopify.features)',
  'Furniture/Fixture features (product.metafields.shopify.furniture-fixture-features)',
  'Furniture/Fixture material (product.metafields.shopify.furniture-fixture-material)',
  'Hardware material (product.metafields.shopify.hardware-material)',
  'Leg color (product.metafields.shopify.leg-color)',
  'Leg material (product.metafields.shopify.leg-material)',
  'Mounting type (product.metafields.shopify.mounting-type)',
  'Seat type (product.metafields.shopify.seat-type)',
  'Style (product.metafields.shopify.style)',
  'Suitable location (product.metafields.shopify.suitable-location)',
  'Tabletop color (product.metafields.shopify.tabletop-color)',
  'Tabletop material (product.metafields.shopify.tabletop-material)',
  'Tabletop shape (product.metafields.shopify.tabletop-shape)',
  'Complementary products (product.metafields.shopify--discovery--product_recommendation.complementary_products)',
  'Related products (product.metafields.shopify--discovery--product_recommendation.related_products)',
  'Related products settings (product.metafields.shopify--discovery--product_recommendation.related_products_display)',
  'Search product boosts (product.metafields.shopify--discovery--product_search_boost.queries)',
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

function escapeCsvValue(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}
