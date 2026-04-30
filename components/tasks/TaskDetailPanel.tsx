'use client'

import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useTaskDetail, useTaskLogs } from '@/hooks/useTaskDetail'
import { downloadTaskResultExport } from '@/lib/taskExport'
import { cn, formatDelayLabel, getTaskStatusLabel } from '@/lib/utils'
import type { Task, TaskDetail, TaskLogEntry } from '@/lib/types'

interface TaskDetailPanelProps {
  task: Task | null
  onClose: () => void
}

type LogFilter = 'all' | TaskLogEntry['level']

const panelText = {
  closeTaskDetail: '\u5173\u95ed\u4efb\u52a1\u8be6\u60c5',
  taskDetail: '\u4efb\u52a1\u8be6\u60c5',
  taskFailed: '\u4efb\u52a1\u6267\u884c\u5931\u8d25\u3002',
  pending: '\u7b49\u5f85\u6267\u884c',
  status: '\u72b6\u6001',
  mode: '\u6a21\u5f0f',
  region: '\u533a\u57df',
  concurrency: '\u5e76\u53d1',
  delay: '\u5ef6\u8fdf',
  createdAt: '\u521b\u5efa\u65f6\u95f4',
  startedAt: '\u5f00\u59cb\u65f6\u95f4',
  finishedAt: '\u5b8c\u6210\u65f6\u95f4',
  lastHeartbeatAt: '\u6700\u8fd1\u5fc3\u8df3',
  elapsed: '\u5df2\u8017\u65f6',
  fields: '\u5b57\u6bb5',
  executionLogs: '\u6267\u884c\u65e5\u5fd7',
  refreshing: '\u5237\u65b0\u4e2d',
  visibleCount: '\u6761\u53ef\u89c1',
  totalCount: '\u6761\u603b\u8ba1',
  all: '\u5168\u90e8',
  searchLogs: '\u641c\u7d22\u65e5\u5fd7',
  searchLogsPlaceholder: '\u641c\u7d22\u65e5\u5fd7\u5173\u952e\u8bcd',
  localTaskLogsPending:
    '\u672c\u5730\u4e34\u65f6\u4efb\u52a1\u5c1a\u672a\u540c\u6b65\u5230\u540e\u7aef\uff0c\u65e5\u5fd7\u4f1a\u5728\u521b\u5efa\u5b8c\u6210\u540e\u51fa\u73b0\u3002',
  noLogs: '\u6682\u65e0\u6267\u884c\u65e5\u5fd7\u3002',
  noFilteredLogs: '\u5f53\u524d\u7b5b\u9009\u6761\u4ef6\u4e0b\u6ca1\u6709\u65e5\u5fd7\u3002',
  resultSummary: '\u7ed3\u679c\u6458\u8981',
  resultSource: '\u7ed3\u679c\u6765\u6e90',
  exportedAt: '\u5bfc\u51fa\u65f6\u95f4',
  previewRows: '\u9884\u89c8\u884c\u6570',
  pageCount: '\u6293\u53d6\u9875\u6570',
  runHistory: '\u8fd0\u884c\u5386\u53f2',
  noRuns: '\u6682\u65e0\u8fd0\u884c\u5386\u53f2\u3002',
  failureDetails: '\u5931\u8d25\u660e\u7ec6',
  noFailures: '\u6682\u65e0\u5931\u8d25\u660e\u7ec6\u3002',
  resultPreview: '\u7ed3\u679c\u9884\u89c8',
} as const

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3 text-xs last:border-b-0">
      <div className="text-text3">{label}</div>
      <div className="max-w-[65%] text-right leading-5 text-text1">{value}</div>
    </div>
  )
}

function getLogTone(level: TaskLogEntry['level']) {
  if (level === 'error') {
    return 'border-red/20 bg-red-bg text-red-text'
  }

  if (level === 'warn') {
    return 'border-amber/20 bg-amber-bg text-amber-text'
  }

  return 'border-border bg-surface2 text-text2'
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatResultValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : '--'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}` : '--'
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  if (typeof value === 'string' && value.trim()) {
    return value
  }

  return '--'
}

function toFallbackDetail(task: Task): TaskDetail {
  return {
    ...task,
    mode: 'full',
    region: 'auto',
    fields: [],
    concurrency: 0,
    delay: '1-3s',
    targetCount: task.itemCount,
    startedAt: task.status === 'pending' ? null : task.createdAt,
    finishedAt: task.status === 'done' || task.status === 'error' ? task.createdAt : null,
    errorMessage: task.status === 'error' ? panelText.taskFailed : null,
    workerId: task.status === 'running' ? 'pending-sync' : null,
    lastHeartbeatAt: null,
    result: null,
    failureDetails: [],
    runHistory: [],
  }
}

export function TaskDetailPanel({ task, onClose }: TaskDetailPanelProps) {
  const taskId = task?.id ?? null
  const detailQuery = useTaskDetail(taskId, task?.status)
  const detail = detailQuery.data ?? (task ? toFallbackDetail(task) : null)
  const logsQuery = useTaskLogs(taskId, detail?.status ?? task?.status)
  const logs = logsQuery.data
  const [logFilter, setLogFilter] = useState<LogFilter>('all')
  const [logSearch, setLogSearch] = useState('')
  const [exportError, setExportError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    if (!task) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, task])

  useEffect(() => {
    setLogFilter('all')
    setLogSearch('')
    setExportError(null)
  }, [taskId])

  async function handleExport() {
    if (!taskId) {
      return
    }

    setIsExporting(true)
    setExportError(null)

    try {
      await downloadTaskResultExport(taskId, 'csv')
    } catch (error) {
      setExportError(error instanceof Error ? error.message : panelText.taskFailed)
    } finally {
      setIsExporting(false)
    }
  }

  const filteredLogs = useMemo(() => {
    const ordered = (logs ?? []).slice().reverse()
    const normalizedKeyword = logSearch.trim().toLocaleLowerCase()

    return ordered.filter((log) => {
      if (logFilter !== 'all' && log.level !== logFilter) {
        return false
      }

      if (!normalizedKeyword) {
        return true
      }

      const haystack = [log.level, log.message, log.at, formatDateTime(log.at)].join(' ').toLocaleLowerCase()
      return haystack.includes(normalizedKeyword)
    })
  }, [logFilter, logSearch, logs])

  if (!task || !detail) {
    return null
  }

  const totalLogs = logs?.length ?? 0
  const hasActiveLogFilters = logFilter !== 'all' || logSearch.trim().length > 0

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={panelText.closeTaskDetail}
        className="absolute inset-0 bg-[rgba(17,24,39,0.28)] backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.08em] text-text3">Task Detail</div>
            <div className="mt-1 text-lg font-semibold text-text1">{panelText.taskDetail}</div>
            <div className="mt-2 break-all font-mono text-[11px] text-text2">{detail.url}</div>
          </div>

          <Button variant="outline" className="h-8 w-8 shrink-0 px-0 py-0" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        <div className="overflow-y-auto">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-[0.08em] text-text3">Task ID</div>
                <div className="mt-2 break-all font-mono text-[12px] text-text1">{detail.id}</div>
              </div>
              <Badge variant={detail.status} />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <ProgressBar value={detail.progress} variant={detail.status === 'error' ? 'error' : 'default'} />
              <div className="text-xs text-text2">{detail.progress}%</div>
              <div className="text-xs text-text3">
                {detail.status === 'pending'
                  ? panelText.pending
                  : `${detail.itemCount.toLocaleString('en-US')} / ${detail.targetCount.toLocaleString('en-US')}`}
              </div>
            </div>

            {detail.errorMessage ? (
              <div className="mt-4 rounded border border-red/20 bg-red-bg px-3 py-2 text-xs text-red-text">{detail.errorMessage}</div>
            ) : null}
          </div>

          <div>
            <DetailRow label={panelText.status} value={getTaskStatusLabel(detail.status)} />
            <DetailRow label={panelText.mode} value={detail.mode} />
            <DetailRow label={panelText.region} value={detail.region} />
            <DetailRow label={panelText.concurrency} value={detail.concurrency ? `${detail.concurrency}` : '--'} />
            <DetailRow label={panelText.delay} value={formatDelayLabel(detail.delay)} />
            <DetailRow label={panelText.createdAt} value={formatDateTime(detail.createdAt)} />
            <DetailRow label={panelText.startedAt} value={formatDateTime(detail.startedAt)} />
            <DetailRow label={panelText.finishedAt} value={formatDateTime(detail.finishedAt)} />
            <DetailRow label={panelText.lastHeartbeatAt} value={formatDateTime(detail.lastHeartbeatAt)} />
            <DetailRow label="Worker" value={detail.workerId ?? '--'} />
            <DetailRow label={panelText.elapsed} value={detail.elapsed} />
            <DetailRow label={panelText.fields} value={detail.fields.length ? detail.fields.join(', ') : '--'} />
          </div>

          <div className="border-t border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold text-text1">{panelText.resultSummary}</div>
              <Button variant="outline" onClick={handleExport} disabled={!detail.result || isExporting}>
                {isExporting ? '导出中...' : '导出 CSV'}
              </Button>
            </div>

            {exportError ? <div className="mt-3 text-xs text-red-text">{exportError}</div> : null}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded border border-border bg-surface2 px-3 py-2">
                <div className="text-[11px] text-text3">{panelText.resultSource}</div>
                <div className="mt-1 text-xs text-text1">{detail.result?.source ?? '--'}</div>
              </div>
              <div className="rounded border border-border bg-surface2 px-3 py-2">
                <div className="text-[11px] text-text3">{panelText.exportedAt}</div>
                <div className="mt-1 text-xs text-text1">{formatDateTime(detail.result?.exportedAt ?? null)}</div>
              </div>
              <div className="rounded border border-border bg-surface2 px-3 py-2">
                <div className="text-[11px] text-text3">{panelText.pageCount}</div>
                <div className="mt-1 text-xs text-text1">{detail.result ? `${detail.result.pageCount}` : '--'}</div>
              </div>
              <div className="rounded border border-border bg-surface2 px-3 py-2">
                <div className="text-[11px] text-text3">{panelText.previewRows}</div>
                <div className="mt-1 text-xs text-text1">{detail.result ? `${detail.result.preview.length}` : '--'}</div>
              </div>
            </div>

            {detail.result?.preview.length ? (
              <div className="mt-4">
                <div className="text-[11px] font-medium text-text3">{panelText.resultPreview}</div>
                <div className="mt-2 space-y-2">
                  {detail.result.preview.map((row, index) => (
                    <div key={`${detail.id}-preview-${index}`} className="rounded border border-border bg-surface2 px-3 py-2">
                      <div className="grid grid-cols-1 gap-1">
                        {Object.entries(row).map(([key, value]) => (
                          <div key={key} className="flex items-start justify-between gap-3 text-xs">
                            <span className="text-text3">{key}</span>
                            <span className="max-w-[65%] text-right text-text1">{formatResultValue(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-border px-5 py-4">
            <div className="text-[13px] font-semibold text-text1">{panelText.runHistory}</div>
            <div className="mt-3 space-y-2">
              {detail.runHistory.length ? (
                detail.runHistory.map((run) => (
                  <div key={run.id} className="rounded border border-border bg-surface2 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-medium text-text1">{run.source}</div>
                      <div className="text-[11px] text-text3">{getTaskStatusLabel(run.status)}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-text2">
                      <div>{`${formatDateTime(run.startedAt)} → ${formatDateTime(run.finishedAt)}`}</div>
                      <div>{`${run.itemCount.toLocaleString('en-US')} items · ${run.pageCount} pages`}</div>
                      {run.errorMessage ? <div className="text-red-text">{run.errorMessage}</div> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-border2 px-3 py-4 text-center text-xs text-text3">{panelText.noRuns}</div>
              )}
            </div>
          </div>

          <div className="border-t border-border px-5 py-4">
            <div className="text-[13px] font-semibold text-text1">{panelText.failureDetails}</div>
            <div className="mt-3 space-y-2">
              {detail.failureDetails.length ? (
                detail.failureDetails.map((failure, index) => (
                  <div key={`${failure.at}-${index}`} className="rounded border border-red/20 bg-red-bg px-3 py-2 text-xs text-red-text">
                    <div className="flex items-center justify-between gap-3">
                      <span>{failure.code}</span>
                      <span>{formatDateTime(failure.at)}</span>
                    </div>
                    <div className="mt-1 leading-5">{failure.message}</div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-border2 px-3 py-4 text-center text-xs text-text3">{panelText.noFailures}</div>
              )}
            </div>
          </div>

          <div className="border-t border-border">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-text1">{panelText.executionLogs}</div>
                  <div className="mt-1 text-[11px] text-text3">
                    {logsQuery.isFetching
                      ? panelText.refreshing
                      : `${filteredLogs.length} ${panelText.visibleCount} / ${totalLogs} ${panelText.totalCount}`}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(['all', 'info', 'warn', 'error'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setLogFilter(level)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-[11px] transition-colors',
                        logFilter === level
                          ? 'border-brand bg-brand-light text-brand'
                          : 'border-border bg-surface2 text-text2 hover:text-text1',
                      )}
                    >
                      {level === 'all' ? panelText.all : level.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <label className="relative mt-3 block">
                <span className="sr-only">{panelText.searchLogs}</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text3" />
                <input
                  type="search"
                  value={logSearch}
                  onChange={(event) => setLogSearch(event.target.value)}
                  placeholder={panelText.searchLogsPlaceholder}
                  autoComplete="off"
                  className="w-full rounded-sm border border-border2 bg-surface px-9 py-2 text-[13px] text-text1 outline-none transition-colors placeholder:text-text3 focus:border-brand"
                />
              </label>
            </div>

            <div className="space-y-2 px-5 pb-5">
              {filteredLogs.length ? (
                filteredLogs.map((log) => (
                  <div key={log.id} className={cn('rounded border px-3 py-2', getLogTone(log.level))}>
                    <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.08em]">
                      <span>{log.level}</span>
                      <span className="normal-case">{formatDateTime(log.at)}</span>
                    </div>
                    <div className="mt-1 text-xs leading-5">{log.message}</div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-border2 px-3 py-6 text-center text-xs text-text3">
                  {task.id.startsWith('temp-')
                    ? panelText.localTaskLogsPending
                    : totalLogs === 0
                      ? panelText.noLogs
                      : hasActiveLogFilters
                        ? panelText.noFilteredLogs
                        : panelText.noLogs}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
