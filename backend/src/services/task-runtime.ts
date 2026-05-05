import { randomUUID } from 'node:crypto'
import { formatElapsed } from '../data/seed'
import type {
  NewTaskForm,
  Task,
  TaskDetail,
  TaskFailureDetail,
  TaskLogEntry,
  TaskResultRow,
  TaskRunRecord,
  TaskRuntimeRecord,
} from '../types'
import { getDatabase, saveDatabase } from './data-store'
import { extractNextDataPayload } from './runtime-utils'

const TASK_TICK_MS = 3000
const TASK_QUEUE_DELAY_MS = 1500
const TASK_WORKER_ID = 'local-worker-1'
const MAX_ACTIVE_TASKS = 2
const SHOPIFY_PAGE_LIMIT = 250
const SHOPIFY_MAX_PAGES = 12
const REQUEST_TIMEOUT_MS = 15_000
const RESULT_PREVIEW_LIMIT = 5
const RUN_HISTORY_LIMIT = 10
const FAILURE_HISTORY_LIMIT = 10
const WOOCOMMERCE_PAGE_LIMIT = 100
const WOOCOMMERCE_MAX_PAGES = 5
const SITEMAP_MAX_URLS = 25
const SITEMAP_INDEX_BRANCH_LIMIT = 3
const PRODUCT_URL_PATTERN = /\/products?\//i

let taskWorkerTimer: NodeJS.Timeout | null = null
let taskWorkerBusy = false
const activeExecutions = new Map<string, Promise<void>>()

interface ShopifyVariant {
  sku?: string | null
  price?: string | number | null
  compare_at_price?: string | number | null
  inventory_quantity?: number | null
}

interface ShopifyImage {
  src?: string | null
}

interface ShopifyProduct {
  id?: number | string
  handle?: string
  title?: string
  vendor?: string | null
  tags?: string
  images?: ShopifyImage[]
  image?: ShopifyImage | null
  variants?: ShopifyVariant[]
}

interface ShopifyProductsResponse {
  products?: ShopifyProduct[]
}

interface GenericCollectedProduct {
  id: string
  handle: string
  url: string
  title: string | null
  sku: string | null
  price: number | null
  compareAtPrice: number | null
  images: string[]
  inventory: number | null
  tags: string[]
  vendor: string | null
}

function nowIso(now: number) {
  return new Date(now).toISOString()
}

export function createTaskLog(level: TaskLogEntry['level'], message: string, atMs = Date.now()): TaskLogEntry {
  return {
    id: `log-${randomUUID().slice(0, 8)}`,
    at: nowIso(atMs),
    level,
    message,
  }
}

function createFailureDetail(code: string, message: string, atMs: number): TaskFailureDetail {
  return {
    at: nowIso(atMs),
    code,
    message,
  }
}

function createRunRecord(source: string, atMs: number): TaskRunRecord {
  return {
    id: `run-${randomUUID().slice(0, 8)}`,
    source,
    startedAt: nowIso(atMs),
    finishedAt: null,
    status: 'running',
    itemCount: 0,
    pageCount: 0,
    errorMessage: null,
  }
}

function getActiveRun(record: TaskRuntimeRecord) {
  if (!record.activeRunId) {
    return null
  }

  return record.runHistory.find((run) => run.id === record.activeRunId) ?? null
}

function beginTaskRun(record: TaskRuntimeRecord, source: string, atMs: number) {
  const run = createRunRecord(source, atMs)
  record.activeRunId = run.id
  record.runHistory = [run, ...record.runHistory.filter((item) => item.id !== run.id)].slice(0, RUN_HISTORY_LIMIT)
}

function updateActiveRun(record: TaskRuntimeRecord, patch: Partial<Omit<TaskRunRecord, 'id' | 'source' | 'startedAt'>>) {
  const run = getActiveRun(record)

  if (!run) {
    return
  }

  Object.assign(run, patch)
}

function updateActiveRunSource(record: TaskRuntimeRecord, source: string) {
  const run = getActiveRun(record)
  if (!run) {
    return
  }

  run.source = source
}

function appendLog(record: TaskRuntimeRecord, level: TaskLogEntry['level'], message: string, atMs = Date.now()) {
  record.logs.push(createTaskLog(level, message, atMs))

  if (record.logs.length > 200) {
    record.logs = record.logs.slice(-200)
  }
}

export function toTask(record: TaskRuntimeRecord): Task {
  return {
    id: record.id,
    url: record.url,
    status: record.status,
    progress: record.status === 'done' ? 100 : record.progress,
    itemCount: record.status === 'pending' ? 0 : record.itemCount,
    elapsed: record.elapsed,
    createdAt: record.createdAt,
  }
}

export function toTaskDetail(record: TaskRuntimeRecord): TaskDetail {
  return {
    ...toTask(record),
    mode: record.mode,
    region: record.region,
    fields: [...record.fields],
    concurrency: record.concurrency,
    delay: record.delay,
    targetCount: record.targetCount,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    errorMessage: record.errorMessage,
    workerId: record.workerId,
    lastHeartbeatAt: record.lastHeartbeatAt,
    result: record.result
      ? {
          ...record.result,
          preview: record.result.preview.map((row) => ({ ...row })),
        }
      : null,
    failureDetails: record.failureDetails.map((detail) => ({ ...detail })),
    runHistory: record.runHistory.map((run) => ({ ...run })),
  }
}

export function estimateTargetCount(form: NewTaskForm) {
  const fieldMultiplier = Math.max(form.fields.length, 1) * 110
  const concurrencyMultiplier = form.concurrency * 75
  const modeBonus = form.mode === 'full' ? 820 : form.mode === 'incremental' ? 520 : 280
  return modeBonus + fieldMultiplier + concurrencyMultiplier
}

export function createRuntimeTask(form: NewTaskForm): TaskRuntimeRecord {
  const now = Date.now()

  return {
    id: `task-${randomUUID().slice(0, 8)}`,
    url: form.url.trim(),
    status: 'pending',
    progress: 0,
    itemCount: 0,
    elapsed: '0s',
    createdAt: nowIso(now),
    mode: form.mode,
    region: form.region,
    fields: form.fields,
    concurrency: form.concurrency,
    delay: form.delay,
    targetCount: estimateTargetCount(form),
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    workerId: null,
    lastHeartbeatAt: null,
    result: null,
    failureDetails: [],
    runHistory: [],
    startedAtMs: now,
    updatedAtMs: now,
    logs: [createTaskLog('info', 'Task queued.', now)],
    resultItems: [],
    activeRunId: null,
  }
}

function resetExecutionState(record: TaskRuntimeRecord, atMs: number) {
  record.progress = 0
  record.itemCount = 0
  record.elapsed = '0s'
  record.startedAt = null
  record.finishedAt = null
  record.errorMessage = null
  record.workerId = null
  record.lastHeartbeatAt = null
  record.result = null
  record.resultItems = []
  record.activeRunId = null
  record.startedAtMs = atMs
  record.updatedAtMs = atMs
}

function markTaskRunning(record: TaskRuntimeRecord, now: number) {
  record.status = 'running'
  record.startedAt = nowIso(now)
  record.startedAtMs = now
  record.updatedAtMs = now
  record.elapsed = '0s'
  record.workerId = TASK_WORKER_ID
  record.lastHeartbeatAt = nowIso(now)
  record.errorMessage = null
  beginTaskRun(record, 'auto-collector', now)
  appendLog(record, 'info', `Worker ${TASK_WORKER_ID} claimed task.`, now)
}

function markTaskDone(record: TaskRuntimeRecord, now: number) {
  record.status = 'done'
  record.progress = 100
  record.itemCount = record.resultItems.length
  record.targetCount = Math.max(record.resultItems.length, 1)
  record.finishedAt = nowIso(now)
  record.elapsed = formatElapsed(Math.max(0, now - record.startedAtMs))
  record.workerId = null
  record.lastHeartbeatAt = nowIso(now)
  updateActiveRun(record, {
    status: 'done',
    finishedAt: record.finishedAt,
    itemCount: record.itemCount,
    pageCount: record.result?.pageCount ?? getActiveRun(record)?.pageCount ?? 0,
    errorMessage: null,
  })
  record.activeRunId = null
  appendLog(record, 'info', 'Task completed.', now)
}

function markTaskError(record: TaskRuntimeRecord, now: number, message: string, code = 'task-error') {
  record.status = 'error'
  record.finishedAt = nowIso(now)
  record.errorMessage = message
  record.workerId = null
  record.lastHeartbeatAt = nowIso(now)
  record.elapsed = formatElapsed(Math.max(0, now - record.startedAtMs))
  record.failureDetails = [createFailureDetail(code, message, now), ...record.failureDetails].slice(0, FAILURE_HISTORY_LIMIT)
  updateActiveRun(record, {
    status: 'error',
    finishedAt: record.finishedAt,
    itemCount: record.itemCount,
    pageCount: getActiveRun(record)?.pageCount ?? 0,
    errorMessage: message,
  })
  record.activeRunId = null
  appendLog(record, 'error', message, now)
}

function updateRunningHeartbeat(record: TaskRuntimeRecord, now: number) {
  if (record.status !== 'running') {
    return false
  }

  const nextElapsed = formatElapsed(Math.max(0, now - record.startedAtMs))
  const nextHeartbeat = nowIso(now)
  let changed = false

  if (record.elapsed !== nextElapsed) {
    record.elapsed = nextElapsed
    changed = true
  }

  if (record.lastHeartbeatAt !== nextHeartbeat) {
    record.lastHeartbeatAt = nextHeartbeat
    changed = true
  }

  record.updatedAtMs = now
  return changed
}

function parseDelayMs(delay: string) {
  const rangeMatch = delay.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)s/i)
  if (rangeMatch) {
    return Math.max(200, Math.round(Number(rangeMatch[1]) * 1000))
  }

  const singleMatch = delay.match(/(\d+(?:\.\d+)?)\s*s/i)
  if (singleMatch) {
    return Math.max(200, Math.round(Number(singleMatch[1]) * 1000))
  }

  return 1000
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function stripTags(value: string) {
  return decodeHtml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value !== 'string') {
    return null
  }

  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) {
    return null
  }

  const numeric = Number(match[0])
  return Number.isFinite(numeric) ? numeric : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

function pickNumber(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = extractNumber(value[key])
    if (candidate !== null) {
      return candidate
    }
  }

  return null
}

function collectStringValues(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()]
  }

  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function toAbsoluteUrl(origin: string, value: string) {
  try {
    return new URL(value, origin).toString()
  } catch {
    return null
  }
}

function extractHandleFromUrl(url: string) {
  const match = url.match(/\/products\/([^/?#]+)/i)
  return match?.[1] ?? ''
}

function collectImageUrls(origin: string, value: unknown): string[] {
  if (!value) {
    return []
  }

  const input = Array.isArray(value) ? value : [value]
  const images: string[] = []

  for (const item of input) {
    if (typeof item === 'string') {
      const url = toAbsoluteUrl(origin, item)
      if (url) {
        images.push(url)
      }
      continue
    }

    if (!isRecord(item)) {
      continue
    }

    const urlValue = pickString(item, ['src', 'url', 'imageUrl', 'large', 'small'])
    if (!urlValue) {
      continue
    }

    const url = toAbsoluteUrl(origin, urlValue)
    if (url) {
      images.push(url)
    }
  }

  return [...new Set(images)]
}

function extractOfferPrices(value: unknown) {
  if (!value) {
    return {
      price: null as number | null,
      compareAtPrice: null as number | null,
    }
  }

  const offers = Array.isArray(value) ? value : [value]
  let price: number | null = null
  let compareAtPrice: number | null = null

  for (const offer of offers) {
    if (!isRecord(offer)) {
      continue
    }

    price =
      price ??
      pickNumber(offer, ['price', 'salePrice', 'currentPrice', 'lowPrice', 'highPrice', 'amount', 'value'])

    compareAtPrice =
      compareAtPrice ?? pickNumber(offer, ['compareAtPrice', 'originalPrice', 'regularPrice', 'highPrice'])
  }

  return {
    price,
    compareAtPrice,
  }
}

function normalizeGenericProduct(product: Omit<GenericCollectedProduct, 'id' | 'handle'> & { id?: string; handle?: string }) {
  const handle = product.handle || extractHandleFromUrl(product.url)
  const id = product.id || handle || product.url || `product-${randomUUID().slice(0, 8)}`

  return {
    ...product,
    id,
    handle,
  }
}

function extractGenericProductFromRecord(value: Record<string, unknown>, origin: string) {
  const directUrl = pickString(value, ['url', 'productUrl', 'canonicalUrl', 'link', '@id'])
  const absoluteUrl = directUrl ? toAbsoluteUrl(origin, directUrl) : null
  const directHandle = pickString(value, ['handle', 'slug'])
  const title = pickString(value, ['title', 'name', 'productName'])
  const directPrice = pickNumber(value, ['price', 'salePrice', 'currentPrice', 'finalPrice', 'regularPrice'])
  const directCompareAtPrice = pickNumber(value, ['compareAtPrice', 'originalPrice', 'wasPrice'])
  const offerPrices = extractOfferPrices(value.offers)
  const images = collectImageUrls(origin, value.images ?? value.image ?? value.gallery ?? value.media)
  const vendor =
    pickString(value, ['vendor', 'brand', 'designer', 'manufacturer']) ??
    (isRecord(value.brand) ? pickString(value.brand, ['name']) : null) ??
    (isRecord(value.designer) ? pickString(value.designer, ['name']) : null) ??
    (isRecord(value.seller) ? pickString(value.seller, ['name']) : null)
  const tags = [
    ...collectStringValues(value.tags),
    ...collectStringValues(value.category),
    ...collectStringValues(value.categories),
  ]
  const sku = pickString(value, ['sku', 'mpn', 'styleCode', 'productCode'])
  const inventory = pickNumber(value, ['inventory', 'inventoryQuantity', 'stock', 'qty'])
  const typeValue = collectStringValues(value['@type']).join(' ').toLowerCase()
  const price = directPrice ?? offerPrices.price
  const compareAtPrice = directCompareAtPrice ?? offerPrices.compareAtPrice
  const url = absoluteUrl ?? (directHandle ? `${origin}/products/${directHandle}` : '')
  const isProductLike =
    Boolean(title) &&
    (price !== null || Boolean(url) || Boolean(directHandle) || images.length > 0 || typeValue.includes('product'))

  if (!isProductLike || !url) {
    return null
  }

  return normalizeGenericProduct({
    id: pickString(value, ['id', 'productId']) ?? sku ?? undefined,
    handle: directHandle ?? undefined,
    url,
    title,
    sku,
    price,
    compareAtPrice,
    images,
    inventory,
    tags: [...new Set(tags)],
    vendor,
  })
}

function dedupeGenericProducts(items: GenericCollectedProduct[]) {
  const unique = new Map<string, GenericCollectedProduct>()

  for (const item of items) {
    const key = item.url || item.handle || item.id
    const existing = unique.get(key)
    if (!existing || (existing.images.length === 0 && item.images.length > 0) || (existing.price === null && item.price !== null)) {
      unique.set(key, item)
    }
  }

  return [...unique.values()]
}

function normalizeTaskUrl(url: string) {
  const trimmed = url.trim()

  if (!trimmed) {
    throw new Error('Task URL is required.')
  }

  return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
}

function buildCollectionProductsPath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)
  const collectionIndex = segments.indexOf('collections')

  if (collectionIndex === -1 || !segments[collectionIndex + 1]) {
    return null
  }

  const prefix = segments.slice(0, collectionIndex).join('/')
  return `/${prefix ? `${prefix}/` : ''}collections/${segments[collectionIndex + 1]}/products.json`
}

function buildCandidatePaths(parsedUrl: URL) {
  const candidates = [buildCollectionProductsPath(parsedUrl.pathname), '/products.json'].filter(
    (value): value is string => Boolean(value),
  )

  return [...new Set(candidates)]
}

function toNumber(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function mapProductToResult(product: ShopifyProduct, origin: string, fields: string[]): TaskResultRow {
  const firstVariant = product.variants?.[0]
  const images =
    product.images?.map((image) => image.src).filter((src): src is string => Boolean(src)) ??
    (product.image?.src ? [product.image.src] : [])
  const tags = typeof product.tags === 'string' ? product.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : []
  const inventory = Array.isArray(product.variants)
    ? product.variants.reduce((sum, variant) => sum + (typeof variant.inventory_quantity === 'number' ? variant.inventory_quantity : 0), 0)
    : 0
  const handle = typeof product.handle === 'string' ? product.handle : ''
  const row: TaskResultRow = {
    id: product.id ? String(product.id) : handle || `product-${randomUUID().slice(0, 8)}`,
    handle,
    url: handle ? `${origin}/products/${handle}` : origin,
  }

  const fieldMap: Record<string, TaskResultRow[string]> = {
    title: product.title ?? null,
    sku: firstVariant?.sku ?? null,
    price: toNumber(firstVariant?.price),
    compareAtPrice: toNumber(firstVariant?.compare_at_price),
    images,
    inventory,
    rating: null,
    tags,
    vendor: product.vendor ?? null,
  }

  for (const field of fields) {
    row[field] = fieldMap[field] ?? null
  }

  return row
}

async function fetchProductsPage(origin: string, path: string, page: number) {
  const endpoint = new URL(path, origin)
  endpoint.searchParams.set('limit', String(SHOPIFY_PAGE_LIMIT))
  endpoint.searchParams.set('page', String(page))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Scrapify/0.1',
      },
      signal: controller.signal,
    })

    if (response.status === 404) {
      return {
        endpoint: endpoint.toString(),
        notFound: true,
        products: [] as ShopifyProduct[],
      }
    }

    if (!response.ok) {
      throw new Error(`Collector request failed with HTTP ${response.status}.`)
    }

    const payload = (await response.json()) as ShopifyProductsResponse

    if (!Array.isArray(payload.products)) {
      throw new Error('Collector response did not contain a valid products array.')
    }

    return {
      endpoint: endpoint.toString(),
      notFound: false,
      products: payload.products,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Collector request timed out.')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchHtmlPage(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Scrapify/0.1',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Collector request failed with HTTP ${response.status}.`)
    }

    return response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Collector request timed out.')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function collectProductsFromJsonLd(html: string, origin: string) {
  const items: GenericCollectedProduct[] = []
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]

  for (const [, content] of scripts) {
    try {
      const parsed = JSON.parse(content.trim()) as unknown
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed]

      while (queue.length > 0) {
        const current = queue.shift()
        if (isRecord(current)) {
          const product = extractGenericProductFromRecord(current, origin)
          if (product) {
            items.push(product)
          }

          for (const nested of Object.values(current)) {
            if (Array.isArray(nested)) {
              queue.push(...nested)
            } else if (nested && typeof nested === 'object') {
              queue.push(nested)
            }
          }
        }
      }
    } catch {}
  }

  return dedupeGenericProducts(items)
}

function collectProductsFromNextData(html: string, origin: string) {
  const parsed = extractNextDataPayload(html)
  if (!parsed) {
    return [] as GenericCollectedProduct[]
  }

  const items: GenericCollectedProduct[] = []

  try {
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed]

    while (queue.length > 0) {
      const current = queue.shift()
      if (!isRecord(current)) {
        continue
      }

      const product = extractGenericProductFromRecord(current, origin)
      if (product) {
        items.push(product)
      }

      for (const nested of Object.values(current)) {
        if (Array.isArray(nested)) {
          queue.push(...nested)
        } else if (nested && typeof nested === 'object') {
          queue.push(nested)
        }
      }
    }
  } catch {}

  return dedupeGenericProducts(items)
}

function collectProductsFromMarkup(html: string, origin: string) {
  const items: GenericCollectedProduct[] = []
  const anchorPattern = /<a[^>]+href=["']([^"']*\/products\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1]
    const absoluteUrl = toAbsoluteUrl(origin, href)
    if (!absoluteUrl) {
      continue
    }

    const title = stripTags(match[2] || '')
    const nearby = html.slice(match.index ?? 0, (match.index ?? 0) + 800)
    const imageMatch = nearby.match(/<img[^>]+src=["']([^"']+)["']/i)
    const priceMatch = nearby.match(/[$€£]\s*\d[\d,]*(?:\.\d+)?/)
    const price = priceMatch ? extractNumber(priceMatch[0]) : null

    if (!title) {
      continue
    }

    items.push(
      normalizeGenericProduct({
        url: absoluteUrl,
        title,
        sku: null,
        price,
        compareAtPrice: null,
        images: imageMatch?.[1] ? collectImageUrls(origin, imageMatch[1]) : [],
        inventory: null,
        tags: [],
        vendor: null,
      }),
    )
  }

  return dedupeGenericProducts(items)
}

function collectFallbackHtmlProducts(html: string, parsedUrl: URL) {
  const allItems = dedupeGenericProducts([
    ...collectProductsFromJsonLd(html, parsedUrl.origin),
    ...collectProductsFromNextData(html, parsedUrl.origin),
    ...collectProductsFromMarkup(html, parsedUrl.origin),
  ])

  const targetHandle = extractHandleFromUrl(parsedUrl.toString())
  if (!targetHandle) {
    return allItems
  }

  const exactMatches = allItems.filter(
    (item) => item.handle === targetHandle || item.url.toLowerCase().includes(`/products/${targetHandle.toLowerCase()}`),
  )

  return exactMatches.length > 0 ? exactMatches : allItems
}

function mapGenericProductToResult(product: GenericCollectedProduct, fields: string[]): TaskResultRow {
  const row: TaskResultRow = {
    id: product.id,
    handle: product.handle || null,
    url: product.url,
  }

  const fieldMap: Record<string, TaskResultRow[string]> = {
    title: product.title,
    sku: product.sku,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    images: product.images,
    inventory: product.inventory,
    rating: null,
    tags: product.tags,
    vendor: product.vendor,
  }

  for (const field of fields) {
    row[field] = fieldMap[field] ?? null
  }

  return row
}

interface CollectorOutcome {
  items: TaskResultRow[]
  pageCount: number
  endpoint: string | null
  source: string
}

interface WooCommerceImage {
  src?: string | null
  alt?: string | null
  thumbnail?: string | null
}

interface WooCommercePrices {
  price?: string | null
  regular_price?: string | null
  sale_price?: string | null
  currency_minor_unit?: number | null
  currency_symbol?: string | null
}

interface WooCommerceCategory {
  name?: string | null
}

interface WooCommerceProduct {
  id?: number | string
  slug?: string
  name?: string
  permalink?: string
  sku?: string | null
  prices?: WooCommercePrices
  images?: WooCommerceImage[]
  categories?: WooCommerceCategory[]
  is_in_stock?: boolean
}

function parseWooCommerceMinorUnitPrice(raw: string | number | null | undefined, minorUnit: number) {
  if (raw === null || raw === undefined) {
    return null
  }

  const numeric = typeof raw === 'number' ? raw : Number(raw)

  if (!Number.isFinite(numeric)) {
    return null
  }

  if (minorUnit > 0) {
    const scale = 10 ** minorUnit
    return Math.round((numeric / scale) * 100) / 100
  }

  return numeric
}

function mapWooCommerceProduct(product: WooCommerceProduct, origin: string, fields: string[]): TaskResultRow {
  const minorUnit = typeof product.prices?.currency_minor_unit === 'number' ? product.prices.currency_minor_unit : 2
  const price = parseWooCommerceMinorUnitPrice(product.prices?.price ?? null, minorUnit)
  const regularPriceValue = parseWooCommerceMinorUnitPrice(product.prices?.regular_price ?? null, minorUnit)
  const compareAtPrice =
    regularPriceValue !== null && price !== null && regularPriceValue > price ? regularPriceValue : null
  const handle = typeof product.slug === 'string' ? product.slug : ''
  const directPermalink = typeof product.permalink === 'string' && product.permalink.trim() ? product.permalink.trim() : ''
  const url = directPermalink || (handle ? `${origin}/product/${handle}` : origin)
  const id = product.id !== undefined && product.id !== null ? String(product.id) : handle || `product-${randomUUID().slice(0, 8)}`
  const tags = Array.isArray(product.categories)
    ? product.categories
        .map((category) => (category && typeof category.name === 'string' ? category.name.trim() : ''))
        .filter((value) => value.length > 0)
    : []
  const images = collectImageUrls(origin, product.images ?? [])

  const generic = normalizeGenericProduct({
    id,
    handle,
    url,
    title: typeof product.name === 'string' ? product.name : null,
    sku: typeof product.sku === 'string' ? product.sku : null,
    price,
    compareAtPrice,
    images,
    inventory: typeof product.is_in_stock === 'boolean' ? (product.is_in_stock ? 1 : 0) : null,
    tags: [...new Set(tags)],
    vendor: null,
  })

  return mapGenericProductToResult(generic, fields)
}

async function fetchWooCommercePage(origin: string, path: string, page: number) {
  const endpoint = new URL(path, origin)
  endpoint.searchParams.set('per_page', String(WOOCOMMERCE_PAGE_LIMIT))
  endpoint.searchParams.set('page', String(page))

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Scrapify/0.1',
      },
      signal: controller.signal,
    })

    if (response.status === 404) {
      return {
        endpoint: endpoint.toString(),
        notFound: true,
        products: [] as WooCommerceProduct[],
      }
    }

    if (!response.ok) {
      throw new Error(`WooCommerce request failed with HTTP ${response.status}.`)
    }

    const payload = (await response.json()) as unknown

    if (!Array.isArray(payload)) {
      throw new Error('WooCommerce response did not contain a products array.')
    }

    return {
      endpoint: endpoint.toString(),
      notFound: false,
      products: payload as WooCommerceProduct[],
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('WooCommerce request timed out.')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchSitemapXml(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/xml,text/xml,*/*',
        'user-agent': 'Scrapify/0.1',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    const body = await response.text()
    const trimmed = body.trim()

    if (
      !trimmed.startsWith('<?xml') &&
      !trimmed.startsWith('<urlset') &&
      !trimmed.startsWith('<sitemapindex')
    ) {
      return null
    }

    return {
      endpoint: url,
      body,
      isIndex: trimmed.includes('<sitemapindex'),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function parseSitemapLocations(xml: string) {
  const locations = new Set<string>()

  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const value = decodeHtml(match[1] || '').trim()
    if (value) {
      locations.add(value)
    }
  }

  return [...locations]
}

async function discoverSitemapProductUrls(parsedUrl: URL): Promise<string[]> {
  const candidates = ['/sitemap_products_1.xml', '/sitemap.xml', '/sitemap_index.xml']
  const visited = new Set<string>()
  const collected = new Set<string>()

  for (const candidate of candidates) {
    if (collected.size >= SITEMAP_MAX_URLS) {
      break
    }

    const targetUrl = new URL(candidate, parsedUrl.origin).toString()
    if (visited.has(targetUrl)) {
      continue
    }

    visited.add(targetUrl)

    const result = await fetchSitemapXml(targetUrl)
    if (!result) {
      continue
    }

    const locations = parseSitemapLocations(result.body)

    if (result.isIndex) {
      const childSitemaps = locations.slice(0, SITEMAP_INDEX_BRANCH_LIMIT)
      for (const child of childSitemaps) {
        if (collected.size >= SITEMAP_MAX_URLS) {
          break
        }

        if (visited.has(child)) {
          continue
        }

        visited.add(child)

        const childResult = await fetchSitemapXml(child)
        if (!childResult) {
          continue
        }

        for (const loc of parseSitemapLocations(childResult.body)) {
          if (PRODUCT_URL_PATTERN.test(loc)) {
            collected.add(loc)
            if (collected.size >= SITEMAP_MAX_URLS) {
              break
            }
          }
        }
      }
    } else {
      for (const loc of locations) {
        if (PRODUCT_URL_PATTERN.test(loc)) {
          collected.add(loc)
          if (collected.size >= SITEMAP_MAX_URLS) {
            break
          }
        }
      }
    }

    if (collected.size > 0) {
      break
    }
  }

  return [...collected].slice(0, SITEMAP_MAX_URLS)
}

async function tryShopifyCollector(
  record: TaskRuntimeRecord,
  parsedUrl: URL,
  delayMs: number,
): Promise<CollectorOutcome> {
  const source = 'shopify-products-json'
  const candidatePaths = buildCandidatePaths(parsedUrl)

  appendLog(record, 'info', `Shopify collector preparing ${candidatePaths.length} endpoint candidate(s).`)
  await saveDatabase()

  let bestItems: TaskResultRow[] = []
  let bestPageCount = 0
  let bestEndpoint: string | null = null

  for (const path of candidatePaths) {
    let pathItems: TaskResultRow[] = []
    let pathPageCount = 0
    let pathEndpoint: string | null = null
    let foundProducts = false

    for (let page = 1; page <= SHOPIFY_MAX_PAGES; page += 1) {
      let response: Awaited<ReturnType<typeof fetchProductsPage>>

      try {
        response = await fetchProductsPage(parsedUrl.origin, path, page)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Collector request failed.'
        appendLog(record, 'warn', `Shopify endpoint failed: ${new URL(path, parsedUrl.origin).pathname} (${message})`)
        break
      }

      if (response.notFound) {
        appendLog(record, 'warn', `Shopify endpoint not found: ${new URL(response.endpoint).pathname}`)
        break
      }

      const mappedItems = response.products.map((product) =>
        mapProductToResult(product, parsedUrl.origin, record.fields),
      )

      if (page === 1 && mappedItems.length === 0) {
        appendLog(record, 'warn', `Shopify endpoint returned no products: ${new URL(response.endpoint).pathname}`)
        break
      }

      if (!pathEndpoint) {
        pathEndpoint = response.endpoint
      }

      foundProducts = foundProducts || mappedItems.length > 0
      pathItems = [...pathItems, ...mappedItems]
      pathPageCount = page

      record.itemCount = pathItems.length
      record.progress = Math.min(95, 15 + page * 20)
      record.resultItems = pathItems
      record.updatedAtMs = Date.now()
      record.lastHeartbeatAt = nowIso(record.updatedAtMs)
      record.elapsed = formatElapsed(Math.max(0, record.updatedAtMs - record.startedAtMs))

      updateActiveRun(record, {
        status: 'running',
        itemCount: pathItems.length,
        pageCount: page,
      })

      appendLog(record, 'info', `Shopify fetched page ${page} with ${mappedItems.length} product(s).`)
      await saveDatabase()

      if (mappedItems.length < SHOPIFY_PAGE_LIMIT) {
        break
      }

      await wait(delayMs)
    }

    if (foundProducts) {
      bestItems = pathItems
      bestPageCount = pathPageCount
      bestEndpoint = pathEndpoint
      break
    }
  }

  return {
    items: bestItems,
    pageCount: bestPageCount,
    endpoint: bestEndpoint,
    source,
  }
}

async function tryWooCommerceCollector(
  record: TaskRuntimeRecord,
  parsedUrl: URL,
  delayMs: number,
): Promise<CollectorOutcome> {
  const source = 'woocommerce-store-api'
  const candidatePaths = ['/wp-json/wc/store/v1/products', '/wp-json/wc/store/products']

  appendLog(record, 'info', `WooCommerce collector preparing ${candidatePaths.length} endpoint candidate(s).`)
  updateActiveRunSource(record, source)
  await saveDatabase()

  let bestItems: TaskResultRow[] = []
  let bestPageCount = 0
  let bestEndpoint: string | null = null

  for (const path of candidatePaths) {
    let pathItems: TaskResultRow[] = []
    let pathPageCount = 0
    let pathEndpoint: string | null = null
    let foundProducts = false

    for (let page = 1; page <= WOOCOMMERCE_MAX_PAGES; page += 1) {
      let response: Awaited<ReturnType<typeof fetchWooCommercePage>>

      try {
        response = await fetchWooCommercePage(parsedUrl.origin, path, page)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'WooCommerce request failed.'
        appendLog(record, 'warn', `WooCommerce endpoint failed: ${new URL(path, parsedUrl.origin).pathname} (${message})`)
        break
      }

      if (response.notFound) {
        appendLog(record, 'warn', `WooCommerce endpoint not found: ${new URL(response.endpoint).pathname}`)
        break
      }

      const mappedItems = response.products.map((product) =>
        mapWooCommerceProduct(product, parsedUrl.origin, record.fields),
      )

      if (page === 1 && mappedItems.length === 0) {
        appendLog(record, 'warn', `WooCommerce endpoint returned no products: ${new URL(response.endpoint).pathname}`)
        break
      }

      if (!pathEndpoint) {
        pathEndpoint = response.endpoint
      }

      foundProducts = foundProducts || mappedItems.length > 0
      pathItems = [...pathItems, ...mappedItems]
      pathPageCount = page

      record.itemCount = pathItems.length
      record.progress = Math.min(95, 20 + page * 18)
      record.resultItems = pathItems
      record.updatedAtMs = Date.now()
      record.lastHeartbeatAt = nowIso(record.updatedAtMs)
      record.elapsed = formatElapsed(Math.max(0, record.updatedAtMs - record.startedAtMs))

      updateActiveRun(record, {
        status: 'running',
        itemCount: pathItems.length,
        pageCount: page,
      })

      appendLog(record, 'info', `WooCommerce fetched page ${page} with ${mappedItems.length} product(s).`)
      await saveDatabase()

      if (mappedItems.length < WOOCOMMERCE_PAGE_LIMIT) {
        break
      }

      await wait(delayMs)
    }

    if (foundProducts) {
      bestItems = pathItems
      bestPageCount = pathPageCount
      bestEndpoint = pathEndpoint
      break
    }
  }

  return {
    items: bestItems,
    pageCount: bestPageCount,
    endpoint: bestEndpoint,
    source,
  }
}

async function trySitemapCollector(
  record: TaskRuntimeRecord,
  parsedUrl: URL,
  delayMs: number,
): Promise<CollectorOutcome> {
  const source = 'sitemap-html'

  appendLog(record, 'info', 'Sitemap collector starting URL discovery.')
  updateActiveRunSource(record, source)
  await saveDatabase()

  let productUrls: string[] = []
  try {
    productUrls = await discoverSitemapProductUrls(parsedUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sitemap discovery failed.'
    appendLog(record, 'warn', `Sitemap discovery failed: ${message}`)
    return { items: [], pageCount: 0, endpoint: null, source }
  }

  if (productUrls.length === 0) {
    appendLog(record, 'warn', 'Sitemap discovery returned no product URLs.')
    return { items: [], pageCount: 0, endpoint: null, source }
  }

  appendLog(record, 'info', `Sitemap collector queued ${productUrls.length} product URL(s).`)
  await saveDatabase()

  const collected: TaskResultRow[] = []
  const sitemapDelayMs = Math.max(150, Math.round(delayMs / 2))
  let lastEndpoint: string | null = null

  for (let index = 0; index < productUrls.length; index += 1) {
    const productUrl = productUrls[index]
    let html = ''

    try {
      html = await fetchHtmlPage(productUrl)
      lastEndpoint = productUrl
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sitemap product fetch failed.'
      appendLog(record, 'warn', `Sitemap product fetch failed (${productUrl}): ${message}`)
      continue
    }

    let parsedProductUrl: URL
    try {
      parsedProductUrl = new URL(productUrl)
    } catch {
      continue
    }

    const fallbackItems = collectFallbackHtmlProducts(html, parsedProductUrl).map((item) =>
      mapGenericProductToResult(item, record.fields),
    )

    if (fallbackItems.length > 0) {
      collected.push(...fallbackItems)
    }

    record.itemCount = collected.length
    record.progress = Math.min(95, 20 + Math.floor(((index + 1) / productUrls.length) * 70))
    record.resultItems = collected
    record.updatedAtMs = Date.now()
    record.lastHeartbeatAt = nowIso(record.updatedAtMs)
    record.elapsed = formatElapsed(Math.max(0, record.updatedAtMs - record.startedAtMs))

    updateActiveRun(record, {
      status: 'running',
      itemCount: collected.length,
      pageCount: index + 1,
    })

    if ((index + 1) % 5 === 0 || index === productUrls.length - 1) {
      appendLog(
        record,
        'info',
        `Sitemap progress: ${index + 1}/${productUrls.length} URL(s) processed, ${collected.length} item(s).`,
      )
      await saveDatabase()
    }

    if (index < productUrls.length - 1) {
      await wait(sitemapDelayMs)
    }
  }

  return {
    items: collected,
    pageCount: productUrls.length,
    endpoint: lastEndpoint,
    source,
  }
}

async function tryHtmlFallbackCollector(
  record: TaskRuntimeRecord,
  parsedUrl: URL,
  _delayMs: number,
): Promise<CollectorOutcome> {
  const source = 'html-structured-data'

  appendLog(record, 'info', 'HTML structured-data fallback starting.')
  updateActiveRunSource(record, source)
  await saveDatabase()

  let html = ''
  try {
    html = await fetchHtmlPage(parsedUrl.toString())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HTML fallback fetch failed.'
    appendLog(record, 'warn', `HTML fallback fetch failed: ${message}`)
    return { items: [], pageCount: 0, endpoint: null, source }
  }

  const items = collectFallbackHtmlProducts(html, parsedUrl).map((item) =>
    mapGenericProductToResult(item, record.fields),
  )

  if (items.length === 0) {
    return { items: [], pageCount: 0, endpoint: parsedUrl.toString(), source }
  }

  appendLog(record, 'info', `HTML fallback collected ${items.length} item(s).`)

  return {
    items,
    pageCount: 1,
    endpoint: parsedUrl.toString(),
    source,
  }
}

async function executeTask(taskId: string) {
  const db = await getDatabase()
  const record = db.tasks.find((task) => task.id === taskId)

  if (!record) {
    activeExecutions.delete(taskId)
    return
  }

  try {
    const parsedUrl = normalizeTaskUrl(record.url)
    const delayMs = parseDelayMs(record.delay)

    appendLog(
      record,
      'info',
      'Collector pipeline ready: shopify-products-json -> woocommerce-store-api -> sitemap-html -> html-structured-data.',
    )
    await saveDatabase()

    const collectors: Array<
      (record: TaskRuntimeRecord, parsedUrl: URL, delayMs: number) => Promise<CollectorOutcome>
    > = [tryShopifyCollector, tryWooCommerceCollector, trySitemapCollector, tryHtmlFallbackCollector]

    let outcome: CollectorOutcome | null = null

    for (const collector of collectors) {
      const result = await collector(record, parsedUrl, delayMs)
      if (result.items.length > 0) {
        outcome = result
        break
      }
    }

    if (!outcome || outcome.items.length === 0) {
      throw new Error(
        'No products could be collected via Shopify products.json, WooCommerce store API, sitemap discovery, or HTML structured-data fallback.',
      )
    }

    record.resultItems = outcome.items
    record.result = {
      source: outcome.source,
      collectionUrl: parsedUrl.toString(),
      itemCount: outcome.items.length,
      pageCount: Math.max(outcome.pageCount, 1),
      exportedAt: nowIso(Date.now()),
      preview: outcome.items.slice(0, RESULT_PREVIEW_LIMIT).map((row) => ({ ...row })),
    }

    updateActiveRun(record, {
      status: 'running',
      itemCount: outcome.items.length,
      pageCount: Math.max(outcome.pageCount, 1),
    })
    updateActiveRunSource(record, outcome.source)

    if (outcome.endpoint) {
      appendLog(record, 'info', `Collector completed via ${outcome.endpoint}.`)
    }

    markTaskDone(record, Date.now())
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Task execution failed.'
    markTaskError(record, Date.now(), message, 'collector-error')
  } finally {
    activeExecutions.delete(taskId)
    await saveDatabase()
  }
}

async function tickTaskWorker() {
  if (taskWorkerBusy) {
    return
  }

  taskWorkerBusy = true

  try {
    const db = await getDatabase()
    const now = Date.now()
    let changed = false

    for (const task of db.tasks) {
      changed = updateRunningHeartbeat(task, now) || changed

      if (task.status === 'running' && !activeExecutions.has(task.id)) {
        appendLog(task, 'warn', 'Recovered running task after worker restart; restarting from the beginning.', now)
        resetExecutionState(task, now)
        markTaskRunning(task, now)
        activeExecutions.set(task.id, executeTask(task.id))
        changed = true
      }
    }

    for (const task of db.tasks) {
      if (activeExecutions.size >= MAX_ACTIVE_TASKS) {
        break
      }

      if (task.status !== 'pending' || activeExecutions.has(task.id)) {
        continue
      }

      const queuedAtMs = Date.parse(task.createdAt) || task.updatedAtMs || now

      if (now - queuedAtMs < TASK_QUEUE_DELAY_MS) {
        continue
      }

      resetExecutionState(task, now)
      markTaskRunning(task, now)
      activeExecutions.set(task.id, executeTask(task.id))
      changed = true
    }

    if (changed) {
      await saveDatabase()
    }
  } finally {
    taskWorkerBusy = false
  }
}

export function startTaskWorker() {
  if (taskWorkerTimer) {
    return
  }

  void tickTaskWorker()
  taskWorkerTimer = setInterval(() => {
    void tickTaskWorker()
  }, TASK_TICK_MS)
  taskWorkerTimer.unref?.()
}

export function stopTaskWorker() {
  if (!taskWorkerTimer) {
    return
  }

  clearInterval(taskWorkerTimer)
  taskWorkerTimer = null
}

export function applyTaskPatch(record: TaskRuntimeRecord, patch: Partial<TaskDetail>) {
  const now = Date.now()
  let changed = false

  if (typeof patch.url === 'string' && patch.url !== record.url) {
    record.url = patch.url
    changed = true
  }

  if (typeof patch.progress === 'number') {
    const nextProgress = Math.max(0, Math.min(100, patch.progress))

    if (nextProgress !== record.progress) {
      record.progress = nextProgress
      changed = true
    }
  }

  if (typeof patch.itemCount === 'number') {
    const nextCount = Math.max(0, patch.itemCount)

    if (nextCount !== record.itemCount) {
      record.itemCount = nextCount
      changed = true
    }
  }

  if (typeof patch.elapsed === 'string' && patch.elapsed !== record.elapsed) {
    record.elapsed = patch.elapsed
    changed = true
  }

  if (typeof patch.errorMessage === 'string' || patch.errorMessage === null) {
    record.errorMessage = patch.errorMessage
    changed = true
  }

  if (typeof patch.status === 'string' && patch.status !== record.status) {
    if (patch.status === 'running') {
      resetExecutionState(record, now)
      markTaskRunning(record, now)
    } else if (patch.status === 'done') {
      markTaskDone(record, now)
    } else if (patch.status === 'error') {
      markTaskError(record, now, patch.errorMessage || 'Task marked as failed manually.', 'manual-error')
    } else if (patch.status === 'pending') {
      record.status = 'pending'
      resetExecutionState(record, now)
      appendLog(record, 'warn', 'Task moved back to pending.', now)
    }

    changed = true
  }

  if (record.status === 'done') {
    record.progress = 100
    record.itemCount = Math.max(record.itemCount, record.targetCount)
  }

  if (changed) {
    record.updatedAtMs = now
  }

  return changed
}
