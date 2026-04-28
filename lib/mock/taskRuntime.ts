import { createTaskId } from '@/lib/utils'
import type { NewTaskForm, Task, TaskStatus } from '@/lib/types'

interface TaskRuntimeRecord extends Task {
  mode: NewTaskForm['mode']
  region: string
  fields: string[]
  concurrency: number
  delay: string
  targetCount: number
  startedAtMs: number
  updatedAtMs: number
}

interface SeedTaskInput {
  id: string
  url: string
  status: TaskStatus
  progress: number
  itemCount: number
  elapsedMs: number
  targetCount: number
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m${seconds.toString().padStart(2, '0')}s`
}

function seedRuntimeTask(input: SeedTaskInput): TaskRuntimeRecord {
  const now = Date.now()
  const startedAtMs = now - input.elapsedMs

  return {
    id: input.id,
    url: input.url,
    status: input.status,
    progress: input.progress,
    itemCount: input.itemCount,
    elapsed: input.status === 'pending' ? '—' : formatElapsed(input.elapsedMs),
    createdAt: new Date(startedAtMs).toISOString(),
    mode: 'full',
    region: 'auto',
    fields: ['title', 'price', 'sku', 'images'],
    concurrency: 3,
    delay: '1-3s',
    targetCount: input.targetCount,
    startedAtMs,
    updatedAtMs: now,
  }
}

const runtimeTasks: TaskRuntimeRecord[] = [
  seedRuntimeTask({
    id: 'task-1',
    url: 'gymshark.com/collections/all',
    status: 'running',
    progress: 72,
    itemCount: 1243,
    elapsedMs: 252000,
    targetCount: 1720,
  }),
  seedRuntimeTask({
    id: 'task-2',
    url: 'fashionnova.com/collections/dresses',
    status: 'done',
    progress: 100,
    itemCount: 3892,
    elapsedMs: 720000,
    targetCount: 3892,
  }),
  seedRuntimeTask({
    id: 'task-3',
    url: 'allbirds.com/pages/all-products',
    status: 'pending',
    progress: 0,
    itemCount: 0,
    elapsedMs: 0,
    targetCount: 980,
  }),
  seedRuntimeTask({
    id: 'task-4',
    url: 'bombas.com/collections/mens-socks',
    status: 'error',
    progress: 38,
    itemCount: 519,
    elapsedMs: 151000,
    targetCount: 1360,
  }),
  seedRuntimeTask({
    id: 'task-5',
    url: 'ruggable.com/products',
    status: 'running',
    progress: 55,
    itemCount: 876,
    elapsedMs: 185000,
    targetCount: 1590,
  }),
  seedRuntimeTask({
    id: 'task-6',
    url: 'everlane.com/collections/new-arrivals',
    status: 'done',
    progress: 100,
    itemCount: 2104,
    elapsedMs: 520000,
    targetCount: 2104,
  }),
  seedRuntimeTask({
    id: 'task-7',
    url: 'cettire.com/collections/womens',
    status: 'running',
    progress: 30,
    itemCount: 441,
    elapsedMs: 112000,
    targetCount: 1460,
  }),
]

function toTask(record: TaskRuntimeRecord): Task {
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

function estimateTargetCount(form: NewTaskForm) {
  const fieldMultiplier = Math.max(form.fields.length, 1) * 110
  const concurrencyMultiplier = form.concurrency * 75
  const modeBonus =
    form.mode === 'full' ? 820 : form.mode === 'incremental' ? 520 : 280

  return modeBonus + fieldMultiplier + concurrencyMultiplier
}

function advanceTask(record: TaskRuntimeRecord) {
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
    record.itemCount = Math.min(record.targetCount, Math.max(record.itemCount, Math.floor(record.targetCount * (nextProgress / 100))))
    record.elapsed = formatElapsed(now - record.startedAtMs)

    if (record.progress >= 100) {
      record.status = 'done'
      record.progress = 100
      record.itemCount = record.targetCount
    }
  }

  record.updatedAtMs = now
}

export function listTasks() {
  runtimeTasks.forEach(advanceTask)
  return runtimeTasks.map(toTask)
}

export function createTask(form: NewTaskForm) {
  const now = Date.now()
  const task: TaskRuntimeRecord = {
    id: createTaskId(),
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

  runtimeTasks.unshift(task)

  return toTask(task)
}

export function patchTask(id: string, patch: Partial<Task>) {
  const task = runtimeTasks.find((record) => record.id === id)

  if (!task) {
    return null
  }

  if (typeof patch.url === 'string') {
    task.url = patch.url
  }

  if (typeof patch.progress === 'number') {
    task.progress = Math.max(0, Math.min(100, patch.progress))
  }

  if (typeof patch.itemCount === 'number') {
    task.itemCount = Math.max(0, patch.itemCount)
  }

  if (typeof patch.status === 'string') {
    task.status = patch.status
  }

  if (typeof patch.elapsed === 'string') {
    task.elapsed = patch.elapsed
  }

  if (task.status === 'done') {
    task.progress = 100
    task.itemCount = Math.max(task.itemCount, task.targetCount)
  }

  if (task.status === 'running' && task.progress === 0) {
    task.progress = 5
  }

  if (task.status !== 'pending' && typeof patch.elapsed !== 'string') {
    task.elapsed = formatElapsed(Date.now() - task.startedAtMs)
  }

  task.updatedAtMs = Date.now()

  return toTask(task)
}
