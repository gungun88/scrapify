import './src/env-loader'
import type { Config } from 'drizzle-kit'

export default {
  schema: './backend/src/db/schema.ts',
  out: './backend/src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://scrapify:scrapify_dev@localhost:5432/scrapify',
  },
  strict: true,
  verbose: true,
} satisfies Config
