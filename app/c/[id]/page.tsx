'use client'

import { ArrowLeft, ChevronDown, Download, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '@/components/layout/Sidebar'
import { useTasksByIds } from '@/hooks/useTasksByIds'
import { formatCatalogLimit, getPlatformBreadcrumb } from '@/lib/mock/platforms'
import { deleteConversation, getConversation } from '@/lib/preferences'
import { downloadTaskResultExport } from '@/lib/taskExport'
import type { CollectConversation, Task } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function ConversationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [conv, setConv] = useState<CollectConversation | null>(null)
  const [exportingTaskId, setExportingTaskId] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [showUrls, setShowUrls] = useState(false)

  useEffect(() => {
    if (!params?.id) return
    const c = getConversation(params.id)
    if (!c) {
      router.replace('/')
      return
    }
    setConv(c)
  }, [params?.id, router])

  const taskIds = conv?.taskIds ?? []
  const queries = useTasksByIds(taskIds)

  const tasks = useMemo<(Task | null)[]>(
    () => queries.map((q) => (q.data ?? null) as Task | null),
    [queries],
  )

  const overall = useMemo(() => summarize(tasks), [tasks])

  if (!conv) {
    return (
      <div className="flex flex-1 items-center justify-center text-[15px] text-ink-subtle">
        加载中…
      </div>
    )
  }

  async function handleExport(taskId: string) {
    setExportingTaskId(taskId)
    setExportError(null)
    try {
      await downloadTaskResultExport(taskId, 'csv')
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败。')
    } finally {
      setExportingTaskId(null)
    }
  }

  function handleDelete() {
    if (!conv) return
    if (!confirm('删除该会话记录？后端任务不会被删除，仅清除前端历史。')) return
    deleteConversation(conv.id)
    router.replace('/')
  }

  const platformLabel = getPlatformBreadcrumb(conv.platform)
  const createdAtLabel = new Date(conv.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-8">
      {/* 顶部 */}
      <header className="mb-5 flex items-start gap-3">
        <Link
          href="/"
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
          aria-label="返回"
        >
          <ArrowLeft size={15} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[17px] font-semibold text-ink">
            <span className="truncate">{conv.title}</span>
            <StatusBadge status={overall.status} />
            {overall.status === 'running' ? (
              <span className="text-[14px] text-ink-muted">
                {overall.doneCount}/{tasks.length}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-ink-subtle">
            <span>{createdAtLabel}</span>
            <span>·</span>
            <span>{platformLabel}</span>
            {conv.mode === 'catalog' && conv.catalogLimit !== undefined ? (
              <>
                <span>·</span>
                <span>商品数 {formatCatalogLimit(conv.catalogLimit)}</span>
              </>
            ) : null}
            <span>·</span>
            <span>共 {conv.urls.length} 个链接</span>
            {overall.status === 'done' && overall.totalItems > 0 ? (
              <>
                <span>·</span>
                <span>
                  {overall.totalItems.toLocaleString('en-US')} 件 · 耗时 {overall.totalElapsed}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-surface-soft hover:text-danger"
          title="删除会话记录"
          aria-label="删除"
        >
          <Trash2 size={14} />
        </button>
      </header>

      {/* 提交链接（折叠） */}
      <div className="mb-6 pl-11">
        <button
          type="button"
          onClick={() => setShowUrls((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[13.5px] text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronDown
            size={12}
            className={cn('transition-transform', showUrls ? 'rotate-180' : '')}
          />
          {showUrls ? '收起提交的链接' : '查看提交的链接'}
        </button>
        {showUrls ? (
          <ul className="mt-2 space-y-1 rounded-md border border-line bg-surface-soft px-4 py-3">
            {conv.urls.map((u, i) => (
              <li key={i} className="break-all font-mono text-[13.5px] text-ink-muted">
                {u}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 任务列表 */}
      <div className="mb-2 px-2 text-[13px] font-semibold uppercase tracking-wider text-ink-subtle">
        任务
      </div>
      <ul className="space-y-2">
        {conv.taskIds.map((id, i) => {
          const task = tasks[i]
          const url = conv.urls[i] ?? task?.url ?? id
          const status: Task['status'] = task?.status ?? 'pending'
          return (
            <li key={id} className="rounded-md border border-line bg-[#ededed] px-4 py-3 transition-colors hover:border-line-strong hover:bg-[#e2e2e2]">
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
                <span className="min-w-0 flex-1 truncate font-mono text-[14px] text-ink">
                  {url}
                </span>
                <StatusBadge status={status} />
                {status === 'done' && task ? (
                  <button
                    type="button"
                    onClick={() => handleExport(task.id)}
                    disabled={exportingTaskId === task.id}
                    className="flex h-7 items-center gap-1 rounded-pill border border-line px-2.5 text-[13.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
                  >
                    {exportingTaskId === task.id ? (
                      '...'
                    ) : (
                      <>
                        <Download size={11} />
                        CSV
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              <div className="mt-1 pl-4 text-[13px] text-ink-subtle">
                {task ? renderMeta(task) : '排队中'}
              </div>
            </li>
          )
        })}
      </ul>

      {exportError ? (
        <div className="mt-4 rounded-md border border-danger/30 bg-[#fff4f4] px-3 py-2 text-[14px] text-danger">
          {exportError}
        </div>
      ) : null}
    </div>
  )
}

function summarize(tasks: (Task | null)[]) {
  let doneCount = 0
  let runningCount = 0
  let errorCount = 0
  let totalItems = 0
  let totalSeconds = 0
  for (const t of tasks) {
    if (!t) continue
    if (t.status === 'done') {
      doneCount++
      totalItems += t.itemCount
    }
    if (t.status === 'running') runningCount++
    if (t.status === 'error') errorCount++
    totalSeconds += parseElapsedSeconds(t.elapsed)
  }
  let status: Task['status'] = 'pending'
  if (errorCount > 0 && runningCount === 0 && doneCount + errorCount === tasks.length) {
    status = 'error'
  } else if (runningCount > 0) status = 'running'
  else if (doneCount === tasks.length && tasks.length > 0) status = 'done'

  return {
    status,
    doneCount,
    runningCount,
    errorCount,
    totalItems,
    totalElapsed: formatSeconds(totalSeconds),
  }
}

function renderMeta(t: Task) {
  if (t.status === 'pending') return '排队中'
  if (t.status === 'running') return `运行中 · ${t.progress}% · ${t.elapsed}`
  if (t.status === 'done') return `完成 · ${t.itemCount.toLocaleString('en-US')} 件 · ${t.elapsed}`
  return `失败 · ${t.elapsed}`
}

function parseElapsedSeconds(elapsed: string) {
  const m = elapsed.match(/(\d+)\s*分/)
  const s = elapsed.match(/(\d+)\s*秒/)
  if (m || s) return Number(m?.[1] ?? 0) * 60 + Number(s?.[1] ?? 0)
  const sec = elapsed.match(/(\d+)\s*s/i)
  if (sec) return Number(sec[1])
  return 0
}

function formatSeconds(total: number) {
  if (total < 60) return `${total} 秒`
  const m = Math.floor(total / 60)
  const s = total % 60
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`
}
