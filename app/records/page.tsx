'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, ChevronLeft, Search, Sparkles } from 'lucide-react'
import {
  ConversationCard,
  ConversationListHeader,
  aggregateElapsed,
  inferConversationStatus,
} from '@/components/conversation/ConversationCard'
import { useConversations, useDeleteConversation } from '@/hooks/useConversations'
import { useTasks } from '@/hooks/useTasks'
import { getPlatformBreadcrumb } from '@/lib/mock/platforms'
import type { CollectConversation, Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'running' | 'done' | 'error' | 'pending'

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

function bucketOf(iso: string): '今天' | '昨天' | '本周' | '更早' {
  const now = new Date()
  const today0 = startOfDay(now)
  const t = new Date(iso).getTime()
  if (t >= today0) return '今天'
  if (t >= today0 - 86400000) return '昨天'
  if (t >= today0 - 6 * 86400000) return '本周'
  return '更早'
}

interface Enriched {
  conv: CollectConversation
  status: TaskStatus
  totalItems: number
  elapsedText: string
  tasks: Task[]
}

export default function RecordsPage() {
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const conversationsQuery = useConversations()
  const tasksQuery = useTasks()
  const deleteMutation = useDeleteConversation()

  const conversations: CollectConversation[] = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  )

  const taskById = useMemo(() => {
    const m = new Map<string, Task>()
    for (const t of tasksQuery.data ?? []) m.set(t.id, t)
    return m
  }, [tasksQuery.data])

  const enriched: Enriched[] = useMemo(
    () =>
      conversations.map((conv) => {
        const tasks = conv.taskIds.map((id) => taskById.get(id)).filter(Boolean) as Task[]
        const status = inferConversationStatus(tasks, conv.taskIds.length)
        const totalItems = tasks
          .filter((t) => t.status === 'done')
          .reduce((s, t) => s + t.itemCount, 0)
        return { conv, status, totalItems, elapsedText: aggregateElapsed(tasks), tasks }
      }),
    [conversations, taskById],
  )

  // 各状态计数：用于左侧导航徽章
  const counts = useMemo(() => {
    const c = { all: enriched.length, running: 0, done: 0, error: 0, pending: 0 }
    for (const e of enriched) c[e.status as keyof typeof c]++
    return c
  }, [enriched])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return enriched.filter(({ conv, status }) => {
      if (filter !== 'all' && status !== filter) return false
      if (!kw) return true
      const blob = [conv.title, ...conv.urls, getPlatformBreadcrumb(conv.platform)]
        .join(' ')
        .toLowerCase()
      return blob.includes(kw)
    })
  }, [enriched, keyword, filter])

  const grouped = useMemo(() => {
    const g: Record<string, Enriched[]> = { 今天: [], 昨天: [], 本周: [], 更早: [] }
    for (const item of filtered) g[bucketOf(item.conv.createdAt)].push(item)
    return g
  }, [filtered])

  function handleDelete(id: string) {
    if (!confirm('删除这条采集记录？关联的任务和数据会一并清除。')) return
    deleteMutation.mutate(id)
  }

  return (
    <div className="dot-grid-light min-h-full w-full">
      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-6 py-6">
        {/* 左侧悬浮导航面板 */}
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-[268px] shrink-0 lg:block">
          <NavPanel
            total={conversations.length}
            counts={counts}
            keyword={keyword}
            onKeywordChange={setKeyword}
            filter={filter}
            onFilterChange={setFilter}
          />
        </aside>

        {/* 右侧内容区 */}
        <main className="min-w-0 flex-1">
          {/* 小屏：折叠式紧凑顶栏；lg 及以上隐藏，由左侧浮窗承担同样信息 */}
          <div className="mb-4 flex flex-wrap items-center gap-2 lg:hidden">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-[13.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <ChevronLeft size={14} />
              首页
            </Link>
            <div className="text-[14px] text-ink-muted">
              共 <span className="font-semibold text-ink">{conversations.length}</span> 条
            </div>
            <label className="relative ml-auto">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索 URL / 平台..."
                className="h-8 w-[180px] rounded-pill border border-line bg-surface pl-7 pr-3 text-[13.5px] text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none"
              />
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState hasAny={conversations.length > 0} />
          ) : (
            Object.entries(grouped)
              .filter(([, list]) => list.length > 0)
              .map(([bucket, list]) => (
                <section key={bucket} className="mb-6 last:mb-0">
                  <div className="mb-2.5 flex items-baseline gap-2 px-1">
                    <h2 className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                      {bucket}
                    </h2>
                    <span className="text-[12px] text-ink-subtle/70">{list.length}</span>
                  </div>
                  <div className="glass-panel overflow-x-auto rounded-2xl">
                    <ConversationListHeader />
                    <div className="divide-y divide-line/70">
                      {list.map((item) => (
                        <ConversationCard
                          key={item.conv.id}
                          conv={item.conv}
                          status={item.status}
                          totalItems={item.totalItems}
                          elapsedText={item.elapsedText}
                          tasks={item.tasks}
                          onDelete={() => handleDelete(item.conv.id)}
                          framed={false}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              ))
          )}
        </main>
      </div>
    </div>
  )
}

/* ---------------- 子组件：左侧浮窗导航 ---------------- */

interface NavPanelProps {
  total: number
  counts: Record<'all' | 'running' | 'done' | 'error' | 'pending', number>
  keyword: string
  onKeywordChange: (next: string) => void
  filter: Filter
  onFilterChange: (next: Filter) => void
}

const FILTER_ITEMS: Array<{
  key: Filter
  label: string
  dot: string
}> = [
  { key: 'all', label: '全部', dot: 'bg-ink' },
  { key: 'running', label: '运行中', dot: 'bg-ink animate-pulse' },
  { key: 'done', label: '已完成', dot: 'bg-success' },
  { key: 'error', label: '失败', dot: 'bg-danger' },
  { key: 'pending', label: '排队中', dot: 'bg-ink-subtle' },
]

function NavPanel({
  total,
  counts,
  keyword,
  onKeywordChange,
  filter,
  onFilterChange,
}: NavPanelProps) {
  return (
    <div className="glass-panel flex h-full flex-col rounded-3xl">
      {/* Header：品牌（点击回首页） */}
      <div className="px-5 pb-3 pt-4">
        <Link
          href="/"
          className="inline-flex select-none items-center gap-1.5 rounded-pill px-1 py-1 outline-none transition-opacity hover:opacity-80"
          aria-label="返回首页"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-ink text-[11px] font-bold text-accent-fg">
            S
          </span>
          <span className="font-display text-[14px] font-semibold tracking-tight text-ink">
            Scrapify
          </span>
        </Link>
      </div>

      {/* 标题区 */}
      <div className="border-b border-line/60 px-5 pb-4 pt-1">
        <div className="font-display text-[22px] font-semibold leading-tight tracking-tight text-ink">
          采集记录
        </div>
        <div className="mt-1 text-[12.5px] text-ink-subtle">
          共 <span className="font-semibold text-ink">{total}</span> 次会话
        </div>
      </div>

      {/* 搜索 */}
      <div className="px-4 pt-4">
        <label className="relative block">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="搜索 URL / 平台..."
            className="block h-9 w-full rounded-pill border border-line bg-surface/60 pl-8 pr-3 text-[13.5px] text-ink placeholder:text-ink-subtle focus:border-line-strong focus:bg-surface focus:outline-none"
          />
        </label>
      </div>

      {/* 状态过滤列表 */}
      <nav className="px-2 pt-3">
        <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
          状态
        </div>
        <ul className="space-y-0.5">
          {FILTER_ITEMS.map((item) => {
            const active = filter === item.key
            const count = counts[item.key]
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onFilterChange(item.key)}
                  className={cn(
                    'group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] transition-colors',
                    active
                      ? 'bg-ink text-accent-fg'
                      : 'text-ink-muted hover:bg-surface-soft hover:text-ink',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-pill',
                      active ? 'bg-accent-fg' : item.dot,
                    )}
                  />
                  <span className="flex-1 font-medium">{item.label}</span>
                  <span
                    className={cn(
                      'tabular-nums text-[12.5px]',
                      active ? 'text-accent-fg/80' : 'text-ink-subtle',
                    )}
                  >
                    {count}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* 占满剩余空间 */}
      <div className="flex-1" />

      {/* 底部 CTA：新建采集 */}
      <div className="border-t border-line/60 p-3">
        <Link
          href="/"
          className="group inline-flex w-full items-center justify-between gap-2 rounded-2xl border border-ink bg-ink px-4 py-2.5 text-[13.5px] font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={14} />
            新建采集
          </span>
          <ArrowRight
            size={14}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </div>
  )
}

/* ---------------- 子组件：空状态 ---------------- */

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="glass-panel rounded-3xl py-20 text-center">
      <div className="text-[14.5px] text-ink-subtle">
        {hasAny ? '没有匹配的记录' : '还未提交采集任务'}
      </div>
      {!hasAny ? (
        <Link
          href="/"
          className="mt-3 inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-[13.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          回到首页发起采集
          <ArrowRight size={13} />
        </Link>
      ) : null}
    </div>
  )
}
