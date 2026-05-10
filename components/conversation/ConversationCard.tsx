'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Trash2, Download } from 'lucide-react'
import { StatusBadge } from '@/components/layout/Sidebar'
import { getPlatformBreadcrumb } from '@/lib/mock/platforms'
import type { CollectConversation, Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * 列宽统一在这里定义，ConversationCard 与 ConversationListHeader 共用，
 * 这样表头与数据行的列对齐天然一致。
 */
export const ROW_COLS = {
  type: 'w-[180px] shrink-0',
  title: 'min-w-0 flex-1',
  total: 'w-[64px] shrink-0 text-right',
  status: 'w-[96px] shrink-0',
  done: 'w-[80px] shrink-0 text-right',
  elapsed: 'w-[76px] shrink-0 text-right',
  created: 'w-[88px] shrink-0 text-right',
  actions: 'w-[132px] shrink-0',
} as const

interface ConversationCardProps {
  conv: CollectConversation
  status: TaskStatus
  totalItems: number
  elapsedText: string
  tasks: Task[]
  onDelete?: () => void
  /** compact: 隐藏操作列（首页用） */
  compact?: boolean
  /** framed: 是否渲染外框；放进列表容器时设 false 由外层统一 border + divide-y */
  framed?: boolean
  /** 覆盖整行点击目标，默认指向 /records */
  href?: string
}

const TYPE_LABEL: Record<CollectConversation['mode'], string> = {
  single: '单品',
  catalog: '目录',
}

export function ConversationCard({
  conv,
  status,
  totalItems,
  elapsedText,
  tasks,
  onDelete,
  compact,
  framed = true,
  href,
}: ConversationCardProps) {
  const target = tasks.find((t) => t.status === 'done') ?? tasks[0]
  const exportHref = target ? `/api/tasks/${target.id}/export?format=csv` : undefined
  const rowHref = href ?? '/records'

  return (
    <div
      className={cn(
        'group relative flex items-center gap-4 bg-surface transition-colors',
        framed ? 'rounded-md border border-line hover:border-line-strong' : 'hover:bg-surface-soft',
        compact ? 'px-3 py-2.5 text-[13.5px]' : 'px-5 py-3.5 text-[14.5px]',
      )}
    >
      {/* 采集类型 | 店铺类型 */}
      <div className={cn(ROW_COLS.type, 'flex items-center gap-1.5')}>
        <span
          className={cn(
            'rounded-pill px-2 py-[1px] text-[11px] font-medium',
            conv.mode === 'catalog' ? 'bg-ink/10 text-ink' : 'bg-surface-soft text-ink-muted',
          )}
        >
          {TYPE_LABEL[conv.mode]}
        </span>
        <span className="truncate text-[12.5px] text-ink-subtle">
          {getPlatformBreadcrumb(conv.platform)}
        </span>
      </div>

      {/* 任务名称：通过 ::before 把可点击区域扩展到整行（card-link 模式） */}
      <Link
        href={rowHref}
        className={cn(
          ROW_COLS.title,
          'truncate font-medium text-ink hover:underline',
          "before:absolute before:inset-0 before:content-['']",
        )}
        title={conv.title}
      >
        {conv.title}
      </Link>

      {/* 总数 */}
      <div className={cn(ROW_COLS.total, 'tabular-nums text-ink')}>{conv.urls.length}</div>

      {/* 状态 */}
      <div className={ROW_COLS.status}>
        <StatusBadge status={status} />
      </div>

      {/* 已采集 */}
      <div
        className={cn(
          ROW_COLS.done,
          'tabular-nums font-semibold',
          status === 'done' && totalItems > 0 ? 'text-success' : 'text-ink-subtle',
        )}
      >
        {totalItems > 0 ? totalItems.toLocaleString('en-US') : '—'}
      </div>

      {/* 用时 */}
      <div className={cn(ROW_COLS.elapsed, 'tabular-nums text-ink-muted')}>
        {elapsedText || '—'}
      </div>

      {/* 创建时间 */}
      <div className={cn(ROW_COLS.created, 'tabular-nums text-ink-muted')}>
        {formatTime(conv.createdAt)}
      </div>

      {/* 操作（链接 | 删除 | 导出）—— compact 模式隐藏。relative z-10 让按钮浮在整行 ::before 链接覆盖层之上，保持可点击 */}
      {!compact ? (
        <div className={cn(ROW_COLS.actions, 'relative z-10 flex items-center justify-end gap-0.5')}>
          <OpenSourceUrlAction urls={conv.urls} />
          {exportHref ? (
            <a
              href={exportHref}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink"
              aria-label="导出 CSV"
              title="导出 CSV"
            >
              <Download size={14} />
            </a>
          ) : (
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle/40"
              title="完成后可导出"
            >
              <Download size={14} />
            </span>
          )}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-danger"
              aria-label="删除"
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 表头行，与 ConversationCard 共用列宽常量保证对齐。
 */
export function ConversationListHeader({ showActions = true }: { showActions?: boolean }) {
  const cell = 'text-[11px] font-semibold uppercase tracking-wider text-ink-subtle'
  return (
    <div className="flex items-center gap-4 border-b border-line bg-surface-soft/40 px-5 py-2.5">
      <div className={cn(ROW_COLS.type, cell)}>采集类型 · 店铺类型</div>
      <div className={cn(ROW_COLS.title, cell)}>任务名称</div>
      <div className={cn(ROW_COLS.total, cell)}>总数</div>
      <div className={cn(ROW_COLS.status, cell)}>状态</div>
      <div className={cn(ROW_COLS.done, cell, 'text-success')}>已采集</div>
      <div className={cn(ROW_COLS.elapsed, cell)}>用时</div>
      <div className={cn(ROW_COLS.created, cell)}>创建</div>
      {showActions ? <div className={cn(ROW_COLS.actions, cell, 'text-right')}>操作</div> : null}
    </div>
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/** 把若干 task 的 elapsed 字段聚合成展示文案 */
export function aggregateElapsed(tasks: Task[]): string {
  const filled = tasks.filter((t) => t.elapsed && t.elapsed !== '0s')
  if (filled.length === 0) return ''
  if (filled.length === 1) return filled[0].elapsed
  return filled[0].elapsed
}

/** 推断会话整体状态 */
export function inferConversationStatus(tasks: Task[], total: number): TaskStatus {
  if (tasks.length === 0 || tasks.length < total) {
    if (tasks.some((t) => t.status === 'running')) return 'running'
    return 'pending'
  }
  if (tasks.some((t) => t.status === 'running')) return 'running'
  if (tasks.every((t) => t.status === 'done')) return 'done'
  if (tasks.some((t) => t.status === 'error')) return 'error'
  return 'pending'
}

/* ---------------- 子组件：打开采集源链接 ---------------- */

/**
 * 单链接：直接渲染外链 <a>。
 * 多链接：渲染按钮 + 角标计数 + 点击展开下拉，列出所有 URL，每条独立打开。
 *
 * 下拉用 createPortal 渲染到 body：因为 records 页 .glass-panel 设置了 backdrop-filter，
 * 它会创建 fixed 的 containing block，导致 position: fixed 也被 overflow 裁切。
 */
function OpenSourceUrlAction({ urls }: { urls: string[] }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    function recompute() {
      const r = buttonRef.current?.getBoundingClientRect()
      if (r) setRect(r)
    }
    window.addEventListener('resize', recompute)
    // 捕获阶段监听，覆盖任意祖先的滚动容器
    window.addEventListener('scroll', recompute, true)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('scroll', recompute, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      const target = e.target as Node
      if (buttonRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      if (next) {
        const r = buttonRef.current?.getBoundingClientRect()
        if (r) setRect(r)
      }
      return next
    })
  }

  if (urls.length === 0) {
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle/40"
        title="无可打开链接"
      >
        <ExternalLink size={14} />
      </span>
    )
  }

  if (urls.length === 1) {
    return (
      <a
        href={urls[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink"
        aria-label="打开采集链接"
        title={urls[0]}
      >
        <ExternalLink size={14} />
      </a>
    )
  }

  const popover =
    mounted && open && rect
      ? createPortal(
          <div
            ref={popoverRef}
            role="menu"
            className="fixed z-50 w-[320px] overflow-hidden rounded-md border border-line bg-surface shadow-lg"
            style={{
              top: rect.bottom + 4,
              // 右对齐到按钮右沿：用 left 而不是 right，避免依赖 window.innerWidth 在不同 DPR 下的奇怪
              left: Math.max(8, rect.right - 320),
            }}
          >
            <div className="border-b border-line/60 bg-surface-soft/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              采集链接 · {urls.length}
            </div>
            <ul className="max-h-[280px] overflow-y-auto py-1">
              {urls.map((u, i) => (
                <li key={`${i}-${u}`}>
                  <a
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
                    title={u}
                  >
                    <span className="w-5 shrink-0 text-right tabular-nums text-ink-subtle">
                      {i + 1}.
                    </span>
                    <span className="min-w-0 flex-1 truncate">{u}</span>
                    <ExternalLink size={11} className="shrink-0 text-ink-subtle" />
                  </a>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`打开采集链接（共 ${urls.length} 条）`}
        title={`共 ${urls.length} 条链接`}
      >
        <ExternalLink size={14} />
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-ink px-1 text-[9px] font-semibold leading-none text-accent-fg"
        >
          {urls.length > 99 ? '99+' : urls.length}
        </span>
      </button>
      {popover}
    </>
  )
}
