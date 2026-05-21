import type { Response as UndiciResponse } from 'undici'
import {
  getProxyAgent,
  isProxyConnectionError,
  pickProxyForUser,
  recordProxyFailure,
} from './proxy-pool'
import { SsrfBlockedError, safeFetch, type SafeFetchInit } from './url-guard'

// safeFetch 的重试包装层。
// 设计目标:
//   1. fetch 抛错(网络错误、DNS 失败、per-attempt 超时)→ 重试
//   2. 响应码 ∈ retryOnStatus(默认 5xx)→ 重试
//   3. 4xx / 2xx / SsrfBlockedError / 外部 signal 主动 abort → 不重试,直接传出
//   4. 每次 attempt 自带一个 AbortController 做 timeout 控制,
//      同时把外层 signal 接力到 inner,让用户主动取消(任务删除)能立即传播。
//
// 重试触发后从原始 URL 重新进入 safeFetch:hop 的 Location 是 response-specific,
// 不能从中间 hop 续(redirect 链路本身已经被 safeFetch 重做)。

export interface RetryOptions {
  // 总尝试次数(含首次),默认 3
  maxAttempts?: number
  // 第 n 次失败后等 baseDelay * 2^(n-1) + jitter,默认 1000ms
  baseDelayMs?: number
  // 退避封顶,默认 8000ms
  maxDelayMs?: number
  // 命中后认为是"暂时不可用"会重试,默认 [500,502,503,504]
  retryOnStatus?: readonly number[]
  // 单次 attempt 超时,默认 15s(与 task-runtime REQUEST_TIMEOUT_MS 对齐)
  timeoutMs?: number
  // 外部 abort 信号(任务取消)。aborted 时不再重试,立即 rethrow
  signal?: AbortSignal
}

// HttpContext 由调用方(task-runtime executeTask)在创建时传入,
// safe-http 内部据此挑代理。Phase 3a 不传 → 直接走直连。
export interface HttpContext {
  userId?: string
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 8000
const DEFAULT_RETRY_STATUS: readonly number[] = [500, 502, 503, 504]
const DEFAULT_TIMEOUT_MS = 15000

export class FetchRetryExhaustedError extends Error {
  readonly attempts: number
  readonly lastStatus: number | null
  readonly lastErrorMessage: string

  constructor(attempts: number, lastStatus: number | null, lastErrorMessage: string) {
    const detail = lastStatus !== null ? `HTTP ${lastStatus}` : lastErrorMessage
    super(`Fetch failed after ${attempts} attempt(s): ${detail}`)
    this.name = 'FetchRetryExhaustedError'
    this.attempts = attempts
    this.lastStatus = lastStatus
    this.lastErrorMessage = lastErrorMessage
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function computeBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // attempt 是已完成的失败次数(1, 2, 3...)。第 1 次失败后等 base,第 2 次后等 2×base,以此类推
  const exponential = baseDelayMs * 2 ** (attempt - 1)
  const jitter = Math.random() * 500
  return Math.min(exponential + jitter, maxDelayMs)
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError'
}

export async function safeFetchWithRetry(
  url: string | URL,
  init: SafeFetchInit = {},
  opts: RetryOptions = {},
  ctx: HttpContext = {},
): Promise<UndiciResponse> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const retryOnStatus = opts.retryOnStatus ?? DEFAULT_RETRY_STATUS
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const outerSignal = opts.signal

  // 粘性代理:整次 safeFetchWithRetry 调用内复用同一个代理,避免分页跨代理。
  // 没传 userId 或用户没配置任何在线代理 → null,走直连(fallback)。
  const stickyProxy = ctx.userId ? await pickProxyForUser(ctx.userId) : null
  const dispatcher = stickyProxy ? getProxyAgent(stickyProxy) : undefined
  if (ctx.userId && !stickyProxy) {
    // 显式打日志,运维方能看出"明明配了代理但当前没可用的"
    console.warn(
      `[safe-http] proxy_pool_empty_fallback_to_direct user=${ctx.userId} url=${typeof url === 'string' ? url : url.toString()}`,
    )
  }

  let lastErrorMessage = ''
  let lastStatus: number | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // 外部 signal 已 abort:不要再发起 attempt
    if (outerSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    // per-attempt AbortController:
    //   - timer 触发它 → per-attempt 超时(应重试)
    //   - 外部 signal abort → 接力触发它(应 rethrow,不重试)
    const innerController = new AbortController()
    const timer = setTimeout(() => innerController.abort(), timeoutMs)
    const forwardAbort = () => innerController.abort()
    outerSignal?.addEventListener('abort', forwardAbort, { once: true })

    try {
      const response = await safeFetch(url, {
        ...init,
        signal: innerController.signal,
        dispatcher,
      })

      // 响应到了。是不是要重试,看 status
      if (retryOnStatus.includes(response.status)) {
        lastStatus = response.status
        lastErrorMessage = `HTTP ${response.status}`
        // 释放 body,避免连接挂着
        try {
          await response.body?.cancel()
        } catch {}
        if (attempt < maxAttempts) {
          await sleep(computeBackoffDelay(attempt, baseDelayMs, maxDelayMs), outerSignal)
          continue
        }
        // 用完次数 → 最后一次的响应直接返回,让调用方按"非 ok"路径处理
        return response
      }

      // 成功路径(包括 2xx / 3xx 非 retry / 4xx 客户端错误)
      return response
    } catch (error) {
      // SsrfBlockedError 永远不重试
      if (error instanceof SsrfBlockedError) {
        throw error
      }

      if (isAbortError(error)) {
        // 外部 signal 触发的 abort → 用户主动取消,不重试
        if (outerSignal?.aborted) {
          throw error
        }
        // 否则是 per-attempt 超时,可重试
        lastErrorMessage = 'request timed out'
        lastStatus = null
      } else if (error instanceof Error) {
        lastErrorMessage = error.message
        lastStatus = null
      } else {
        lastErrorMessage = String(error)
        lastStatus = null
      }

      // 走代理时:连接级错误才算"代理本身坏了",递增 consecutive_failures。
      // 任何 HTTP 响应已经在上面 return 出去了,走不到这里;能进 catch 的 fetch 错误
      // 都是 transport-level / DNS / timeout。
      if (stickyProxy && isProxyConnectionError(error)) {
        await recordProxyFailure(stickyProxy.id).catch(() => {})
      }

      if (attempt < maxAttempts) {
        await sleep(computeBackoffDelay(attempt, baseDelayMs, maxDelayMs), outerSignal)
        continue
      }
      throw new FetchRetryExhaustedError(maxAttempts, lastStatus, lastErrorMessage)
    } finally {
      clearTimeout(timer)
      outerSignal?.removeEventListener('abort', forwardAbort)
    }
  }

  // 不应到达:循环里 attempt 用完会在 catch 抛出 FetchRetryExhaustedError,
  // 或在 retryOnStatus 用尽时 return response。兜底
  throw new FetchRetryExhaustedError(maxAttempts, lastStatus, lastErrorMessage || 'unknown')
}
