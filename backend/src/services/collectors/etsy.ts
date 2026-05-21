// Etsy 单品 listing 采集器(POC,2026-05)。
//
// 设计要点:
//   1. 完全走 safeFetchWithRetry,继承用户级粘性代理与重试退避,不引入 Playwright/Crawlee。
//   2. Etsy listing 页 SSR 输出标准的 <script type="application/ld+json"> @type=Product,
//      字段完整(name/image/offers/brand/aggregateRating/sku),所以直接复用
//      task-runtime.ts 已有的 collectProductsFromJsonLd 即可,不重写解析器。
//   3. 失败一律返回空 items —— platform-registry 配置 etsy: ['etsy','html'],
//      返回空会让 executeTask 自动 fallback 到 html collector 再试一次通用 JSON-LD。
//      若 throw,executeTask 外层 try/catch 会直接把 task 标 error,绕开 fallback。
//   4. POC 范围只识别 listing URL(含多语言前缀),shop / search 走 fallback。
//
// 现状提醒(2026-05-17 端到端实测):
//   实测中 Etsy 对越南 IP 段整段拒收(VNPT + FPT 两个不同运营商 IP 都返回 403),
//   而且对 curl/HTTP-only 客户端的 TLS/JA4 指纹敏感度也很高。
//   也就是说,当前 collector 实际能成功的概率与"代理 IP 信誉 + 头部完整度"强绑定:
//     - 越南 / 数据中心代理 → 大概率 403,fallback 到 html collector 通常也 403,task error
//     - 美国住宅代理 + 完整桌面 Chrome 头 → 偶发成功
//     - 真要稳采集,需要升级到 Playwright(参见 aliexpress.ts + browser-pool.ts)
//   本 collector 留作 HTTP-only 平台扩展架构示例 + 美国代理下的轻量备选。

import type { TaskResultRow, TaskRuntimeRecord } from '../../types'
import { safeFetchWithRetry } from '../safe-http'
import {
  collectProductsFromJsonLd,
  mapGenericProductToResult,
  reportCollectorProgress,
  type CollectorOutcome,
  type GenericCollectedProduct,
} from '../task-runtime'

const ETSY_SOURCE = 'etsy-jsonld'
const REQUEST_TIMEOUT_MS = 15_000

// Etsy listing URL 形态:
//   /listing/123456
//   /listing/123456/some-slug
//   /in-en/listing/123456/some-slug?ref=...
//   /uk-en/listing/123456/some-slug
// locale 前缀固定为 "xx-xx"(两小写字母-两小写字母),不会和其他路径冲突。
const ETSY_LISTING_PATTERN = /^\/(?:[a-z]{2}-[a-z]{2}\/)?listing\/(\d+)(?:\/[^/?#]+)?\/?$/i

export type EtsyUrlKind =
  | { kind: 'listing'; listingId: string }
  | { kind: 'unsupported' }

export function recognizeEtsyUrlKind(parsedUrl: URL): EtsyUrlKind {
  const match = ETSY_LISTING_PATTERN.exec(parsedUrl.pathname)
  if (match && match[1]) {
    return { kind: 'listing', listingId: match[1] }
  }
  return { kind: 'unsupported' }
}

export async function tryEtsyCollector(
  record: TaskRuntimeRecord,
  parsedUrl: URL,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _delayMs: number,
  itemLimit: number | null,
): Promise<CollectorOutcome> {
  const kind = recognizeEtsyUrlKind(parsedUrl)

  if (kind.kind !== 'listing') {
    // shop / search / 其他形态 → POC 不支持,静默返回空走 fallback
    console.warn(
      `[task ${record.id}] etsy collector: only listing urls supported in POC, got ${parsedUrl.pathname}`,
    )
    return { items: [], pageCount: 0, endpoint: null, source: ETSY_SOURCE }
  }

  let html: string
  try {
    const response = await safeFetchWithRetry(
      parsedUrl,
      {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          // 用普通桌面 Chrome UA,只为过最基础的 UA 黑名单;
          // 不做指纹级伪装(那需要 Playwright + stealth,POC 范围外)。
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'accept-language': 'en-US,en;q=0.9',
        },
      },
      { timeoutMs: REQUEST_TIMEOUT_MS },
      { userId: record.userId },
    )

    if (!response.ok) {
      // 403 / 503 / CF challenge → 返回空让 html fallback 再试
      console.warn(
        `[task ${record.id}] etsy listing returned HTTP ${response.status}`,
      )
      return {
        items: [],
        pageCount: 0,
        endpoint: parsedUrl.toString(),
        source: ETSY_SOURCE,
      }
    }
    html = await response.text()
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'etsy fetch failed'
    console.warn(`[task ${record.id}] etsy fetch error: ${msg}`)
    return { items: [], pageCount: 0, endpoint: null, source: ETSY_SOURCE }
  }

  // 复用 task-runtime.ts:570 的 collectProductsFromJsonLd
  const products = collectProductsFromJsonLd(html, parsedUrl.origin)

  if (products.length === 0) {
    // 多半是 HTTP 200 + CF 验证码页(看似成功实际没数据)
    console.warn(
      `[task ${record.id}] etsy jsonld parse returned 0 products (cf challenge?)`,
    )
    return {
      items: [],
      pageCount: 0,
      endpoint: parsedUrl.toString(),
      source: ETSY_SOURCE,
    }
  }

  // Etsy JSON-LD 偶尔缺 @id / url,用 listingId 兜底注入到 id / handle / url
  const enriched: GenericCollectedProduct[] = products.map((p) => ({
    ...p,
    id: p.id || kind.listingId,
    handle: p.handle || kind.listingId,
    url: p.url || parsedUrl.toString(),
  }))

  const items: TaskResultRow[] = enriched.map(mapGenericProductToResult)
  const trimmed = itemLimit !== null ? items.slice(0, itemLimit) : items

  await reportCollectorProgress(record, trimmed, 90)

  return {
    items: trimmed,
    pageCount: 1,
    endpoint: parsedUrl.toString(),
    source: ETSY_SOURCE,
  }
}
