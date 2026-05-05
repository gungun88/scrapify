'use client'

import { ArrowLeft, Download, RotateCw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Composer } from '@/components/composer/Composer'
import { StatusBadge } from '@/components/layout/Sidebar'
import { useTasksByIds } from '@/hooks/useTasksByIds'
import { getPlatformBreadcrumb, formatCatalogLimit } from '@/lib/mock/platforms'
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

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-6">
      {/* 顶部 */}
      <header className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
          aria-label="返回"
        >
          <ArrowLeft size={15} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[17px] font-semibold text-ink">
            <span className="truncate">{conv.title}</span>
            <StatusBadge status={overall.status} />
          </div>
          <div className="mt-0.5 text-[13.5px] text-ink-subtle">
            {new Date(conv.createdAt).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · 共 {conv.urls.length} 个链接
          </div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-8 w-8 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-surface-soft hover:text-danger"
          title="删除会话记录"
          aria-label="删除"
        >
          <Trash2 size={14} />
        </button>
      </header>

      {/* 用户气泡 */}
      <UserBubble conv={conv} />

      {/* 助手气泡 */}
      <AssistantBubble
        conv={conv}
        tasks={tasks}
        overall={overall}
        exportingTaskId={exportingTaskId}
        onExport={handleExport}
      />

      {exportError ? (
        <div className="rounded-md border border-danger/30 bg-[#fff4f4] px-3 py-2 text-[14px] text-danger">
          {exportError}
        </div>
      ) : null}

      {/* 追加输入 */}
      <div className="mt-6">
        <div className="mb-2 text-[13.5px] font-medium uppercase tracking-wider text-ink-subtle">
          继续采集
        </div>
        <Composer embedded />
      </div>
    </div>
  )
}

/* ===================== 子组件 ===================== */

function UserBubble({ conv }: { conv: CollectConversation }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-md border border-line bg-surface-soft px-4 py-3">
        <div className="mb-2 text-[14px] text-ink-muted">
          {conv.mode === 'catalog' ? '抓取目录页' : `抓取 ${conv.urls.length} 个商品`}
        </div>
        <ul className="space-y-1">
          {conv.urls.map((u, i) => (
            <li key={i} className="break-all font-mono text-[14px] text-ink">
              {u}
            </li>
          ))}
        </ul>
        <div className="mt-2 border-t border-line pt-2 text-[13.5px] text-ink-subtle">
          平台: {getPlatformBreadcrumb(conv.platform)}
          {conv.mode === 'catalog' && conv.catalogLimit !== undefined
            ? ` · 商品数: ${formatCatalogLimit(conv.catalogLimit)}`
            : null}
        </div>
      </div>
    </div>
  )
}

function AssistantBubble({
  conv,
  tasks,
  overall,
  exportingTaskId,
  onExport,
}: {
  conv: CollectConversation
  tasks: (Task | null)[]
  overall: ReturnType<typeof summarize>
  exportingTaskId: string | null
  onExport: (taskId: string) => void
}) {
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[680px] rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3">
        <div className="mb-3 flex items-center gap-2 text-[14.5px]">
          <span className="font-medium text-ink">Scrapify</span>
          <span className="text-ink-subtle">·</span>
          <StatusBadge status={overall.status} />
          {overall.status === 'running' ? (
            <span className="ml-auto text-[14px] text-ink-muted">
              {overall.doneCount}/{tasks.length}
            </span>
          ) : null}
        </div>

        <ul className="space-y-2">
          {conv.taskIds.map((id, i) => {
            const task = tasks[i]
            const url = conv.urls[i] ?? task?.url ?? id
            return (
              <li
                key={id}
                className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2"
              >
                <StatusDot status={task?.status ?? 'pending'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[14px] text-ink">{url}</div>
                  <div className="mt-0.5 text-[13px] text-ink-subtle">
                    {task ? renderMeta(task) : '排队中'}
                  </div>
                </div>
                {task?.status === 'done' ? (
                  <button
                    type="button"
                    onClick={() => onExport(task.id)}
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
              </li>
            )
          })}
        </ul>

        {overall.status === 'done' ? (
          <div className="mt-3 flex items-center justify-between rounded-md bg-surface-soft px-3 py-2 text-[14.5px]">
            <span className="text-ink">
              ✓ 全部完成 · {overall.totalItems.toLocaleString('en-US')} 件 · 总耗时 {overall.totalElapsed}
            </span>
            <button
              type="button"
              onClick={() => location.reload()}
              className="flex items-center gap-1 text-[14px] text-ink-muted transition-colors hover:text-ink"
            >
              <RotateCw size={11} />
              刷新
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: Task['status'] }) {
  return (
    <span
      className={cn(
        'h-1.5 w-1.5 shrink-0 rounded-pill',
        status === 'done' && 'bg-success',
        status === 'running' && 'animate-pulse bg-ink',
        status === 'error' && 'bg-danger',
        status === 'pending' && 'bg-ink-subtle',
      )}
    />
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
