import './env-loader'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { assertBackendConfig, backendConfig } from './config'
import { closeDbConnections, getRedis, initDb } from './db/client'
import { requireUser } from './middleware/require-user'
import { registerConversationRoutes } from './routes/conversations'
import { registerHealthRoutes } from './routes/health'
import { registerProxyRoutes } from './routes/proxies'
import { registerTaskRoutes } from './routes/tasks'
import { registerUserRoutes } from './routes/users'
import { closeBrowserPool } from './services/browser-pool'
import { loadDatabase } from './services/data-store'
import { closeAllProxyAgents } from './services/proxy-pool'
import { startProxyWorker, stopProxyWorker } from './services/proxy-runtime'
import { startTaskWorker } from './services/task-runtime'

async function createServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      // 不要让 X-User-* / cookie / authorization 进日志:
      // 即便后端在内网,日志可能流转到对象存储/外部 SIEM,泄露这些等于泄露身份链路。
      redact: {
        paths: [
          'req.headers["x-user-sub"]',
          'req.headers["x-user-email"]',
          'req.headers["x-user-name"]',
          'req.headers["x-user-image"]',
          'req.headers["x-user-sig"]',
          'req.headers["x-user-ts"]',
          'req.headers.authorization',
          'req.headers.cookie',
        ],
        censor: '[REDACTED]',
      },
    },
    // 限制请求体大小:64KB 远大于合理的 conversation/task payload,
    // 防止恶意大 body 占用内存和带宽。
    bodyLimit: 64 * 1024,
  })

  await app.register(cors, {
    // corsOrigin 已经在启动时被 assertBackendConfig 校验为具体 origin,
    // 不允许 '*'(浏览器配 credentials: true 时会拒绝 '*')
    origin: backendConfig.corsOrigin,
    credentials: true,
  })

  await app.register(rateLimit, {
    // 全局默认 200/min/user(GET 轮询 + 浏览操作够用)。
    // 敏感写入端点在 routes 文件里通过 `config.rateLimit` 单独收紧。
    global: true,
    max: backendConfig.rateLimit.global,
    timeWindow: backendConfig.rateLimit.timeWindow,
    redis: getRedis(),
    nameSpace: 'scrapify-rl-',
    keyGenerator: (request) => {
      // 已登录用户(HMAC 签名 header 存在)按 user-id 限流;否则按 IP。
      // 注意:这里只是用 header 做 bucket 区分,认证仍由 requireUser hook 做,
      // 不会因为 header 被伪造就让攻击者绕过身份校验。
      const sub = request.headers['x-user-sub']
      if (typeof sub === 'string' && sub.length > 0) {
        return `user:${sub}`
      }
      const forwarded = request.headers['x-forwarded-for']
      if (typeof forwarded === 'string' && forwarded.length > 0) {
        return `ip:${forwarded.split(',')[0]?.trim() || request.ip}`
      }
      return `ip:${request.ip}`
    },
  })

  // 全局鉴权 hook：/api/health 公开放行（hook 内部判断），其余 endpoint 必须带签名
  app.addHook('preHandler', requireUser)

  await registerHealthRoutes(app)
  await registerUserRoutes(app)
  await registerTaskRoutes(app)
  await registerConversationRoutes(app)
  await registerProxyRoutes(app)

  return app
}

async function start() {
  assertBackendConfig()
  await initDb()
  await loadDatabase()
  startTaskWorker()
  startProxyWorker()
  const app = await createServer()

  // 优雅关闭：让 PGlite 释放 postmaster.pid 锁，避免下次启动崩溃
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, 'shutting down gracefully')
    stopProxyWorker()
    try {
      await closeAllProxyAgents()
    } catch (error) {
      app.log.error({ err: error }, 'error closing proxy agents')
    }
    // 关闭浏览器池(Playwright):必须在 app.close 之前,
    // 否则 Chromium 子进程会变 zombie(docker init=true 会兜底但不可依赖)
    try {
      await closeBrowserPool()
    } catch (error) {
      app.log.error({ err: error }, 'error closing browser pool')
    }
    try {
      await app.close()
    } catch (error) {
      app.log.error({ err: error }, 'error closing fastify')
    }
    try {
      await closeDbConnections()
    } catch (error) {
      app.log.error({ err: error }, 'error closing db connections')
    }
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  try {
    await app.listen({
      host: backendConfig.host,
      port: backendConfig.port,
    })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void start()
