// 浏览器进程池:单例 Chromium + 每任务 Context + 累计重启策略。
//
// 为什么不每任务 launch:启动慢(~1.5s 冷启动),开销大。
// 为什么不复用 Context:Playwright Connection._objects HashMap 累积 leak
//   (microsoft/playwright#6319 / playwright-python#286),只有 close 才清。
//   结论:pool 浏览器,**不 pool context**。每任务起新 Context 干净状态。
//
// 累计重启:每 BROWSER_LEASE_RECYCLE_THRESHOLD 次 lease 后整体 close + 重启,
// 抵消 Playwright 已知 leak。25 是经验值,实测可调。
//
// 并发限制:由 task-runtime.ts 的 MAX_ACTIVE_BROWSER_TASKS 控制(POC = 1)。
// 这里只管 lease 生命周期,不管节流。
//
// 注:POC 阶段用原生 `playwright`。未来若 AliExpress 升级反爬识别到
// navigator.webdriver,切到 `rebrowser-playwright`(drop-in,只改 import 路径)。

import { chromium, type Browser, type BrowserContext } from 'playwright'

const BROWSER_LEASE_RECYCLE_THRESHOLD = 25

const CHROMIUM_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage', // 避免 Docker 默认 /dev/shm 64MB 崩溃
  '--disable-blink-features=AutomationControlled', // 屏蔽 navigator.webdriver(rebrowser 也处理,双保险)
  '--disable-background-timer-throttling',
  '--memory-pressure-off',
]

// 真实 Chrome UA;不能用 Playwright 默认 UA(那个有 "HeadlessChrome" 标记)
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let browser: Browser | null = null
let leaseCount = 0
let recyclePending: Promise<void> | null = null

export interface BrowserContextLease {
  context: BrowserContext
  release: () => Promise<void>
}

export interface AcquireOptions {
  userId: string
  proxy?: {
    server: string // 必须带 scheme,如 'http://1.2.3.4:8080'
    username?: string | null
    password?: string | null
  } | null
}

async function ensureBrowser(): Promise<Browser> {
  // 重启中:等待重启完成再继续
  if (recyclePending) {
    await recyclePending
  }
  if (browser && browser.isConnected()) {
    return browser
  }
  browser = await chromium.launch({
    headless: true,
    args: CHROMIUM_LAUNCH_ARGS,
  })
  leaseCount = 0
  console.log('[browser-pool] chromium launched')
  return browser
}

async function recycleBrowser(): Promise<void> {
  const prev = leaseCount
  console.log(`[browser-pool] recycling browser after ${prev} leases`)
  const oldBrowser = browser
  browser = null
  leaseCount = 0
  if (oldBrowser) {
    try {
      await oldBrowser.close()
    } catch (err) {
      console.warn(`[browser-pool] error during recycle close: ${(err as Error).message}`)
    }
  }
}

export async function acquireBrowserContext(
  opts: AcquireOptions,
): Promise<BrowserContextLease> {
  const b = await ensureBrowser()

  const contextOptions: Parameters<Browser['newContext']>[0] = {
    userAgent: DEFAULT_USER_AGENT,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    viewport: { width: 1920, height: 1080 },
  }

  if (opts.proxy) {
    contextOptions.proxy = {
      server: opts.proxy.server,
      // Playwright 类型要求 string,null/undefined 都转 undefined
      username: opts.proxy.username ?? undefined,
      password: opts.proxy.password ?? undefined,
    }
  }

  const context = await b.newContext(contextOptions)
  leaseCount += 1

  let released = false
  const release = async () => {
    if (released) return
    released = true
    try {
      await context.close()
    } catch (err) {
      console.warn(`[browser-pool] error closing context: ${(err as Error).message}`)
    }
    // 达阈值触发整体重启;并发安全:其他 release 看到 recyclePending != null 就不再触发
    if (leaseCount >= BROWSER_LEASE_RECYCLE_THRESHOLD && !recyclePending) {
      recyclePending = recycleBrowser().finally(() => {
        recyclePending = null
      })
    }
  }

  return { context, release }
}

// server.ts SIGTERM handler 调。如果正在重启,先等完。
export async function closeBrowserPool(): Promise<void> {
  if (recyclePending) {
    try {
      await recyclePending
    } catch {
      /* 重启中报错也无所谓,下面继续清理 */
    }
  }
  if (!browser) return
  const oldBrowser = browser
  browser = null
  leaseCount = 0
  try {
    await oldBrowser.close()
    console.log('[browser-pool] chromium closed')
  } catch (err) {
    console.warn(`[browser-pool] error during shutdown close: ${(err as Error).message}`)
  }
}
