import type { ScheduleJob } from '@/lib/types'

let scheduleJobs: ScheduleJob[] = [
  {
    id: 'schedule-1',
    name: '每日价格巡检',
    cron: '0 */4 * * *',
    cronLabel: '每 4 小时',
    lastRun: '今天 12:00',
    nextRun: '今天 16:00',
    enabled: true,
  },
  {
    id: 'schedule-2',
    name: '新品站点全量采集',
    cron: '30 2 * * *',
    cronLabel: '每天 02:30',
    lastRun: '今天 02:30',
    nextRun: '明天 02:30',
    enabled: true,
  },
  {
    id: 'schedule-3',
    name: '库存波动复查',
    cron: '0 */6 * * *',
    cronLabel: '每 6 小时',
    lastRun: '今天 09:00',
    nextRun: '今天 15:00',
    enabled: false,
  },
  {
    id: 'schedule-4',
    name: '高价值品牌补采',
    cron: '15 8,20 * * *',
    cronLabel: '每天 08:15 / 20:15',
    lastRun: '昨天 20:15',
    nextRun: '今天 20:15',
    enabled: true,
  },
]

export function listScheduleJobs() {
  return scheduleJobs.map((job) => ({ ...job }))
}

export function patchScheduleJob(id: string, patch: Partial<ScheduleJob>) {
  const currentJob = scheduleJobs.find((job) => job.id === id)

  if (!currentJob) {
    return null
  }

  Object.assign(currentJob, patch)

  return { ...currentJob }
}
