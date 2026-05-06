import { sql } from 'drizzle-orm'
import { bigint, boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// Phase 0：占位 users 表
// Phase 1 才会真正使用；先建出来避免后续再迁移破坏业务表外键。
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  planId: text('plan_id').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// 业务表 — Phase 0 全部 user_id nullable，Phase 1 改 not null + 索引
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  status: text('status').notNull(),
  payload: jsonb('payload').notNull(), // 完整 TaskRuntimeRecord
  startedAtMs: bigint('started_at_ms', { mode: 'number' }).notNull(),
  updatedAtMs: bigint('updated_at_ms', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const fieldConfigs = pgTable('field_configs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  path: text('path').notNull(),
  type: text('type').notNull(),
  enabled: boolean('enabled').notNull().default(true),
})
