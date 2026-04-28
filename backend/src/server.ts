import cors from '@fastify/cors'
import Fastify from 'fastify'
import { backendConfig } from './config'
import { registerAnalyticsRoutes } from './routes/analytics'
import { registerFieldRoutes } from './routes/fields'
import { registerHealthRoutes } from './routes/health'
import { registerMonitorRoutes } from './routes/monitor'
import { registerProxyRoutes } from './routes/proxy'
import { registerScheduleRoutes } from './routes/schedule'
import { registerTaskRoutes } from './routes/tasks'
import { loadDatabase } from './services/data-store'

async function createServer() {
  const app = Fastify({ logger: true })

  await app.register(cors, {
    origin: backendConfig.corsOrigin === '*' ? true : backendConfig.corsOrigin,
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
  await loadDatabase()
  const app = await createServer()

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
