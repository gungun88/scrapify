'use client'

import Link from 'next/link'
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
}: ConversationCardProps) {
  const target = tasks.find((t) => t.status === 'done') ?? tasks[0]
  const exportHref = target ? `/api/tasks/${target.id}/export?format=csv` : undefined

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
        href={`/c/${conv.id}`}
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
          <Link
            href={`/c/${conv.id}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink"
            aria-label="打开"
            title="打开"
          >
            <ExternalLink size={14} />
          </Link>
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
