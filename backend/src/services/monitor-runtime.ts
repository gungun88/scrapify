import { getDatabase, saveDatabase } from './data-store'
import { extractNextDataPayload, nowIso, roundTo, trimHistory } from './runtime-utils'

const MONITOR_TICK_MS = 20_000
const HISTORY_LIMIT = 7
const REQUEST_TIMEOUT_MS = 15_000
const USER_AGENT = 'Scrapify/0.1'
const PRICE_KEYS = new Set([
  'price',
  'saleprice',
  'regularprice',
  'finalprice',
  'priceincltax',
  'currentprice',
  'offerprice',
  'lowprice',
  'highprice',
])

let monitorWorkerTimer: NodeJS.Timeout | null = null
let monitorWorkerBusy = false

type PriceCandidate = {
  price: number
  source: 'jsonld' | 'next-data' | 'markup' | 'script'
  confidence: number
}

function normalizeUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
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

function looksLikeUnavailablePage(html: string) {
  const normalized = normalizeWhitespace(decodeHtml(html)).toLowerCase()

  return [
    'page not found',
    '404',
    'unavailable product',
    '500 internal server error',
    'not found',
  ].some((token) => normalized.includes(token))
}

function extractNumericPrice(rawValue: string, currencySymbol: string) {
  const cleaned = decodeHtml(rawValue)
    .replace(new RegExp(escapeRegExp(currencySymbol), 'g'), '')
    .replace(/[, ]/g, '')
    .trim()

  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!match) {
    return null
  }

  const numeric = Number(match[0])
  if (!Number.isFinite(numeric)) {
    return null
  }

  return roundTo(numeric, 2)
}

function pushCandidate(
  candidates: Map<string, PriceCandidate>,
  rawValue: string | number,
  currencySymbol: string,
  source: PriceCandidate['source'],
  confidence: number,
) {
  const price = extractNumericPrice(String(rawValue), currencySymbol)
  if (price === null || price <= 0) {
    return
  }

  const key = price.toFixed(2)
  const existing = candidates.get(key)
  if (!existing || existing.confidence < confidence) {
    candidates.set(key, {
      price,
      source,
      confidence,
    })
  }
}

function collectPriceCandidatesFromJsonLd(html: string, currencySymbol: string) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const candidates = new Map<string, PriceCandidate>()

  for (const [, content] of scripts) {
    try {
      const parsed = JSON.parse(content.trim()) as unknown
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed]

      while (queue.length > 0) {
        const current = queue.shift()
        if (!current || typeof current !== 'object') {
          continue
        }

        const value = current as Record<string, unknown>
        const offers = value.offers

        for (const key of Object.keys(value)) {
          if (!PRICE_KEYS.has(key.toLowerCase())) {
            continue
          }

          const candidate = value[key]
          if (typeof candidate === 'string' || typeof candidate === 'number') {
            pushCandidate(candidates, candidate, currencySymbol, 'jsonld', 5)
          }
        }

        if (Array.isArray(offers)) {
          queue.push(...offers)
        } else if (offers && typeof offers === 'object') {
          queue.push(offers)
        }

        for (const nested of Object.values(value)) {
          if (Array.isArray(nested)) {
            queue.push(...nested)
          } else if (nested && typeof nested === 'object') {
            queue.push(nested)
          }
        }
      }
    } catch {}
  }

  return [...candidates.values()]
}

function collectPriceCandidatesFromNextData(html: string, currencySymbol: string) {
  const parsed = extractNextDataPayload(html)
  if (!parsed) {
    return []
  }

  const candidates = new Map<string, PriceCandidate>()

  try {
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed]

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current || typeof current !== 'object') {
        continue
      }

      const value = current as Record<string, unknown>

      for (const key of Object.keys(value)) {
        if (!PRICE_KEYS.has(key.toLowerCase())) {
          continue
        }

        const candidate = value[key]
        if (typeof candidate === 'string' || typeof candidate === 'number') {
          pushCandidate(candidates, candidate, currencySymbol, 'next-data', 4)
        }
      }

      for (const nested of Object.values(value)) {
        if (Array.isArray(nested)) {
          queue.push(...nested)
        } else if (nested && typeof nested === 'object') {
          queue.push(nested)
        }
      }
    }
  } catch {}

  return [...candidates.values()]
}

function collectPriceCandidatesFromMarkup(html: string, currencySymbol: string) {
  const normalizedHtml = normalizeWhitespace(decodeHtml(html))
  const candidates = new Map<string, PriceCandidate>()
  const amountPatterns = [
    /property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/gi,
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/gi,
    /data-product-price=["']([^"']+)["']/gi,
    /data-sale-price=["']([^"']+)["']/gi,
    /class=["'][^"']*price[^"']*["'][^>]*>\s*([^<]{1,60})</gi,
    /class=["'][^"']*money[^"']*["'][^>]*>\s*([^<]{1,60})</gi,
    /(?:price|saleprice|regularprice|finalprice|currentprice|offerprice|priceincltax)["']?\s*[:=]\s*["']([^"'<>]{1,40})["']/gi,
    /(?:price|saleprice|regularprice|finalprice|currentprice|offerprice|priceincltax)\D{0,30}([$€£]\s*\d[\d,.]{0,12})/gi,
    /([$€£]\s*\d[\d,.]{0,12})/gi,
  ]

  for (const pattern of amountPatterns) {
    for (const match of normalizedHtml.matchAll(pattern)) {
      const candidate = match[1]
      if (!candidate) {
        continue
      }

      const confidence = pattern.source.includes('([$€£]') ? 1.5 : 3
      pushCandidate(candidates, candidate, currencySymbol, 'markup', confidence)
    }
  }

  return [...candidates.values()]
}

function collectPriceCandidatesFromScripts(html: string, currencySymbol: string) {
  const candidates = new Map<string, PriceCandidate>()
  const scriptContents = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
  const keyValuePattern =
    /["'](?:price|salePrice|regularPrice|finalPrice|priceInclTax|currentPrice|offerPrice|lowPrice|highPrice)["']\s*:\s*["']?([^"',}\]]{1,40})["']?/gi

  for (const [, script] of scriptContents) {
    for (const match of script.matchAll(keyValuePattern)) {
      if (!match[1]) {
        continue
      }

      pushCandidate(candidates, match[1], currencySymbol, 'script', 2.5)
    }
  }

  return [...candidates.values()]
}

function buildReferencePrice(history: number[], currentPrice: number) {
  const nonZeroValues = [...history.filter((value) => value > 0), currentPrice].filter((value) => value > 0)
  if (nonZeroValues.length === 0) {
    return null
  }

  const recentValues = nonZeroValues.slice(-3).sort((left, right) => left - right)
  return recentValues[Math.floor(recentValues.length / 2)] ?? nonZeroValues[nonZeroValues.length - 1]
}

function scoreCandidate(candidate: PriceCandidate, referencePrice: number | null) {
  let score = candidate.confidence

  if (referencePrice && referencePrice > 0) {
    const ratio = candidate.price / referencePrice

    if (ratio >= 0.6 && ratio <= 1.6) {
      score += 4
    } else if (ratio >= 0.25 && ratio <= 3.5) {
      score += 2
    } else if (ratio < 0.05 || ratio > 12) {
      score -= 7
    } else if (ratio < 0.15 || ratio > 6) {
      score -= 4
    }

    if (referencePrice >= 50 && candidate.price <= 3) {
      score -= 8
    }
  }

  if (candidate.source === 'jsonld' || candidate.source === 'next-data') {
    score += 1
  }

  return score
}

function selectBestMonitorPrice(html: string, currencySymbol: string, history: number[], currentPrice: number) {
  const referencePrice = buildReferencePrice(history, currentPrice)
  const candidates = [
    ...collectPriceCandidatesFromJsonLd(html, currencySymbol),
    ...collectPriceCandidatesFromNextData(html, currencySymbol),
    ...collectPriceCandidatesFromMarkup(html, currencySymbol),
    ...collectPriceCandidatesFromScripts(html, currencySymbol),
  ]

  if (candidates.length === 0) {
    return null
  }

  const bestCandidate = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, referencePrice),
    }))
    .sort((left, right) => right.score - left.score || right.candidate.price - left.candidate.price)[0]

  if (!bestCandidate || bestCandidate.score < 2) {
    return null
  }

  if (referencePrice && referencePrice >= 50) {
    const collapseRatio = bestCandidate.candidate.price / referencePrice
    const isWeakSource = bestCandidate.candidate.source === 'markup' || bestCandidate.candidate.source === 'script'

    // Block obvious metadata pollution such as og:price=0/1 on JS-heavy product pages.
    if (bestCandidate.candidate.price <= 3 || (collapseRatio < 0.1 && isWeakSource && bestCandidate.score < 8)) {
      return null
    }
  }

  return bestCandidate.candidate.price
}

async function fetchPageHtml(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': USER_AGENT,
      },
      signal: controller.signal,
    })

    if (response.status === 404) {
      return {
        status: 'not-found' as const,
        html: '',
      }
    }

    const html = await response.text()

    if (!response.ok) {
      throw new Error(`Monitor request failed with HTTP ${response.status}.`)
    }

    return {
      status: 'ok' as const,
      html,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Monitor request timed out.')
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function deriveNextMonitorState(previousHistory: number[], previousPrice: number, nextPrice: number) {
  const nextHistory = trimHistory([...previousHistory, nextPrice], HISTORY_LIMIT)
  const previousComparable = nextHistory.length >= 2 ? nextHistory[nextHistory.length - 2] : previousPrice
  const nextChange =
    previousComparable > 0 && nextPrice > 0 ? roundTo(((nextPrice - previousComparable) / previousComparable) * 100, 1) : 0

  return {
    nextHistory,
    nextChange,
    nextStatus: nextPrice === 0 ? ('outofstock' as const) : nextChange > 0.4 ? ('up' as const) : nextChange < -0.4 ? ('down' as const) : ('stable' as const),
  }
}

async function refreshMonitorItems() {
  if (monitorWorkerBusy) {
    return
  }

  monitorWorkerBusy = true

  try {
    const db = await getDatabase()
    const checkedAt = Date.now()
    let changed = false

    for (const item of db.monitorItems) {
      try {
        const response = await fetchPageHtml(normalizeUrl(item.url))
        let nextPrice = item.price

        if (response.status === 'not-found') {
          item.lastCheckedAt = nowIso(checkedAt)
          changed = true
          continue
        } else {
          if (looksLikeUnavailablePage(response.html)) {
            item.lastCheckedAt = nowIso(checkedAt)
            changed = true
            continue
          }

          const parsedPrice = selectBestMonitorPrice(response.html, item.currency, item.history, item.price)

          if (parsedPrice === null) {
            item.lastCheckedAt = nowIso(checkedAt)
            changed = true
            continue
          }

          nextPrice = parsedPrice
        }

        const { nextHistory, nextChange, nextStatus } = deriveNextMonitorState(item.history, item.price, nextPrice)
        item.price = nextPrice
        item.history = nextHistory
        item.change = nextChange
        item.status = nextStatus
        item.lastCheckedAt = nowIso(checkedAt)
        changed = true
      } catch {
        item.lastCheckedAt = nowIso(checkedAt)
        changed = true
      }
    }

    if (changed) {
      await saveDatabase()
    }
  } finally {
    monitorWorkerBusy = false
  }
}

export function startMonitorWorker() {
  if (monitorWorkerTimer) {
    return
  }

  void refreshMonitorItems()
  monitorWorkerTimer = setInterval(() => {
    void refreshMonitorItems()
  }, MONITOR_TICK_MS)
  monitorWorkerTimer.unref?.()
}

export function stopMonitorWorker() {
  if (!monitorWorkerTimer) {
    return
  }

  clearInterval(monitorWorkerTimer)
  monitorWorkerTimer = null
}

export async function runMonitorRefresh() {
  await refreshMonitorItems()
}
