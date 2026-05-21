// AliExpress 单品采集器(POC,2026-05)。
//
// 反爬实测背景:
//   AliExpress 越南 IP 强制 302 跳 vi.aliexpress.com,且新版越南站 100% CSR
//   (window.runParams 是空对象,商品数据全靠 MTOP API 异步加载)。
//   纯 HTTP 拿不到数据,必须走 Playwright 让浏览器执行 JS。
//
// 设计要点:
//   1. 通过 browser-pool 取 BrowserContext(单例 Browser + 每任务 Context + 25 次重启)
//   2. 通过 proxy-pool 取用户代理,转 Playwright `proxy: { server, username, password }`
//   3. **不解析 DOM**,而是 page.on('response') 拦截 MTOP API 响应直接取 JSON。
//      DOM selector 在 AliExpress 频繁 A/B test 下不稳定;MTOP 字段名相对稳定。
//   4. 无代理直接 fail-fast(不走直连):越南站强制重定向 + 反爬命中率高,
//      直连基本拿不到数据,POC 阶段直接告诉用户配代理。
//   5. 失败一律返回空 items 不 throw —— 契约对齐 executeTask fallback 机制。

import { acquireBrowserContext, type BrowserContextLease } from '../browser-pool'
import { getDatabase } from '../data-store'
import {
  mapGenericProductToResult,
  reportCollectorProgress,
  type CollectorOutcome,
  type GenericCollectedProduct,
} from '../task-runtime'
import type { ProxyRecord, TaskResultRow, TaskRuntimeRecord } from '../../types'

const ALI_SOURCE = 'aliexpress-mtop'
const GOTO_TIMEOUT_MS = 35_000
const REPORT_PROGRESS_AT = 90

// 支持的 host:.com / .us / 各 locale 子域。其他 locale (in-en/de-en) 走 host=www + path 前缀。
const ALI_HOSTS = new Set<string>([
  'www.aliexpress.com',
  'aliexpress.com',
  'vi.aliexpress.com',
  'www.aliexpress.us',
  'aliexpress.us',
  'm.aliexpress.com',
  'pt.aliexpress.com',
  'ru.aliexpress.com',
  'es.aliexpress.com',
  'fr.aliexpress.com',
  'de.aliexpress.com',
  'it.aliexpress.com',
  'ja.aliexpress.com',
  'ko.aliexpress.com',
  'th.aliexpress.com',
  'ar.aliexpress.com',
  'tr.aliexpress.com',
])

// /item/{id}.html,可能有 locale 前缀(/in-en/item/...),也可能没有
const ALI_ITEM_PATTERN = /^\/(?:[a-z]{2}-[a-z]{2}\/)?item\/(\d{10,16})\.html?$/i

export type AliexpressUrlKind =
  | { kind: 'item'; itemId: string }
  | { kind: 'unsupported' }

export function recognizeAliexpressUrlKind(parsedUrl: URL): AliexpressUrlKind {
  if (!ALI_HOSTS.has(parsedUrl.hostname)) {
    return { kind: 'unsupported' }
  }
  const match = ALI_ITEM_PATTERN.exec(parsedUrl.pathname)
  if (match && match[1]) {
    return { kind: 'item', itemId: match[1] }
  }
  return { kind: 'unsupported' }
}

// MTOP endpoint 用 URL 子串匹配:阿里在 2024-2026 改过几次端点名。
// 这里列已知的所有变种,未来发现新名再补。
const MTOP_ENDPOINT_PATTERNS = [
  'mtop.aliexpress.pdp.pc.query',
  'mtop.aliexpress.itemdetail.pc.async',
  'mtop.aliexpress.itemdetail.msite',
  'mtop.aliexpress.itemdetail.detail',
  'mtop.aliexpress.detail.pc.async',
  '/h5/mtop.aliexpress.pdp',
  '/h5/mtop.aliexpress.itemdetail',
]

function isMtopUrl(url: string): boolean {
  return MTOP_ENDPOINT_PATTERNS.some((p) => url.includes(p))
}

// MTOP 返回有两种格式:
//   1. 纯 JSON: { "data": {...}, "api": "...", "ret": [...] }
//   2. JSONP: mtopjsonp1({ "data": {...} })   ← AliExpress vi 站默认走这个
// AliExpress 网页里 URL 带 type=originaljsonp&callback=mtopjsonp1 的就是 JSONP。
// 我们 strip 掉 callback wrapper 提取里面的 JSON。
function parseMtopBody(body: string): unknown {
  const trimmed = body.trim()
  // 先试纯 JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  // 再试 JSONP callback(...)
  const match = /^[a-zA-Z_$][\w$]*\s*\(([\s\S]*?)\)\s*;?\s*$/.exec(trimmed)
  if (match && match[1]) {
    try {
      return JSON.parse(match[1])
    } catch {
      return null
    }
  }
  return null
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 深度优先递归找第一个含某 key 的对象。提取多变 schema 的关键工具。
function findFirstWithKey(root: unknown, key: string): Record<string, unknown> | null {
  if (!isPlainObject(root)) return null
  if (key in root) return root
  for (const v of Object.values(root)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        const got = findFirstWithKey(item, key)
        if (got) return got
      }
    } else if (isPlainObject(v)) {
      const got = findFirstWithKey(v, key)
      if (got) return got
    }
  }
  return null
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => {
      if (typeof x === 'string') return x
      if (isPlainObject(x)) {
        const u = x['url'] ?? x['imgUrl'] ?? x['src']
        if (typeof u === 'string') return u
      }
      return null
    })
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
}

function normalizeImageUrl(raw: string, origin: string): string {
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('http')) return raw
  if (raw.startsWith('/')) return `${origin}${raw}`
  return raw
}

function asNumberLike(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    // 去掉货币符号、千分位逗号;欧式小数(','作小数点)兼容
    const cleaned = v.replace(/[^\d.,-]/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '')
    const n = Number(cleaned)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

export function extractAliexpressProduct(
  responses: unknown[],
  itemId: string,
  parsedUrl: URL,
): GenericCollectedProduct | null {
  let title: string | null = null
  let price: number | null = null
  let compareAtPrice: number | null = null
  let images: string[] = []
  let sku: string | null = null
  let vendor: string | null = null
  let inventory: number | null = null

  for (const resp of responses) {
    if (!isPlainObject(resp)) continue

    if (!title) {
      const mod = findFirstWithKey(resp, 'subject') ?? findFirstWithKey(resp, 'title')
      if (mod) {
        const c = mod['subject'] ?? mod['title']
        if (typeof c === 'string' && c.length > 0) title = c
      }
    }

    if (price === null) {
      const mod =
        findFirstWithKey(resp, 'minActivityAmount') ??
        findFirstWithKey(resp, 'formatedActivityPrice') ??
        findFirstWithKey(resp, 'salePrice')
      if (mod) {
        const minAmount = mod['minActivityAmount']
        const c = isPlainObject(minAmount)
          ? minAmount['value']
          : (mod['formatedActivityPrice'] ?? mod['salePrice'])
        price = asNumberLike(c)
      }
    }

    if (compareAtPrice === null) {
      const mod =
        findFirstWithKey(resp, 'maxActivityAmount') ??
        findFirstWithKey(resp, 'formatedPrice') ??
        findFirstWithKey(resp, 'originalPrice')
      if (mod) {
        const maxAmount = mod['maxActivityAmount']
        const c = isPlainObject(maxAmount)
          ? maxAmount['value']
          : (mod['formatedPrice'] ?? mod['originalPrice'])
        compareAtPrice = asNumberLike(c)
      }
    }

    if (images.length === 0) {
      const mod =
        findFirstWithKey(resp, 'imagePathList') ??
        findFirstWithKey(resp, 'imageList') ??
        findFirstWithKey(resp, 'images')
      if (mod) {
        const list = mod['imagePathList'] ?? mod['imageList'] ?? mod['images']
        images = asStringList(list).map((u) => normalizeImageUrl(u, parsedUrl.origin))
      }
    }

    if (!vendor) {
      const mod = findFirstWithKey(resp, 'storeName') ?? findFirstWithKey(resp, 'sellerName')
      if (mod) {
        const c = mod['storeName'] ?? mod['sellerName']
        if (typeof c === 'string' && c.length > 0) vendor = c
      }
    }

    if (inventory === null) {
      const mod = findFirstWithKey(resp, 'totalAvailQuantity') ?? findFirstWithKey(resp, 'inventory')
      if (mod) {
        const c = mod['totalAvailQuantity'] ?? mod['inventory']
        inventory = asNumberLike(c)
      }
    }

    if (!sku) {
      const mod = findFirstWithKey(resp, 'productSKUPropertyList')
      const list = mod?.['productSKUPropertyList']
      if (Array.isArray(list) && list.length > 0 && isPlainObject(list[0])) {
        const first = list[0]
        const skuValues = first['skuPropertyValues']
        if (Array.isArray(skuValues) && skuValues.length > 0 && isPlainObject(skuValues[0])) {
          const valueObj = skuValues[0] as Record<string, unknown>
          const id = valueObj['propertyValueIdLong'] ?? valueObj['propertyValueId']
          if (typeof id === 'string' || typeof id === 'number') sku = String(id)
        }
      }
    }
  }

  // 三大关键字段全空 → 提取失败
  if (!title && images.length === 0 && price === null) {
    return null
  }

  return {
    id: itemId,
    handle: itemId,
    url: parsedUrl.toString(),
    title,
    sku,
    price,
    compareAtPrice,
    images,
    inventory,
    tags: [],
    vendor,
  }
}

export async function tryAliexpressCollector(
  record: TaskRuntimeRecord,
  parsedUrl: URL,
  _delayMs: number,
  _itemLimit: number | null,
): Promise<CollectorOutcome> {
  const kind = recognizeAliexpressUrlKind(parsedUrl)

  if (kind.kind !== 'item') {
    console.warn(
      `[task ${record.id}] aliexpress: only /item/{id}.html supported in POC, got ${parsedUrl.hostname}${parsedUrl.pathname}`,
    )
    return { items: [], pageCount: 0, endpoint: null, source: ALI_SOURCE }
  }

  // 无代理直接 fail-fast:越南站地理强制重定向 + 反爬命中率高,直连基本无意义
  // 注:不用 pickProxyForUser 的 status='online' 过滤 —— HomeProxy 这类动态代理
  // IP 寿命短(几分钟),60s TCP probe 周期赶不上,几乎永远是 unknown/offline。
  // POC 阶段:挑用户最近创建的代理,不管 status。
  // 后续工程化:加 "dynamic proxy provider" 抽象,每任务实时调 rotate API 拿新代理。
  const db = await getDatabase()
  const proxyRecord: ProxyRecord | null =
    db.proxies
      .filter((p) => p.userId === record.userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null

  if (!proxyRecord) {
    console.warn(
      `[task ${record.id}] aliexpress: no proxy available, refusing to scrape direct (user must configure proxy)`,
    )
    return { items: [], pageCount: 0, endpoint: parsedUrl.toString(), source: ALI_SOURCE }
  }

  console.log(
    `[task ${record.id}] aliexpress: using proxy ${proxyRecord.host}:${proxyRecord.port} (status=${proxyRecord.status})`,
  )

  const proxyConfig = {
    server: `${proxyRecord.scheme}://${proxyRecord.host}:${proxyRecord.port}`,
    username: proxyRecord.username,
    password: proxyRecord.password,
  }

  let lease: BrowserContextLease | null = null
  const mtopResponses: unknown[] = []
  // 诊断用:记录所有 mtop / api 相关 URL(POC 阶段,生产可去掉)
  const seenApiUrls: string[] = []

  try {
    lease = await acquireBrowserContext({ userId: record.userId, proxy: proxyConfig })
    const page = await lease.context.newPage()

    // 必须在 goto 之前挂监听,否则前期请求会漏
    page.on('response', async (res) => {
      const url = res.url()
      // 记录所有 mtop / api 相关 URL(诊断用)
      if (url.includes('mtop') || url.includes('/api/') || url.includes('aliexpress.com/h5')) {
        seenApiUrls.push(url)
      }
      if (!isMtopUrl(url)) return
      try {
        const body = await res.text()
        const parsed = parseMtopBody(body)
        if (parsed !== null) {
          mtopResponses.push(parsed)
        }
      } catch {
        // 拿不到 body(response 已 dispose) → 静默跳过
      }
    })

    // 加 request 监控以诊断 0 拦截问题
    page.on('requestfailed', (req) => {
      const u = req.url()
      if (u.includes('aliexpress') || u.includes('mtop')) {
        console.warn(
          `[task ${record.id}] aliexpress request FAILED: ${u} (${req.failure()?.errorText})`,
        )
      }
    })

    try {
      // 用 networkidle 等所有 fetch 触发后再放手(上次实测能拦到 mtop 请求);
      // 即便最终 timeout 超时,所有 MTOP 响应已在监听里收齐。
      await page.goto(parsedUrl.toString(), {
        waitUntil: 'networkidle',
        timeout: GOTO_TIMEOUT_MS,
      })
    } catch (err) {
      const msg = (err as Error).message
      console.warn(`[task ${record.id}] aliexpress goto failed: ${msg}`)
      // 即便 goto timeout,可能已经拦到了部分响应,继续往下试一次提取
    }

    console.log(
      `[task ${record.id}] aliexpress: saw ${seenApiUrls.length} api urls, ${mtopResponses.length} MTOP json (mtop pattern hit)`,
    )
    if (seenApiUrls.length > 0 && mtopResponses.length === 0) {
      // 拦到 api 但没匹配 MTOP pattern:说明 endpoint 改了名
      console.log(
        `[task ${record.id}] aliexpress diag (first 10 api urls): ${seenApiUrls.slice(0, 10).join(' | ')}`,
      )
    }

    if (mtopResponses.length === 0) {
      console.warn(`[task ${record.id}] aliexpress: no MTOP response intercepted`)
      return { items: [], pageCount: 0, endpoint: parsedUrl.toString(), source: ALI_SOURCE }
    }

    const product = extractAliexpressProduct(mtopResponses, kind.itemId, parsedUrl)
    if (!product) {
      console.warn(
        `[task ${record.id}] aliexpress: extract returned null from ${mtopResponses.length} MTOP responses`,
      )
      // 诊断 dump:让我们看真实 MTOP 字段结构
      try {
        const fs = await import('node:fs/promises')
        const dumpPath = `${process.env.TEMP || '/tmp'}/ali_mtop_${record.id}.json`
        await fs.writeFile(dumpPath, JSON.stringify(mtopResponses, null, 2))
        console.log(`[task ${record.id}] aliexpress: dumped MTOP responses to ${dumpPath}`)
      } catch (e) {
        console.warn(`[task ${record.id}] aliexpress: dump failed: ${(e as Error).message}`)
      }
      return { items: [], pageCount: 0, endpoint: parsedUrl.toString(), source: ALI_SOURCE }
    }

    const items: TaskResultRow[] = [mapGenericProductToResult(product)]
    await reportCollectorProgress(record, items, REPORT_PROGRESS_AT)

    return {
      items,
      pageCount: 1,
      endpoint: parsedUrl.toString(),
      source: ALI_SOURCE,
    }
  } catch (err) {
    const msg = (err as Error).message
    console.warn(`[task ${record.id}] aliexpress collector error: ${msg}`)
    return { items: [], pageCount: 0, endpoint: parsedUrl.toString(), source: ALI_SOURCE }
  } finally {
    if (lease) await lease.release()
  }
}
