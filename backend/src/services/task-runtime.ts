import { randomUUID } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { formatElapsed } from '../data/seed'
import type {
  NewTaskForm,
  Task,
  TaskResultRow,
  TaskRuntimeRecord,
} from '../types'
import { getDatabase, markTaskDirty, saveDatabase } from './data-store'
import { formatAttemptedCollectors, getCollectorOrder, type CollectorKey } from './platform-registry'
import { extractNextDataPayload } from './runtime-utils'
import { safeFetchWithRetry, type HttpContext } from './safe-http'
import { SsrfBlockedError, assertPublicHostname } from './url-guard'
import { tryEtsyCollector } from './collectors/etsy'
import { tryAliexpressCollector } from './collectors/aliexpress'

const TASK_TICK_MS = 3000
const TASK_QUEUE_DELAY_MS = 1500
// 并发分类:浏览器型 collector 单 Chromium 占内存 ~250MB,严格 1 并发;
// HTTP 型 collector 轻量,可 2 并发(向后兼容原 MAX_ACTIVE_TASKS=2 设置)。
const MAX_ACTIVE_HTTP_TASKS = 2
const MAX_ACTIVE_BROWSER_TASKS = 1
// 哪些 collector 是浏览器型(目前只有 aliexpress)。
// 注:如果未来某平台支持"HTTP collector + Playwright collector 双备份",
// 用 task.platform 单一来源不够,届时改用 collector key 决策。POC 阶段单一来源够用。
const BROWSER_COLLECTOR_PLATFORMS = new Set<string>(['aliexpress'])

function isBrowserTask(platform: string): boolean {
  return BROWSER_COLLECTOR_PLATFORMS.has(platform)
}

const SHOPIFY_PAGE_LIMIT = 250
const SHOPIFY_MAX_PAGES = 12
const REQUEST_TIMEOUT_MS = 15_000
const RESULT_PREVIEW_LIMIT = 5
const WOOCOMMERCE_PAGE_LIMIT = 100
const WOOCOMMERCE_MAX_PAGES = 5
const SITEMAP_MAX_URLS = 500
const SITEMAP_INDEX_BRANCH_LIMIT = 3
// 商品 URL 识别:
// - 路径式:/products/xxx (Shopify 系)、/product/xxx (WooCommerce 单数)
// - 路径式 SaaS / 自建:/p/<slug>、/item/<slug>、/goods/<slug>、/detail/<slug>
//   (非商品页虽偶有命中,后续 JSON-LD `@type=Product` 解析会过滤掉)
// - query-string 式:OpenCart 用 route=product/product、ZenCart 用 main_page=product_info
const PRODUCT_URL_PATTERN = /\/products?\/|\/(?:p|item|goods|detail)\/|[?&](?:route=product\/product|main_page=product_info)\b/i
// 抓取节奏写死，原来由 NewTaskForm.delay 传入，UI 切换后所有任务都走同一档
const DEFAULT_REQUEST_DELAY_MS = 1500

let taskWorkerTimer: NodeJS.Timeout | null = null
let taskWorkerBusy = false
const activeExecutions = new Map<string, Promise<void>>()

// 给 routes 用:判断 task 是否正被 worker 跑。
// 删会话级联清理时,正在跑的 task 不能直接从内存抹掉(worker 仍持有引用),
// 要先标 error 让 worker 跑完自然 finally。
export function isTaskActive(taskId: string): boolean {
  return activeExecutions.has(taskId)
}

// 给 routes 用:对正在跑的 task 标错误并通知 worker。
// worker tick 不会主动停止已经发起的 fetch,但下个 page 完成后会检查 status,
// 这里给出一个明确的中止信号(status=error)避免它继续 saveDatabase 把 status 改回去。
export function abortActiveTask(record: TaskRuntimeRecord, message: string): void {
  markTaskError(record, Date.now(), message)
}

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

export interface GenericCollectedProduct {
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

export function toTask(record: TaskRuntimeRecord): Task {
  return {
    id: record.id,
    url: record.url,
    platform: record.platform || 'auto',
    catalogLimit: typeof record.catalogLimit === 'number' ? record.catalogLimit : null,
    status: record.status,
    progress: record.status === 'done' ? 100 : record.progress,
    itemCount: record.status === 'pending' ? 0 : record.itemCount,
    elapsed: record.elapsed,
    createdAt: record.createdAt,
  }
}

export function createRuntimeTask(form: NewTaskForm, userId: string): TaskRuntimeRecord {
  const now = Date.now()

  // 'all' → null(在 task 上统一表示"无限制");number > 0 直接采用;其它一律 null
  let catalogLimit: number | null = null
  if (typeof form.catalogLimit === 'number' && form.catalogLimit > 0) {
    catalogLimit = Math.floor(form.catalogLimit)
  }

  return {
    id: `task-${randomUUID().slice(0, 8)}`,
    userId,
    url: form.url.trim(),
    platform: typeof form.platform === 'string' && form.platform ? form.platform : 'auto',
    catalogLimit,
    status: 'pending',
    progress: 0,
    itemCount: 0,
    elapsed: '0s',
    createdAt: nowIso(now),
    startedAtMs: now,
    updatedAtMs: now,
    result: null,
    resultItems: [],
  }
}

function resetExecutionState(record: TaskRuntimeRecord, atMs: number) {
  record.progress = 0
  record.itemCount = 0
  record.elapsed = '0s'
  record.result = null
  record.resultItems = []
  record.startedAtMs = atMs
  record.updatedAtMs = atMs
}

function markTaskRunning(record: TaskRuntimeRecord, now: number) {
  record.status = 'running'
  record.startedAtMs = now
  record.updatedAtMs = now
  record.elapsed = '0s'
  markTaskDirty(record.id)
  console.log(`[task ${record.id}] worker claimed task`)
}

function markTaskDone(record: TaskRuntimeRecord, now: number) {
  record.status = 'done'
  record.progress = 100
  record.itemCount = record.resultItems.length
  record.updatedAtMs = now
  record.elapsed = formatElapsed(Math.max(0, now - record.startedAtMs))
  markTaskDirty(record.id)
  console.log(`[task ${record.id}] completed with ${record.itemCount} item(s)`)
}

function markTaskError(record: TaskRuntimeRecord, now: number, message: string) {
  record.status = 'error'
  record.updatedAtMs = now
  record.elapsed = formatElapsed(Math.max(0, now - record.startedAtMs))
  markTaskDirty(record.id)
  console.error(`[task ${record.id}] failed: ${message}`)
}

function updateRunningHeartbeat(record: TaskRuntimeRecord, now: number) {
  if (record.status !== 'running') {
    return false
  }

  const nextElapsed = formatElapsed(Math.max(0, now - record.startedAtMs))
  let changed = false

  if (record.elapsed !== nextElapsed) {
    record.elapsed = nextElapsed
    changed = true
  }

  record.updatedAtMs = now
  if (changed) {
    // 只在 elapsed 真正变化(秒级)时才标 dirty + 触发刷盘,
    // 否则 worker 每 3s tick 都会写 updatedAtMs 但用户看到的字段没变。
    markTaskDirty(record.id)
  }
  return changed
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

// 把 9 个产品字段一次性铺到 row 上。row 里 id/handle/url 已经先写入，
// fieldMap 里的 key 不会和它们冲突，所以可以直接 Object.assign。
function mapProductToResult(product: ShopifyProduct, origin: string): TaskResultRow {
  const firstVariant = product.variants?.[0]
  const images =
    product.images?.map((image) => image.src).filter((src): src is string => Boolean(src)) ??
    (product.image?.src ? [product.image.src] : [])
  const tags = typeof product.tags === 'string' ? product.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : []
  const inventory = Array.isArray(product.variants)
    ? product.variants.reduce((sum, variant) => sum + (typeof variant.inventory_quantity === 'number' ? variant.inventory_quantity : 0), 0)
    : 0
  const handle = typeof product.handle === 'string' ? product.handle : ''

  return {
    id: product.id ? String(product.id) : handle || `product-${randomUUID().slice(0, 8)}`,
    handle,
    url: handle ? `${origin}/products/${handle}` : origin,
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
}

async function fetchProductsPage(origin: string, path: string, page: number, ctx: HttpContext = {}) {
  const endpoint = new URL(path, origin)
  endpoint.searchParams.set('limit', String(SHOPIFY_PAGE_LIMIT))
  endpoint.searchParams.set('page', String(page))

  try {
    const response = await safeFetchWithRetry(
      endpoint,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'Scrapify/0.1',
        },
      },
      { timeoutMs: REQUEST_TIMEOUT_MS },
      ctx,
    )

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
  }
}

async function fetchHtmlPage(url: string, ctx: HttpContext = {}) {
  try {
    const response = await safeFetchWithRetry(
      url,
      {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'Scrapify/0.1',
        },
      },
      { timeoutMs: REQUEST_TIMEOUT_MS },
      ctx,
    )

    if (!response.ok) {
      throw new Error(`Collector request failed with HTTP ${response.status}.`)
    }

    return response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Collector request timed out.')
    }

    throw error
  }
}

export function collectProductsFromJsonLd(html: string, origin: string) {
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
  // 匹配四种风格(与 PRODUCT_URL_PATTERN 保持一致):
  //  - Shopify 系: <a href="/products/slug">
  //  - WooCommerce: <a href="/product/slug">
  //  - 自建 / 中文 SaaS: /p/、/item/、/goods/、/detail/
  //  - OpenCart/ZenCart: <a href="...?route=product/product&product_id=N"> 或 main_page=product_info
  const anchorPattern =
    /<a[^>]+href=["']([^"']*(?:\/products?\/[^"'?#]+|\/(?:p|item|goods|detail)\/[^"'?#]+|[?&](?:route=product\/product|main_page=product_info)\b[^"']*))["'][^>]*>([\s\S]*?)<\/a>/gi

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1]
    const absoluteUrl = toAbsoluteUrl(origin, href)
    if (!absoluteUrl) {
      continue
    }

    const title = stripTags(match[2] || '')
    const nearby = html.slice(match.index ?? 0, (match.index ?? 0) + 800)
    const imageMatch = nearby.match(/<img[^>]+src=["']([^"']+)["']/i)
    const priceMatch = nearby.match(/[$€£¥]\s*\d[\d,]*(?:\.\d+)?/)
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

export function mapGenericProductToResult(product: GenericCollectedProduct): TaskResultRow {
  return {
    id: product.id,
    handle: product.handle || null,
    url: product.url,
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
}

export interface CollectorOutcome {
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

function mapWooCommerceProduct(product: WooCommerceProduct, origin: string): TaskResultRow {
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

  return mapGenericProductToResult(generic)
}

async function fetchWooCommercePage(origin: string, path: string, page: number, ctx: HttpContext = {}) {
  const endpoint = new URL(path, origin)
  endpoint.searchParams.set('per_page', String(WOOCOMMERCE_PAGE_LIMIT))
  endpoint.searchParams.set('page', String(page))

  try {
    const response = await safeFetchWithRetry(
      endpoint,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'Scrapify/0.1',
        },
      },
      { timeoutMs: REQUEST_TIMEOUT_MS },
      ctx,
    )

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
  }
}

async function fetchSitemapXml(url: string, ctx: HttpContext = {}) {
  try {
    const response = await safeFetchWithRetry(
      url,
      {
        headers: {
          accept: 'application/xml,text/xml,application/gzip,application/x-gzip,*/*',
          'user-agent': 'Scrapify/0.1',
        },
      },
      { timeoutMs: REQUEST_TIMEOUT_MS },
      ctx,
    )

    if (!response.ok) {
      return null
    }

    // 以字节读取,先检测 gzip magic bytes(1f 8b);Shoplazza 等把 sitemap_products 作为 .xml.gz
    // 暴露,server 直接返回 application/x-gzip,fetch 不会自动解压(它只解 transport-encoded gzip)。
    const buffer = Buffer.from(await response.arrayBuffer())
    let body: string
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        body = gunzipSync(buffer).toString('utf8')
      } catch {
        return null
      }
    } else {
      body = buffer.toString('utf8')
    }

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

async function discoverSitemapProductUrls(parsedUrl: URL, ctx: HttpContext = {}): Promise<string[]> {
  const candidates = [
    '/sitemap_products_1.xml', // Shopify
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/index.php?route=feed/google_sitemap', // OpenCart 3.x 默认 sitemap feed
  ]
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

    const result = await fetchSitemapXml(targetUrl, ctx)
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

        const childResult = await fetchSitemapXml(child, ctx)
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

// 把每页抓取后的"更新进度 + 心跳 + 落库"封成一个 helper，
// 三个 collector 复用，避免上一版那种 6-8 行内联代码重复 3 次。
export async function reportCollectorProgress(
  record: TaskRuntimeRecord,
  items: TaskResultRow[],
  progress: number,
) {
  const now = Date.now()
  record.itemCount = items.length
  record.progress = Math.min(95, progress)
  record.resultItems = items
  record.updatedAtMs = now
  record.elapsed = formatElapsed(Math.max(0, now - record.startedAtMs))
  markTaskDirty(record.id)
  await saveDatabase()
}

async function tryShopifyCollector(
  record: TaskRuntimeRecord,
  parsedUrl: URL,
  delayMs: number,
  itemLimit: number | null,
): Promise<CollectorOutcome> {
  const source = 'shopify-products-json'
  const candidatePaths = buildCandidatePaths(parsedUrl)

  let bestItems: TaskResultRow[] = []
  let bestPageCount = 0
  let bestEndpoint: string | null = null

  for (const path of candidatePaths) {
    let pathItems: TaskResultRow[] = []
    let pathPageCount = 0
    let pathEndpoint: string | null = null
    let foundProducts = false
    let reachedLimit = false

    for (let page = 1; page <= SHOPIFY_MAX_PAGES; page += 1) {
      let response: Awaited<ReturnType<typeof fetchProductsPage>>

      try {
        response = await fetchProductsPage(parsedUrl.origin, path, page, { userId: record.userId })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Collector request failed.'
        console.warn(`[task ${record.id}] shopify endpoint failed: ${path} (${message})`)
        break
      }

      if (response.notFound) {
        break
      }

      const mappedItems = response.products.map((product) =>
        mapProductToResult(product, parsedUrl.origin),
      )

      if (page === 1 && mappedItems.length === 0) {
        break
      }

      if (!pathEndpoint) {
        pathEndpoint = response.endpoint
      }

      foundProducts = foundProducts || mappedItems.length > 0
      pathItems = [...pathItems, ...mappedItems]
      pathPageCount = page

      // 达到 catalogLimit 早停(截到精确数量)
      if (itemLimit !== null && pathItems.length >= itemLimit) {
        pathItems = pathItems.slice(0, itemLimit)
        reachedLimit = true
      }

      await reportCollectorProgress(record, pathItems, 15 + page * 20)

      if (reachedLimit || mappedItems.length < SHOPIFY_PAGE_LIMIT) {
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
  itemLimit: number | null,
): Promise<CollectorOutcome> {
  const source = 'woocommerce-store-api'
  const candidatePaths = ['/wp-json/wc/store/v1/products', '/wp-json/wc/store/products']

  let bestItems: TaskResultRow[] = []
  let bestPageCount = 0
  let bestEndpoint: string | null = null

  for (const path of candidatePaths) {
    let pathItems: TaskResultRow[] = []
    let pathPageCount = 0
    let pathEndpoint: string | null = null
    let foundProducts = false
    let reachedLimit = false

    for (let page = 1; page <= WOOCOMMERCE_MAX_PAGES; page += 1) {
      let response: Awaited<ReturnType<typeof fetchWooCommercePage>>

      try {
        response = await fetchWooCommercePage(parsedUrl.origin, path, page, { userId: record.userId })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'WooCommerce request failed.'
        console.warn(`[task ${record.id}] woocommerce endpoint failed: ${path} (${message})`)
        break
      }

      if (response.notFound) {
        break
      }

      const mappedItems = response.products.map((product) =>
        mapWooCommerceProduct(product, parsedUrl.origin),
      )

      if (page === 1 && mappedItems.length === 0) {
        break
      }

      if (!pathEndpoint) {
        pathEndpoint = response.endpoint
      }

      foundProducts = foundProducts || mappedItems.length > 0
      pathItems = [...pathItems, ...mappedItems]
      pathPageCount = page

      if (itemLimit !== null && pathItems.length >= itemLimit) {
        pathItems = pathItems.slice(0, itemLimit)
        reachedLimit = true
      }

      await reportCollectorProgress(record, pathItems, 20 + page * 18)

      if (reachedLimit || mappedItems.length < WOOCOMMERCE_PAGE_LIMIT) {
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
  itemLimit: number | null,
): Promise<CollectorOutcome> {
  const source = 'sitemap-html'

  let productUrls: string[] = []
  try {
    productUrls = await discoverSitemapProductUrls(parsedUrl, { userId: record.userId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sitemap discovery failed.'
    console.warn(`[task ${record.id}] sitemap discovery failed: ${message}`)
    return { items: [], pageCount: 0, endpoint: null, source }
  }

  if (productUrls.length === 0) {
    return { items: [], pageCount: 0, endpoint: null, source }
  }

  // 有 itemLimit 时,稍稍多取一些(应对 JSON-LD 解析失败造成的丢失)再 slice
  const fetchBudget =
    itemLimit !== null
      ? Math.min(productUrls.length, Math.ceil(itemLimit * 1.2))
      : productUrls.length

  const collected: TaskResultRow[] = []
  const sitemapDelayMs = Math.max(150, Math.round(delayMs / 2))
  let lastEndpoint: string | null = null
  let processed = 0

  for (let index = 0; index < fetchBudget; index += 1) {
    const productUrl = productUrls[index]
    processed = index + 1
    let html = ''

    try {
      html = await fetchHtmlPage(productUrl, { userId: record.userId })
      lastEndpoint = productUrl
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sitemap product fetch failed.'
      console.warn(`[task ${record.id}] sitemap product fetch failed (${productUrl}): ${message}`)
      continue
    }

    let parsedProductUrl: URL
    try {
      parsedProductUrl = new URL(productUrl)
    } catch {
      continue
    }

    const fallbackItems = collectFallbackHtmlProducts(html, parsedProductUrl).map(mapGenericProductToResult)

    if (fallbackItems.length > 0) {
      collected.push(...fallbackItems)
    }

    // 达到 catalogLimit:截断 + 早停(每件商品 ~1.5s 间隔,这步节省最多)
    if (itemLimit !== null && collected.length >= itemLimit) {
      collected.length = itemLimit
      await reportCollectorProgress(record, collected, 90)
      break
    }

    await reportCollectorProgress(record, collected, 20 + Math.floor((processed / fetchBudget) * 70))

    if (index < fetchBudget - 1) {
      await wait(sitemapDelayMs)
    }
  }

  return {
    items: collected,
    pageCount: processed,
    endpoint: lastEndpoint,
    source,
  }
}

async function tryHtmlFallbackCollector(
  record: TaskRuntimeRecord,
  parsedUrl: URL,
  _delayMs: number,
  itemLimit: number | null,
): Promise<CollectorOutcome> {
  const source = 'html-structured-data'

  let html = ''
  try {
    html = await fetchHtmlPage(parsedUrl.toString(), { userId: record.userId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'HTML fallback fetch failed.'
    console.warn(`[task ${record.id}] html fallback fetch failed: ${message}`)
    return { items: [], pageCount: 0, endpoint: null, source }
  }

  let items = collectFallbackHtmlProducts(html, parsedUrl).map(mapGenericProductToResult)

  if (items.length === 0) {
    return { items: [], pageCount: 0, endpoint: parsedUrl.toString(), source }
  }

  // 单页 HTML 解析可能一次性吐出几十件,按 catalogLimit 截断
  if (itemLimit !== null && items.length > itemLimit) {
    items = items.slice(0, itemLimit)
  }

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
    // 双重校验:routes/tasks.ts 入口已经过 assertPublicHostname,这里再校验一次
    // 防止数据库里残留的老任务(可能在校验逻辑加上之前提交的)在 worker 重启后被执行。
    await assertPublicHostname(parsedUrl.hostname)
    const delayMs = DEFAULT_REQUEST_DELAY_MS

    // platform → collector 顺序由 platform-registry 决定。未知 platform 走 auto。
    const collectorMap: Record<
      CollectorKey,
      (
        record: TaskRuntimeRecord,
        parsedUrl: URL,
        delayMs: number,
        itemLimit: number | null,
      ) => Promise<CollectorOutcome>
    > = {
      shopify: tryShopifyCollector,
      woocommerce: tryWooCommerceCollector,
      sitemap: trySitemapCollector,
      html: tryHtmlFallbackCollector,
      etsy: tryEtsyCollector,
      aliexpress: tryAliexpressCollector,
    }

    const order = getCollectorOrder(record.platform)
    // record.catalogLimit:number 表示采到该数量就早停;null 表示无限制(沿用各 collector 硬上限)
    const itemLimit = record.catalogLimit

    let outcome: CollectorOutcome | null = null

    for (const key of order) {
      const result = await collectorMap[key](record, parsedUrl, delayMs, itemLimit)
      if (result.items.length > 0) {
        outcome = result
        break
      }
    }

    if (!outcome || outcome.items.length === 0) {
      throw new Error(
        `No products could be collected for platform=${record.platform} via ${formatAttemptedCollectors(order)}.`,
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

    markTaskDone(record, Date.now())
  } catch (error) {
    let message: string
    if (error instanceof SsrfBlockedError) {
      // SSRF 拦截:不要把内部细节(具体 IP / DNS 解析过程)暴露给用户,
      // 给一个通用错误消息,真实原因留在服务端日志里。
      console.warn(`[task ${record.id}] SSRF blocked: ${error.message}`)
      message = 'URL not allowed: target resolves to a private or reserved network.'
    } else {
      message = error instanceof Error ? error.message : 'Task execution failed.'
    }
    markTaskError(record, Date.now(), message)
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
        console.warn(`[task ${task.id}] recovered after worker restart, restarting from the beginning`)
        resetExecutionState(task, now)
        markTaskRunning(task, now)
        activeExecutions.set(task.id, executeTask(task.id))
        changed = true
      }
    }

    // 按 collector 类型分桶计数当前活跃任务,以便分类限流。
    // 浏览器型(MAX_ACTIVE_BROWSER_TASKS=1) vs HTTP 型(MAX_ACTIVE_HTTP_TASKS=2)。
    let httpActive = 0
    let browserActive = 0
    for (const id of activeExecutions.keys()) {
      const t = db.tasks.find((x) => x.id === id)
      if (!t) continue
      if (isBrowserTask(t.platform)) browserActive += 1
      else httpActive += 1
    }

    for (const task of db.tasks) {
      if (task.status !== 'pending' || activeExecutions.has(task.id)) {
        continue
      }

      const queuedAtMs = Date.parse(task.createdAt) || task.updatedAtMs || now

      if (now - queuedAtMs < TASK_QUEUE_DELAY_MS) {
        continue
      }

      // 分类限流:某类已满时跳过此 task,继续看下一个(可能另一类还有名额)
      const isBrowser = isBrowserTask(task.platform)
      if (isBrowser) {
        if (browserActive >= MAX_ACTIVE_BROWSER_TASKS) continue
      } else {
        if (httpActive >= MAX_ACTIVE_HTTP_TASKS) continue
      }

      resetExecutionState(task, now)
      markTaskRunning(task, now)
      activeExecutions.set(task.id, executeTask(task.id))
      if (isBrowser) browserActive += 1
      else httpActive += 1
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
}

export function stopTaskWorker() {
  if (!taskWorkerTimer) {
    return
  }

  clearInterval(taskWorkerTimer)
  taskWorkerTimer = null
}
