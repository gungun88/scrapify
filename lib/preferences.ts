'use client'

import type { CatalogLimit, CollectConversation, UserPreferences } from '@/lib/types'
import { DEFAULT_CATALOG_LIMIT, DEFAULT_PLATFORM_ID } from '@/lib/mock/platforms'

/**
 * 极简前端的本地持久化层。
 *
 * ⚠ 本期使用 localStorage；后端就绪后只需替换函数实现即可，调用方无需改动。
 */

const PREFERENCES_KEY = 'scrapify:preferences:v2'
const CONVERSATIONS_KEY = 'scrapify:conversations:v2'

const DEFAULT_PREFERENCES: UserPreferences = {
  platform: DEFAULT_PLATFORM_ID,
  defaultMode: 'single',
  catalogLimit: DEFAULT_CATALOG_LIMIT,
}

function normalizeCatalogLimit(value: unknown): CatalogLimit {
  if (value === 'all') return 'all'
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  return DEFAULT_CATALOG_LIMIT
}

function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

/* ============== 偏好 ============== */

export function getPreferences(): UserPreferences {
  const raw = safeGet(PREFERENCES_KEY)
  if (!raw) return { ...DEFAULT_PREFERENCES }
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>
    return {
      platform: typeof parsed.platform === 'string' && parsed.platform ? parsed.platform : DEFAULT_PLATFORM_ID,
      defaultMode: parsed.defaultMode === 'catalog' ? 'catalog' : 'single',
      catalogLimit: normalizeCatalogLimit(parsed.catalogLimit),
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(preferences: UserPreferences) {
  safeSet(PREFERENCES_KEY, JSON.stringify(preferences))
}

/* ============== 会话聚合（前端虚拟概念） ============== */

export function getConversations(): CollectConversation[] {
  const raw = safeGet(CONVERSATIONS_KEY)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as CollectConversation[]
    if (!Array.isArray(arr)) return []
    return arr
  } catch {
    return []
  }
}

export function getConversation(id: string): CollectConversation | null {
  return getConversations().find((c) => c.id === id) ?? null
}

export function saveConversation(conv: CollectConversation) {
  const all = getConversations()
  const idx = all.findIndex((c) => c.id === conv.id)
  if (idx >= 0) {
    all[idx] = conv
  } else {
    all.unshift(conv)
  }
  safeSet(CONVERSATIONS_KEY, JSON.stringify(all.slice(0, 200)))
}

export function deleteConversation(id: string) {
  const all = getConversations().filter((c) => c.id !== id)
  safeSet(CONVERSATIONS_KEY, JSON.stringify(all))
}

export function generateConversationId() {
  return `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
