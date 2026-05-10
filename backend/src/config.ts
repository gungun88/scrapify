export const backendConfig = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.BACKEND_CORS_ORIGIN || 'http://localhost:3000',
  databaseUrl:
    process.env.DATABASE_URL || 'postgres://scrapify:scrapify_dev@localhost:5432/scrapify',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // 前端 app/api/* 用此密钥签名 X-User-* header，后端 requireUser 验签
  hmacSecret: process.env.SCRAPIFY_BACKEND_HMAC_SECRET || '',
  rateLimit: {
    global: Number(process.env.RATE_LIMIT_GLOBAL_PER_MIN || 100),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },
}
