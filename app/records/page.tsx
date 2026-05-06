'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { StatusBadge } from '@/components/layout/Sidebar'
import { getPlatformBreadcrumb } from '@/lib/mock/platforms'
import { getConversations } from '@/lib/preferences'
import type { CollectConversation, Task } from '@/lib/types'
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

  const enriched = useMemo(
    () =>
      conversations.map((c) => {
        const tasks = c.taskIds.map((id) => taskById.get(id)).filter(Boolean) as Task[]
        const overall = inferStatus(tasks, c.taskIds.length)
        const totalItems = tasks
          .filter((t) => t.status === 'done')
          .reduce((s, t) => s + t.itemCount, 0)
        return { conv: c, status: overall, totalItems }
      }),
    [conversations, taskById],
  )

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return enriched.filter(({ conv, status }) => {
      if (filter !== 'all' && status !== filter) return false
      if (!kw) return true
      const blob = [
        conv.title,
        ...conv.urls,
        getPlatformBreadcrumb(conv.platform),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(kw)
    })
  }, [enriched, keyword, filter])

  const grouped = useMemo(() => {
    const g: Record<string, typeof filtered> = { 今天: [], 昨天: [], 本周: [], 更早: [] }
    for (const item of filtered) g[bucketOf(item.conv.createdAt)].push(item)
    return g
  }, [filtered])

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="px-2 py-1.5 text-[14px] text-ink-muted">
          采集记录 · 共 {conversations.length} 次会话
        </div>
        <div className="flex items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索 URL / 平台..."
            className="h-8 w-[220px] rounded-md border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-subtle focus:border-line-strong focus:outline-none"
          />
          <FilterChip current={filter} target="all" label="全部" onChange={setFilter} />
          <FilterChip current={filter} target="running" label="运行中" onChange={setFilter} />
          <FilterChip current={filter} target="done" label="已完成" onChange={setFilter} />
          <FilterChip current={filter} target="error" label="失败" onChange={setFilter} />
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-line py-16 text-center text-[15px] text-ink-subtle">
          {conversations.length === 0
            ? '还没有采集记录，回到主页发起一次采集吧。'
            : '没有匹配的记录'}
        </div>
      ) : (
        Object.entries(grouped)
          .filter(([, list]) => list.length > 0)
          .map(([bucket, list]) => (
            <section key={bucket} className="mb-8">
              <div className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-ink-subtle">
                {bucket}
              </div>
              <ul className="space-y-2">
                {list.map(({ conv, status, totalItems }) => (
                  <li key={conv.id}>
                    <Link
                      href={`/c/${conv.id}`}
                      className="block rounded-md border border-line bg-[#ededed] px-4 py-3 transition-colors hover:border-line-strong hover:bg-[#e2e2e2]"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-pill',
                            status === 'done' && 'bg-success',
                            status === 'running' && 'animate-pulse bg-ink',
                            status === 'error' && 'bg-danger',
                            status === 'pending' && 'bg-ink-subtle',
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-[15.5px] font-medium text-ink">
                          {conv.title}
                        </span>
                        <StatusBadge status={status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 pl-4 text-[13.5px] text-ink-subtle">
                        <span>
                          {status === 'done'
                            ? `${totalItems.toLocaleString('en-US')} 件`
                            : `${conv.urls.length} 个链接`}
                        </span>
                        <span>·</span>
                        <span>{getPlatformBreadcrumb(conv.platform)}</span>
                        <span>·</span>
                        <span>
                          {new Date(conv.createdAt).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
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
        'rounded-pill border px-3 py-1 text-[14px] font-medium transition-colors',
        active
          ? 'border-ink bg-ink text-accent-fg'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}

function inferStatus(tasks: Task[], total: number): Task['status'] {
  if (tasks.length === 0 || tasks.length < total) {
    if (tasks.some((t) => t.status === 'running')) return 'running'
    return 'pending'
  }
  if (tasks.some((t) => t.status === 'running')) return 'running'
  if (tasks.every((t) => t.status === 'done')) return 'done'
  if (tasks.some((t) => t.status === 'error')) return 'error'
  return 'pending'
}
