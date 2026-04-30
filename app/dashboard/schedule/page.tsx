'use client'

import type { ScheduleJob } from '@/lib/types'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { useSchedule, useUpdateScheduleJob } from '@/hooks/useSchedule'
import { cn } from '@/lib/utils'

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function parseTimestamp(value: string | null) {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

function formatTimestamp(value: string | null) {
  const timestamp = parseTimestamp(value)
  if (!timestamp) {
    return '时间待定'
  }

  return dateTimeFormatter.format(new Date(timestamp))
}

function pickNextJob(jobs: ScheduleJob[]) {
  return [...jobs]
    .filter((job) => job.enabled && parseTimestamp(job.nextRunAt) !== null)
    .sort((left, right) => parseTimestamp(left.nextRunAt)! - parseTimestamp(right.nextRunAt)!)[0]
}

function pickLatestRunJob(jobs: ScheduleJob[]) {
  return [...jobs]
    .filter((job) => parseTimestamp(job.lastRunAt) !== null)
    .sort((left, right) => parseTimestamp(right.lastRunAt)! - parseTimestamp(left.lastRunAt)!)[0]
}

function getLastRunSummary(job: ScheduleJob) {
  if (job.lastRun) {
    return job.lastRun
  }

  if (job.lastRunAt) {
    return formatTimestamp(job.lastRunAt)
  }

  return '暂无记录'
}

function getNextRunSummary(job: ScheduleJob) {
  if (!job.enabled) {
    return '已暂停'
  }

  if (job.nextRun) {
    return job.nextRun
  }

  if (job.nextRunAt) {
    return formatTimestamp(job.nextRunAt)
  }

  return '待计算'
}

export default function SchedulePage() {
  const scheduleQuery = useSchedule()
  const updateScheduleJob = useUpdateScheduleJob()
  const data = scheduleQuery.data ?? []

  const enabledCount = data.filter((job) => job.enabled).length
  const pausedCount = data.length - enabledCount
  const nextJob = pickNextJob(data)
  const latestRunJob = pickLatestRunJob(data)

  const stats = [
    {
      label: '已启用计划',
      value: data.length ? `${enabledCount}/${data.length}` : '0',
      change:
        data.length === 0
          ? '暂无调度计划'
          : pausedCount === 0
            ? '全部计划均会自动执行'
            : `${pausedCount} 个计划当前已暂停`,
      trend: pausedCount === 0 && data.length > 0 ? 'up' : 'neutral',
    },
    {
      label: '下一次执行',
      value: nextJob ? getNextRunSummary(nextJob) : '暂无安排',
      change: nextJob
        ? `${nextJob.name} · ${formatTimestamp(nextJob.nextRunAt)}`
        : enabledCount > 0
          ? '启用计划后会在这里显示最近窗口'
          : '启用计划后显示下一次调度',
      trend: 'neutral',
    },
    {
      label: '最近一次执行',
      value: latestRunJob ? getLastRunSummary(latestRunJob) : '暂无记录',
      change: latestRunJob
        ? `${latestRunJob.name} · ${formatTimestamp(latestRunJob.lastRunAt)}`
        : '任务开始运行后会显示最近执行记录',
      trend: latestRunJob ? 'up' : 'neutral',
    },
  ] as const

  return (
    <>
      <Topbar
        title="调度计划"
        subtitle="配置定时采集、执行窗口和当前调度状态。"
        actions={
          <div className="flex gap-2">
            <Button variant="outline">暂停全部</Button>
            <Button>新建计划</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {scheduleQuery.isError ? (
          <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">{scheduleQuery.error.message}</div>
        ) : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </section>

        <Panel title="计划列表" headerActions={<span className="text-[11px] font-medium text-text3">支持快速启停并查看调度状态</span>}>
          {scheduleQuery.isLoading && data.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-text3">正在加载调度计划...</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface2 text-[11px] uppercase tracking-[0.04em] text-text3">
                <tr>
                  <th className="px-4 py-3 font-semibold">任务名称</th>
                  <th className="px-4 py-3 font-semibold">执行策略</th>
                  <th className="px-4 py-3 font-semibold">上次执行</th>
                  <th className="px-4 py-3 font-semibold">下次执行</th>
                  <th className="px-4 py-3 font-semibold">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr className="border-t border-border text-[13px] text-text2">
                    <td colSpan={5} className="px-4 py-8 text-center text-text3">
                      暂无调度计划
                    </td>
                  </tr>
                ) : (
                  data.map((job) => {
                    const hasRun = Boolean(job.lastRunAt || job.lastRun)
                    const nextRunLabel = getNextRunSummary(job)
                    const nextRunMeta = job.enabled
                      ? job.nextRunAt
                        ? formatTimestamp(job.nextRunAt)
                        : '等待后端返回下次调度时间'
                      : '恢复后继续按策略执行'
                    const lastRunLabel = getLastRunSummary(job)
                    const lastRunMeta = job.lastRunAt
                      ? formatTimestamp(job.lastRunAt)
                      : hasRun
                        ? '最近执行时间待补充'
                        : '尚未产生执行记录'
                    const statusLabel = job.enabled ? (hasRun ? '已启用' : '待首次运行') : '已暂停'
                    const statusTone = job.enabled
                      ? hasRun
                        ? 'bg-green-bg text-green-text hover:bg-green-bg/80'
                        : 'bg-amber-bg text-amber-text hover:bg-amber-bg/80'
                      : 'bg-surface2 text-text3 hover:bg-surface2/80'
                    const statusHint = job.enabled
                      ? job.nextRun
                        ? `下次执行：${job.nextRun}`
                        : '等待生成下一次执行窗口'
                      : '点击按钮可恢复自动执行'

                    return (
                      <tr key={job.id} className="border-t border-border text-[13px] text-text2">
                        <td className="px-4 py-3">
                          <div className="font-medium text-text1">{job.name}</div>
                          <div className="mt-1 font-mono text-[11px] text-text3">{job.cron}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-text1">{job.cronLabel}</div>
                          <div className="mt-1 text-[11px] text-text3">{job.enabled ? '按策略自动调度' : '当前不参与自动调度'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-text1">{lastRunLabel}</div>
                          <div className="mt-1 text-[11px] text-text3">{lastRunMeta}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={cn('text-text1', !job.enabled && 'text-text3')}>{nextRunLabel}</div>
                          <div className="mt-1 text-[11px] text-text3">{nextRunMeta}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <button
                              type="button"
                              aria-pressed={job.enabled}
                              onClick={() => updateScheduleJob.mutate({ id: job.id, patch: { enabled: !job.enabled } })}
                              className={cn(
                                'inline-flex min-w-[88px] items-center justify-center rounded-full px-[10px] py-[5px] text-[11px] font-semibold transition-colors',
                                statusTone,
                              )}
                            >
                              {statusLabel}
                            </button>
                            <span className="text-[11px] text-text3">{statusHint}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
