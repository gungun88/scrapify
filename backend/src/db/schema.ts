import { sql } from 'drizzle-orm'
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Phase 1：Google OAuth 接入后真实使用
// password_hash 改 nullable —— OAuth 用户没密码；email 仍唯一；google_sub 是 Google 用户稳定标识
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  googleSub: text('google_sub').unique(),
  displayName: text('display_name'),
  imageUrl: text('image_url'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  planId: text('plan_id').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// 业务表：Phase 1 起 user_id 改 NOT NULL，列表查询走 (user_id, created_at) 索引
export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').notNull(), // 完整 TaskRuntimeRecord
    startedAtMs: bigint('started_at_ms', { mode: 'number' }).notNull(),
    updatedAtMs: bigint('updated_at_ms', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('tasks_user_created_idx').on(table.userId, table.createdAt)],
)

// 会话表：前端"一次提交"聚合若干 Task。
// mode/platform/catalogLimit/urls/taskIds 都是只读快照，写一次后不再变更，
// 因此用 jsonb 直接落 payload 避免列爆炸（catalogLimit 又是 'all' | number 联合类型）。
export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    mode: text('mode').notNull(), // 'single' | 'catalog'
    platform: text('platform').notNull(),
    catalogLimit: jsonb('catalog_limit'), // number | 'all' | null
    urls: jsonb('urls').notNull(), // string[]
    taskIds: jsonb('task_ids').notNull(), // string[]
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('conversations_user_created_idx').on(table.userId, table.createdAt),
    // 路由层 normalizer 已经强制 mode ∈ {'single','catalog'},
    // DB 层再加 CHECK 做纵深防御:迁移脚本 / 控制台直写 / 未来的批量导入都被拦下。
    check('conversations_mode_check', sql`${table.mode} IN ('single', 'catalog')`),
  ],
)

// 用户配置的 HTTP(S) 代理池。task-runtime 经 safeFetchWithRetry 通过 ProxyAgent 走它。
// status / latency_ms / last_checked_at / consecutive_failures 由 proxy-runtime
// worker 60s TCP 探活刷写;status 转换才落盘,中间只更新内存(详见 proxy-runtime.ts)。
//
// 密码字段明文:后端在 docker 内网,PG 不直接对外。若未来有备份外流诉求再上加密。
export const proxies = pgTable(
  'proxies',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scheme: text('scheme').notNull(), // 'http' | 'https'
    host: text('host').notNull(),
    port: integer('port').notNull(),
    username: text('username'),
    password: text('password'),
    label: text('label'),
    countryCode: text('country_code'),
    status: text('status').notNull().default('unknown'), // 'online' | 'offline' | 'unknown'
    latencyMs: integer('latency_ms'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('proxies_user_created_idx').on(table.userId, table.createdAt),
    check('proxies_scheme_check', sql`${table.scheme} IN ('http', 'https')`),
    check('proxies_status_check', sql`${table.status} IN ('online', 'offline', 'unknown')`),
    check('proxies_port_check', sql`${table.port} BETWEEN 1 AND 65535`),
  ],
)
