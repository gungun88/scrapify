import './env-loader'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { backendConfig } from './config'
import { closeDbConnections, getRedis, initDb } from './db/client'
import { registerAnalyticsRoutes } from './routes/analytics'
import { registerFieldRoutes } from './routes/fields'
import { registerHealthRoutes } from './routes/health'
import { registerMonitorRoutes } from './routes/monitor'
import { registerProxyRoutes } from './routes/proxy'
import { registerScheduleRoutes } from './routes/schedule'
import { registerTaskRoutes } from './routes/tasks'
import { loadDatabase } from './services/data-store'
import { startMonitorWorker } from './services/monitor-runtime'
import { startProxyWorker } from './services/proxy-runtime'
import { startScheduleWorker } from './services/schedule-runtime'
import { startTaskWorker } from './services/task-runtime'

async function createServer() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: backendConfig.corsOrigin === '*' ? true : backendConfig.corsOrigin,
    credentials: true,
  })

  await app.register(rateLimit, {
    max: backendConfig.rateLimit.global,
    timeWindow: backendConfig.rateLimit.timeWindow,
    redis: getRedis(),
    nameSpace: 'scrapify-rl-',
    keyGenerator: (request) => {
      const forwarded = request.headers['x-forwarded-for']
      if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0]?.trim() || request.ip
      }
      return request.ip
    },
  })

  await registerHealthRoutes(app)
  await registerTaskRoutes(app)
  await registerFieldRoutes(app)
  await registerScheduleRoutes(app)
  await registerMonitorRoutes(app)
  await registerProxyRoutes(app)
  await registerAnalyticsRoutes(app)

  return app
}

async function start() {
  await initDb()
  await loadDatabase()
  startTaskWorker()
  startScheduleWorker()
  startMonitorWorker()
  startProxyWorker()
  const app = await createServer()

  // 优雅关闭：让 PGlite 释放 postmaster.pid 锁，避免下次启动崩溃
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, 'shutting down gracefully')
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
