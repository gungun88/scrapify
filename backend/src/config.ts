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
    // 全局默认上限(按 user-id 或 IP):敏感端点通过路由级 config.rateLimit 单独收紧。
    // 前端 /api/tasks 每 2s 轮询一次 ≈ 30 次/分钟,加上其它浏览操作,200 留足余量。
    global: Number(process.env.RATE_LIMIT_GLOBAL_PER_MIN || 200),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },
}

// 启动期硬性校验：corsOrigin 必须是具体 origin 字符串，
// 不允许 '*' 或空 —— 配合 credentials: true 会让浏览器拒绝请求，
// 与其在运行时静默失败,不如启动就 crash 让运维立刻发现配置问题。
export function assertBackendConfig(): void {
  const origin = backendConfig.corsOrigin.trim()
  if (!origin || origin === '*') {
    throw new Error(
      'BACKEND_CORS_ORIGIN must be a specific origin (e.g. https://your.domain). ' +
        '"*" or empty value is rejected because credentials: true requires explicit origin.',
    )
  }
  if (!backendConfig.hmacSecret) {
    throw new Error(
      'SCRAPIFY_BACKEND_HMAC_SECRET is required. Generate one with `openssl rand -base64 32`.',
    )
  }
}
