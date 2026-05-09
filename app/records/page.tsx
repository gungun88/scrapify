'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import {
  ConversationCard,
  ConversationListHeader,
  aggregateElapsed,
  inferConversationStatus,
} from '@/components/conversation/ConversationCard'
import { useTasks } from '@/hooks/useTasks'
import { getPlatformBreadcrumb } from '@/lib/mock/platforms'
import { deleteConversation, getConversations } from '@/lib/preferences'
import type { CollectConversation, Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'running' | 'done' | 'error'

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
  const [conversations, setConversations] = useState<CollectConversation[]>([])
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const tasksQuery = useTasks()

  useEffect(() => {
    setConversations(getConversations())
  }, [])

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
    deleteConversation(id)
    setConversations(getConversations())
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-8">
      {/* 顶部导航：返回首页 + 标题 + 搜索 + 状态筛选 */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <ArrowLeft size={14} />
            返回首页
          </Link>
          <div className="text-[15px] text-ink-muted">
            采集记录 · 共 <span className="font-semibold text-ink">{conversations.length}</span> 次
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索 URL / 平台..."
              className="h-8 w-[220px] rounded-md border border-line bg-surface pl-7 pr-3 text-[14px] text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none"
            />
          </label>
          <FilterChip current={filter} target="all" label="全部" onChange={setFilter} />
          <FilterChip current={filter} target="running" label="运行中" onChange={setFilter} />
          <FilterChip current={filter} target="done" label="已完成" onChange={setFilter} />
          <FilterChip current={filter} target="error" label="失败" onChange={setFilter} />
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-16 text-center text-[14.5px] text-ink-subtle">
          {conversations.length === 0
            ? '还未提交采集任务，回到首页发起一次采集吧。'
            : '没有匹配的记录'}
        </div>
      ) : (
        Object.entries(grouped)
          .filter(([, list]) => list.length > 0)
          .map(([bucket, list]) => (
            <section key={bucket} className="mb-8">
              <div className="mb-3 text-[12.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                {bucket}
              </div>
              <div className="overflow-x-auto rounded-md border border-line">
                <ConversationListHeader />
                <div className="divide-y divide-line">
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
    </div>
  )
}

function FilterChip({
  current,
  target,
  label,
  onChange,
}: {
  current: Filter
  target: Filter
  label: string
  onChange: (next: Filter) => void
}) {
  const active = current === target
  return (
    <button
      type="button"
      onClick={() => onChange(target)}
      className={cn(
        'rounded-pill border px-3 py-1 text-[13px] font-medium transition-colors',
        active
          ? 'border-ink bg-ink text-accent-fg'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}
