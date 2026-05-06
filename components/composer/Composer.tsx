'use client'

import { ArrowUp, Loader2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CatalogLimitPicker } from '@/components/ui/CatalogLimitPicker'
import { PlatformPicker } from '@/components/ui/PlatformPicker'
import { useSidebarRefresh } from '@/components/layout/SidebarRefreshContext'
import { useFields } from '@/hooks/useFields'
import {
  DEFAULT_CATALOG_LIMIT,
  DEFAULT_PLATFORM_ID,
  getPlatformLabel,
  reconcilePlatform,
} from '@/lib/mock/platforms'
import {
  generateConversationId,
  getPreferences,
  saveConversation,
  savePreferences,
} from '@/lib/preferences'
import type { CatalogLimit, CollectConversation, CollectMode, NewTaskForm, Task } from '@/lib/types'
import { cn } from '@/lib/utils'

const PLACEHOLDER: Record<CollectMode, string> = {
  single: '粘贴一个或多个商品 URL（每行一个）...',
  catalog: '粘贴一个目录 / 集合 URL...',
}

interface ComposerProps {
  embedded?: boolean
  navigateAfterSubmit?: boolean
  onSubmitted?: (conversation: CollectConversation) => void
}

export function Composer({
  embedded = false,
  navigateAfterSubmit = true,
  onSubmitted,
}: ComposerProps) {
  const router = useRouter()
  const bumpSidebar = useSidebarRefresh()
  const fieldsQuery = useFields()

  const [mode, setMode] = useState<CollectMode>('single')
  const [text, setText] = useState('')
  const [platform, setPlatform] = useState<string>(DEFAULT_PLATFORM_ID)
  const [catalogLimit, setCatalogLimit] = useState<CatalogLimit>(DEFAULT_CATALOG_LIMIT)
  const [submitting, setSubmitting] = useState(false)
  const [hint, setHint] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // 加载偏好
  useEffect(() => {
    const p = getPreferences()
    setMode(p.defaultMode)
    setPlatform(reconcilePlatform(p.platform, p.defaultMode))
    setCatalogLimit(p.catalogLimit)
  }, [])

  // 切换 mode 时校正 platform：不在新 mode 中可用就回退到 auto
  useEffect(() => {
    setPlatform((curr) => reconcilePlatform(curr, mode))
  }, [mode])

  // 自适应高度
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 140), 360)}px`
  }, [text])

  const enabledFieldIds = useMemo(
    () => (fieldsQuery.data ?? []).filter((f) => f.enabled).map((f) => f.id),
    [fieldsQuery.data],
  )

  const urlLines = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    [text],
  )

  const validUrls = urlLines.filter((u) => /^https?:\/\//i.test(u))
  const invalidCount = urlLines.length - validUrls.length

  const effectiveUrls = mode === 'catalog' ? validUrls.slice(0, 1) : validUrls

  // URL 模式检测：用户在「单品」框粘了目录链接（或反过来）时给软提示
  // 仅看会被实际提交的那部分（catalog 模式下只校验第 1 行）
  const mismatchedCount = useMemo(() => {
    const targets = mode === 'catalog' ? validUrls.slice(0, 1) : validUrls
    let count = 0
    for (const u of targets) {
      const detected = detectUrlMode(u)
      if (detected !== 'unknown' && detected !== mode) count++
    }
    return count
  }, [validUrls, mode])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
    }
  }

  async function submit() {
    setHint(null)

    if (effectiveUrls.length === 0) {
      setHint({ kind: 'error', text: '请粘贴至少一个 http(s) 链接。' })
      return
    }
    if (fieldsQuery.isLoading) {
      setHint({ kind: 'error', text: '字段配置仍在加载，请稍候。' })
      return
    }
    if (fieldsQuery.isError) {
      setHint({ kind: 'error', text: fieldsQuery.error.message })
      return
    }
    if (enabledFieldIds.length === 0) {
      setHint({ kind: 'error', text: '当前没有启用的采集字段，请到个人中心配置。' })
      return
    }

    setSubmitting(true)
    try {
      const taskIds: string[] = []
      for (const url of effectiveUrls) {
        const body: NewTaskForm = {
          url,
          mode: mode === 'catalog' ? 'full' : 'price-only',
          region: 'auto',
          fields: enabledFieldIds,
          concurrency: mode === 'catalog' ? 5 : 3,
          delay: '1-3s',
        }
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const message = await res.text().catch(() => '')
          throw new Error(message || `提交失败 (${res.status})`)
        }
        const task = (await res.json()) as Task
        taskIds.push(task.id)
      }

      const conv: CollectConversation = {
        id: generateConversationId(),
        title: buildTitle(mode, platform, effectiveUrls.length),
        mode,
        platform,
        catalogLimit: mode === 'catalog' ? catalogLimit : undefined,
        urls: effectiveUrls,
        taskIds,
        createdAt: new Date().toISOString(),
      }
      saveConversation(conv)
      bumpSidebar()
      onSubmitted?.(conv)
      setText('')

      if (navigateAfterSubmit) {
        router.push(`/c/${conv.id}`)
      } else {
        setHint({ kind: 'info', text: `已提交 ${effectiveUrls.length} 个任务。` })
      }
    } catch (error) {
      setHint({
        kind: 'error',
        text: error instanceof Error ? error.message : '提交失败，请稍后重试。',
      })
    } finally {
      setSubmitting(false)
    }
  }

  function persistAsDefault() {
    savePreferences({ platform, defaultMode: mode, catalogLimit })
    setHint({ kind: 'info', text: '当前选择已保存为默认偏好。' })
  }

  return (
    <div className={cn('w-full', embedded ? '' : 'mx-auto max-w-[920px]')}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div
          className={cn(
            'rounded-2xl border-[1.5px] border-line-strong bg-surface',
            'transition-shadow focus-within:shadow-[0_4px_36px_rgba(0,0,0,0.08)]',
          )}
        >
          {/* 模式切换 */}
          <div className="flex items-center gap-2 border-b border-line px-7 py-3.5">
            <ModeRadio active={mode === 'single'} onClick={() => setMode('single')} label="单品" />
            <ModeRadio active={mode === 'catalog'} onClick={() => setMode('catalog')} label="目录" />
            <span className="ml-auto text-[14px] text-ink-subtle">
              {mode === 'single' ? '支持每行一个 URL，批量提交' : '一次仅采集一个集合页'}
            </span>
          </div>

          {/* 多行输入 */}
          <div className="px-7 pt-6">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDER[mode]}
              rows={5}
              className="block w-full resize-none border-0 bg-transparent text-[17px] leading-7 text-ink placeholder:text-ink-subtle focus:outline-none"
            />
          </div>

          {/* 平台选择（折叠 chip） */}
          <div className="flex items-center gap-2.5 px-7 pb-4 pt-2">
            <span className="text-[13.5px] font-medium uppercase tracking-wider text-ink-subtle">
              平台
            </span>
            <PlatformPicker mode={mode} value={platform} onChange={setPlatform} variant="compact" />
          </div>

          {/* 商品数（仅目录模式） */}
          {mode === 'catalog' ? (
            <div className="flex items-center gap-2.5 px-7 pb-4">
              <span className="text-[13.5px] font-medium uppercase tracking-wider text-ink-subtle">
                商品数
              </span>
              <CatalogLimitPicker value={catalogLimit} onChange={setCatalogLimit} variant="compact" />
            </div>
          ) : null}

          {/* 提交栏 */}
          <div className="flex items-center gap-3 border-t border-line px-7 py-3.5">
            <button
              type="button"
              onClick={persistAsDefault}
              className="flex h-9 w-9 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
              title="将当前选择保存为默认偏好"
              aria-label="保存为默认偏好"
            >
              <Plus size={18} strokeWidth={2.4} />
            </button>

            <div className="flex-1 text-[14.5px] text-ink-subtle">
              {urlLines.length === 0 ? (
                <span>按 ⌘ / Ctrl + Enter 提交</span>
              ) : mode === 'catalog' ? (
                <span>
                  目录模式：将采集 <span className="font-semibold text-ink">{effectiveUrls.length}</span> 个集合页
                  {urlLines.length > 1 ? <span className="text-ink-subtle">（多余行将被忽略）</span> : null}
                </span>
              ) : (
                <span>
                  检测到 <span className="font-semibold text-ink">{validUrls.length}</span> 个有效链接
                  {invalidCount > 0 ? <span className="text-danger">（{invalidCount} 行无效）</span> : null}
                  {validUrls.length > 1 ? '，将拆分为多个子任务' : ''}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || effectiveUrls.length === 0}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-pill px-6 text-[15px] font-medium transition-all',
                submitting || effectiveUrls.length === 0
                  ? 'cursor-not-allowed bg-surface-soft text-ink-subtle'
                  : 'bg-ink text-accent-fg hover:bg-[#1f1f1f]',
              )}
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  提交中
                </>
              ) : (
                <>
                  提交
                  <ArrowUp size={15} strokeWidth={2.4} />
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* 模式不匹配软提示：检测到目录/单品链接放错框 */}
      {mismatchedCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-md border border-[#f0c75a]/60 bg-[#fff8d8] px-3 py-2 text-[13.5px] text-ink-muted">
          <span>
            检测到 <span className="font-semibold text-ink">{mismatchedCount}</span> 行是
            <span className="font-semibold text-ink">{mode === 'single' ? '目录' : '单品'}</span>
            链接，不匹配当前模式
          </span>
          <button
            type="button"
            onClick={() => setMode(mode === 'single' ? 'catalog' : 'single')}
            className="rounded-pill bg-ink px-2.5 py-0.5 text-[12.5px] font-medium text-accent-fg transition-colors hover:bg-[#1f1f1f]"
          >
            切到{mode === 'single' ? '目录' : '单品'}模式
          </button>
        </div>
      ) : null}

      {/* 提示行 */}
      {hint ? (
        <div
          className={cn(
            'mt-3 text-center text-[14px]',
            hint.kind === 'error' ? 'text-danger' : 'text-ink-muted',
          )}
        >
          {hint.text}
        </div>
      ) : null}
    </div>
  )
}

function ModeRadio({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-pill px-3.5 py-1.5 text-[15px] font-medium transition-colors',
        active ? 'bg-ink text-accent-fg' : 'text-ink-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}

function buildTitle(mode: CollectMode, platform: string, count: number) {
  const platformLabel = getPlatformLabel(platform)
  const modeLabel = mode === 'catalog' ? '目录' : '单品'
  const suffix = count > 1 ? ` ×${count}` : ''
  return `${platformLabel} ${modeLabel}${suffix}`
}

// URL 类型识别。Shopify-like 站点路径模式：
// - `/products/<slug>` → 单品（即便含 /collections 前缀也优先视为单品，最后段才是目标）
// - `/collections` 或 `/collections/...` → 目录
// - 其余（裸域名、WooCommerce /shop、自定义路由、非主流平台）→ 未知，按宽容策略放行
type DetectedUrlMode = 'single' | 'catalog' | 'unknown'

function detectUrlMode(url: string): DetectedUrlMode {
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    if (/\/products\/[^/]+/.test(path)) return 'single'
    if (/\/collections(\/|$)/.test(path)) return 'catalog'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
