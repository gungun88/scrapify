import path from 'node:path'

export const backendConfig = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.BACKEND_CORS_ORIGIN || 'http://localhost:3000',
  seedDataFile: path.join(process.cwd(), 'backend', 'data', 'db.json'),
  dataFile: process.env.BACKEND_DATA_FILE || path.join(process.cwd(), 'backend', 'data', 'runtime.json'),
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://scrapify:scrapify_dev@localhost:5432/scrapify',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  rateLimit: {
    global: Number(process.env.RATE_LIMIT_GLOBAL_PER_MIN || 100),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },
}
