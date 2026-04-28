'use client'

import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { useSchedule, useUpdateScheduleJob } from '@/hooks/useSchedule'
import { cn } from '@/lib/utils'

/**
 * Schedule page for recurring crawl plans and execution windows.
 */
export default function SchedulePage() {
  const { data = [] } = useSchedule()
  const updateScheduleJob = useUpdateScheduleJob()

  const enabledCount = data.filter((job) => job.enabled).length

  return (
    <>
      <Topbar
        title="调度计划"
        subtitle="配置定时采集与执行窗口"
        actions={
          <div className="flex gap-2">
            <Button variant="outline">暂停全部</Button>
            <Button>新建计划</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="启用计划" value={String(enabledCount)} change="当前可自动执行" trend="up" />
          <StatCard label="下次运行窗口" value="15:00" change="库存波动复查" trend="neutral" />
          <StatCard label="今日执行频次" value="11 次" change="较昨日 +2 次" trend="up" />
        </section>

        <Panel title="计划列表" headerActions={<span className="text-[11px] font-medium text-text3">支持快速启停</span>}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface2 text-[11px] uppercase tracking-[0.04em] text-text3">
                <tr>
                  <th className="px-4 py-3 font-semibold">任务名</th>
                  <th className="px-4 py-3 font-semibold">执行策略</th>
                  <th className="px-4 py-3 font-semibold">上次运行</th>
                  <th className="px-4 py-3 font-semibold">下次运行</th>
                  <th className="px-4 py-3 font-semibold">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.map((job) => (
                  <tr key={job.id} className="border-t border-border text-[13px] text-text2">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text1">{job.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-text3">{job.cron}</div>
                    </td>
                    <td className="px-4 py-3 text-text1">{job.cronLabel}</td>
                    <td className="px-4 py-3">{job.lastRun}</td>
                    <td className="px-4 py-3">{job.nextRun}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => updateScheduleJob.mutate({ id: job.id, patch: { enabled: !job.enabled } })}
                        className={cn(
                          'inline-flex min-w-[74px] items-center justify-center rounded-full px-[10px] py-[5px] text-[11px] font-semibold transition-colors',
                          job.enabled
                            ? 'bg-green-bg text-green-text hover:bg-green-bg/80'
                            : 'bg-surface2 text-text3 hover:bg-surface2/80',
                        )}
                      >
                        {job.enabled ? '已启用' : '已暂停'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  )
}
