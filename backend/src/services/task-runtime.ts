import { randomUUID } from 'node:crypto'
import { formatElapsed } from '../data/seed'
import type { NewTaskForm, Task, TaskRuntimeRecord } from '../types'

export function toTask(record: TaskRuntimeRecord): Task {
  return {
    id: record.id,
    url: record.url,
    status: record.status,
    progress: record.status === 'done' ? 100 : record.progress,
    itemCount: record.status === 'pending' ? 0 : record.itemCount,
    elapsed: record.elapsed,
    createdAt: record.createdAt,
  }
}

export function advanceTask(record: TaskRuntimeRecord) {
  const now = Date.now()
  const elapsedSinceLastTick = now - record.updatedAtMs

  if (elapsedSinceLastTick < 2500) {
    return
  }

  const tickCount = Math.max(1, Math.floor(elapsedSinceLastTick / 3000))

  if (record.status === 'pending') {
    if (now - record.startedAtMs >= 3000) {
      record.status = 'running'
      record.progress = Math.max(record.progress, 8)
      record.elapsed = formatElapsed(now - record.startedAtMs)
    } else {
      record.updatedAtMs = now
      return
    }
  }

  if (record.status === 'running') {
    const nextProgress = Math.min(100, record.progress + tickCount * 6)
    record.progress = nextProgress
    record.itemCount = Math.min(
      record.targetCount,
      Math.max(record.itemCount, Math.floor(record.targetCount * (nextProgress / 100))),
    )
    record.elapsed = formatElapsed(now - record.startedAtMs)

    if (record.progress >= 100) {
      record.status = 'done'
      record.progress = 100
      record.itemCount = record.targetCount
    }
  }

  record.updatedAtMs = now
}

export function estimateTargetCount(form: NewTaskForm) {
  const fieldMultiplier = Math.max(form.fields.length, 1) * 110
  const concurrencyMultiplier = form.concurrency * 75
  const modeBonus = form.mode === 'full' ? 820 : form.mode === 'incremental' ? 520 : 280
  return modeBonus + fieldMultiplier + concurrencyMultiplier
}

export function createRuntimeTask(form: NewTaskForm): TaskRuntimeRecord {
  const now = Date.now()

  return {
    id: `task-${randomUUID().slice(0, 8)}`,
    url: form.url.trim(),
    status: 'pending',
    progress: 0,
    itemCount: 0,
    elapsed: '—',
    createdAt: new Date(now).toISOString(),
    mode: form.mode,
    region: form.region,
    fields: form.fields,
    concurrency: form.concurrency,
    delay: form.delay,
    targetCount: estimateTargetCount(form),
    startedAtMs: now,
    updatedAtMs: now,
  }
}
