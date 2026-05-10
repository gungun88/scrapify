import { sql } from 'drizzle-orm'
import { bigint, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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
