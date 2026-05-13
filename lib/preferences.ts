'use client'

import type { CatalogLimit, UserPreferences } from '@/lib/types'
import { DEFAULT_CATALOG_LIMIT, DEFAULT_PLATFORM_ID } from '@/lib/mock/platforms'

/**
 * 用户偏好的本地持久化（platform / defaultMode / catalogLimit）。
 *
 * 偏好是设备级"上次怎么用"的便捷状态，写 localStorage 足够。
 * 会话记录（CollectConversation）从 2026-05-11 起改为后端按 user_id 存储，
 * 见 hooks/useConversations.ts。
 */

const PREFERENCES_KEY = 'scrapify:preferences:v2'

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
