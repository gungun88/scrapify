import path from 'node:path'

export const backendConfig = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.BACKEND_CORS_ORIGIN || 'http://localhost:3000',
  dataFile: process.env.BACKEND_DATA_FILE || path.join(process.cwd(), 'backend', 'data', 'db.json'),
}
