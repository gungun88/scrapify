import type { ScheduleJob } from '@/lib/types'

const now = new Date()

function atRelativeDay(dayOffset: number, hours: number, minutes: number) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hours, minutes, 0, 0).toISOString()
}

let scheduleJobs: ScheduleJob[] = [
  {
    id: 'schedule-1',
    name: '每日价格巡检',
    cron: '0 */4 * * *',
    cronLabel: '每 4 小时',
    lastRun: '今天 12:00',
    nextRun: '今天 16:00',
    enabled: true,
    taskTemplate: {
      url: 'gymshark.com/collections/all',
      mode: 'price-only',
      region: 'us',
      fields: ['title', 'price', 'sku'],
      concurrency: 3,
      delay: '1-3s',
    },
    lastRunAt: atRelativeDay(0, 12, 0),
    nextRunAt: atRelativeDay(0, 16, 0),
  },
  {
    id: 'schedule-2',
    name: '新品站点全量采集',
    cron: '30 2 * * *',
    cronLabel: '每天 02:30',
    lastRun: '今天 02:30',
    nextRun: '明天 02:30',
    enabled: true,
    taskTemplate: {
      url: 'fashionnova.com/collections/new',
      mode: 'full',
      region: 'us',
      fields: ['title', 'price', 'sku', 'images', 'vendor'],
      concurrency: 5,
      delay: '1-3s',
    },
    lastRunAt: atRelativeDay(0, 2, 30),
    nextRunAt: atRelativeDay(1, 2, 30),
  },
  {
    id: 'schedule-3',
    name: '库存波动复查',
    cron: '0 */6 * * *',
    cronLabel: '每 6 小时',
    lastRun: '今天 09:00',
    nextRun: '今天 15:00',
    enabled: false,
    taskTemplate: {
      url: 'ruggable.com/products',
      mode: 'incremental',
      region: 'us',
      fields: ['title', 'price', 'inventory'],
      concurrency: 3,
      delay: '5s',
    },
    lastRunAt: atRelativeDay(0, 9, 0),
    nextRunAt: atRelativeDay(0, 15, 0),
  },
  {
    id: 'schedule-4',
    name: '高价品牌补采',
    cron: '15 8,20 * * *',
    cronLabel: '每天 08:15 / 20:15',
    lastRun: '昨天 20:15',
    nextRun: '今天 20:15',
    enabled: true,
    taskTemplate: {
      url: 'cettire.com/collections/womens',
      mode: 'incremental',
      region: 'uk',
      fields: ['title', 'price', 'images', 'vendor'],
      concurrency: 5,
      delay: '0.5s',
    },
    lastRunAt: atRelativeDay(-1, 20, 15),
    nextRunAt: atRelativeDay(0, 20, 15),
  },
]

export function listScheduleJobs() {
  return scheduleJobs.map((job) => ({ ...job, taskTemplate: { ...job.taskTemplate, fields: [...job.taskTemplate.fields] } }))
}

export function patchScheduleJob(id: string, patch: Partial<ScheduleJob>) {
  const currentJob = scheduleJobs.find((job) => job.id === id)

  if (!currentJob) {
    return null
  }

  Object.assign(currentJob, patch)

  return { ...currentJob, taskTemplate: { ...currentJob.taskTemplate, fields: [...currentJob.taskTemplate.fields] } }
}
