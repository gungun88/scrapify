import type { ScheduleJob } from '../types'
import { getDatabase, saveDatabase } from './data-store'
import { nowIso } from './runtime-utils'
import { createTaskLog, createRuntimeTask } from './task-runtime'

const SCHEDULE_TICK_MS = 30_000

let scheduleWorkerTimer: NodeJS.Timeout | null = null
let scheduleWorkerBusy = false

function parseCronPart(part: string, min: number, max: number) {
  if (part === '*') {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index)
  }

  if (part.startsWith('*/')) {
    const step = Number(part.slice(2))
    if (!Number.isFinite(step) || step <= 0) {
      return []
    }

    const values: number[] = []
    for (let value = min; value <= max; value += step) {
      values.push(value)
    }
    return values
  }

  return part
    .split(',')
    .map((token) => Number(token.trim()))
    .filter((value) => Number.isInteger(value) && value >= min && value <= max)
}

function parseCron(cron: string) {
  const [minutePart = '*', hourPart = '*'] = cron.trim().split(/\s+/)
  return {
    minutes: parseCronPart(minutePart, 0, 59),
    hours: parseCronPart(hourPart, 0, 23),
  }
}

function findNextRunAt(cron: string, fromMs: number) {
  const { minutes, hours } = parseCron(cron)

  if (!minutes.length || !hours.length) {
    return null
  }

  const candidate = new Date(fromMs)
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  for (let attempt = 0; attempt < 60 * 24 * 14; attempt += 1) {
    if (hours.includes(candidate.getHours()) && minutes.includes(candidate.getMinutes())) {
      return candidate.toISOString()
    }

    candidate.setMinutes(candidate.getMinutes() + 1)
  }

  return null
}

function formatScheduleLabel(targetMs: number, nowMs: number) {
  const target = new Date(targetMs)
  const now = new Date(nowMs)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const diffDays = Math.round((targetStart - todayStart) / (24 * 60 * 60 * 1000))
  const prefix = diffDays === 0 ? '今天' : diffDays === 1 ? '明天' : diffDays === -1 ? '昨天' : `${target.getMonth() + 1}/${target.getDate()}`
  const time = `${target.getHours().toString().padStart(2, '0')}:${target.getMinutes().toString().padStart(2, '0')}`
  return `${prefix} ${time}`
}

export function refreshScheduleJob(job: ScheduleJob, fromMs = Date.now()) {
  if (!job.enabled) {
    job.nextRunAt = null
    job.nextRun = '已暂停'
    return
  }

  const nextRunAt = findNextRunAt(job.cron, fromMs)
  job.nextRunAt = nextRunAt
  job.nextRun = nextRunAt ? formatScheduleLabel(Date.parse(nextRunAt), fromMs) : '无法解析'
}

function markScheduleRun(job: ScheduleJob, runAtMs: number) {
  const runAt = nowIso(runAtMs)
  job.lastRunAt = runAt
  job.lastRun = formatScheduleLabel(runAtMs, runAtMs)
  refreshScheduleJob(job, runAtMs)
}

function createTaskFromSchedule(job: ScheduleJob, runAtMs: number) {
  const task = createRuntimeTask(job.taskTemplate)
  task.createdAt = nowIso(runAtMs)
  task.startedAtMs = runAtMs
  task.updatedAtMs = runAtMs
  task.logs.push(createTaskLog('info', `Scheduled by ${job.name}.`, runAtMs))
  return task
}

async function tickScheduleWorker() {
  if (scheduleWorkerBusy) {
    return
  }

  scheduleWorkerBusy = true

  try {
    const db = await getDatabase()
    const nowMs = Date.now()
    let changed = false

    for (const job of db.scheduleJobs) {
      if (!job.enabled) {
        if (job.nextRunAt !== null || job.nextRun !== '已暂停') {
          refreshScheduleJob(job, nowMs)
          changed = true
        }
        continue
      }

      if (!job.nextRunAt) {
        refreshScheduleJob(job, nowMs)
        changed = true
        continue
      }

      const dueAtMs = Date.parse(job.nextRunAt)
      if (Number.isNaN(dueAtMs)) {
        refreshScheduleJob(job, nowMs)
        changed = true
        continue
      }

      if (dueAtMs > nowMs) {
        continue
      }

      db.tasks.unshift(createTaskFromSchedule(job, nowMs))
      markScheduleRun(job, nowMs)
      changed = true
    }

    if (changed) {
      await saveDatabase()
    }
  } finally {
    scheduleWorkerBusy = false
  }
}

export function startScheduleWorker() {
  if (scheduleWorkerTimer) {
    return
  }

  void tickScheduleWorker()
  scheduleWorkerTimer = setInterval(() => {
    void tickScheduleWorker()
  }, SCHEDULE_TICK_MS)
  scheduleWorkerTimer.unref?.()
}

export function stopScheduleWorker() {
  if (!scheduleWorkerTimer) {
    return
  }

  clearInterval(scheduleWorkerTimer)
  scheduleWorkerTimer = null
}
