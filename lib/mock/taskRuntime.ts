import { createTaskId } from '@/lib/utils'
import type { NewTaskForm, Task, TaskDetail, TaskLogEntry, TaskResultRow, TaskStatus } from '@/lib/types'

interface TaskRuntimeRecord extends TaskDetail {
  startedAtMs: number
  updatedAtMs: number
  logs: TaskLogEntry[]
  resultItems: TaskResultRow[]
  activeRunId: string | null
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

function createTaskLog(level: TaskLogEntry['level'], message: string, atMs = Date.now()): TaskLogEntry {
  return {
    id: `log-${Math.random().toString(16).slice(2, 10)}`,
    at: new Date(atMs).toISOString(),
    level,
    message,
  }
}

function seedRuntimeTask(input: SeedTaskInput): TaskRuntimeRecord {
  const now = Date.now()
  const startedAtMs = now - input.elapsedMs
  const createdAt = new Date(startedAtMs).toISOString()
  const startedAt = input.status === 'pending' ? null : createdAt
  const finishedAt = input.status === 'done' || input.status === 'error' ? new Date(now).toISOString() : null
  const logs: TaskLogEntry[] = [createTaskLog('info', 'Task queued.', startedAtMs)]

  if (startedAt) {
    logs.push(createTaskLog('info', 'Worker claimed task.', startedAtMs))
  }

  if (input.status === 'done') {
    logs.push(createTaskLog('info', 'Task completed.', now))
  }

  if (input.status === 'error') {
    logs.push(createTaskLog('error', 'Task failed during execution.', now))
  }

  return {
    id: input.id,
    url: input.url,
    status: input.status,
    progress: input.progress,
    itemCount: input.itemCount,
    elapsed: input.status === 'pending' ? '0s' : formatElapsed(input.elapsedMs),
    createdAt,
    mode: 'full',
    region: 'auto',
    fields: ['title', 'price', 'sku', 'images'],
    concurrency: 3,
    delay: '1-3s',
    targetCount: input.targetCount,
    startedAt,
    finishedAt,
    errorMessage: input.status === 'error' ? 'Task failed during execution.' : null,
    workerId: input.status === 'running' ? 'local-worker-1' : null,
    lastHeartbeatAt: input.status === 'running' ? new Date(now).toISOString() : finishedAt,
    result: null,
    failureDetails: input.status === 'error' ? [{ at: new Date(now).toISOString(), code: 'mock-error', message: 'Task failed during execution.' }] : [],
    runHistory:
      input.status === 'pending'
        ? []
        : [
            {
              id: `run-${input.id}`,
              source: 'mock-runtime',
              startedAt: createdAt,
              finishedAt,
              status: input.status,
              itemCount: input.itemCount,
              pageCount: input.status === 'done' ? 1 : 0,
              errorMessage: input.status === 'error' ? 'Task failed during execution.' : null,
            },
          ],
    startedAtMs,
    updatedAtMs: now,
    logs,
    resultItems: [],
    activeRunId: null,
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

function toTaskDetail(record: TaskRuntimeRecord): TaskDetail {
  return {
    ...toTask(record),
    mode: record.mode,
    region: record.region,
    fields: [...record.fields],
    concurrency: record.concurrency,
    delay: record.delay,
    targetCount: record.targetCount,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    errorMessage: record.errorMessage,
    workerId: record.workerId,
    lastHeartbeatAt: record.lastHeartbeatAt,
    result: record.result,
    failureDetails: [...record.failureDetails],
    runHistory: record.runHistory.map((run) => ({ ...run })),
  }
}

function estimateTargetCount(form: NewTaskForm) {
  const fieldMultiplier = Math.max(form.fields.length, 1) * 110
  const concurrencyMultiplier = form.concurrency * 75
  const modeBonus = form.mode === 'full' ? 820 : form.mode === 'incremental' ? 520 : 280

  return modeBonus + fieldMultiplier + concurrencyMultiplier
}

function advanceTask(record: TaskRuntimeRecord) {
  const now = Date.now()
  const elapsedSinceLastTick = now - record.updatedAtMs

  if (record.status === 'done' || record.status === 'error') {
    return
  }

  if (record.status === 'pending') {
    if (now - Date.parse(record.createdAt) < 1500) {
      return
    }

    record.status = 'running'
    record.startedAt = new Date(now).toISOString()
    record.startedAtMs = now
    record.updatedAtMs = now
    record.elapsed = '0s'
    record.workerId = 'local-worker-1'
    record.lastHeartbeatAt = new Date(now).toISOString()
    record.logs.push(createTaskLog('info', 'Worker claimed task.', now))
    return
  }

  if (elapsedSinceLastTick < 2500) {
    return
  }

  const tickCount = Math.max(1, Math.floor(elapsedSinceLastTick / 3000))
  const nextProgress = Math.min(100, record.progress + tickCount * 6)

  record.progress = nextProgress
  record.itemCount = Math.min(record.targetCount, Math.max(record.itemCount, Math.floor(record.targetCount * (nextProgress / 100))))
  record.elapsed = formatElapsed(now - record.startedAtMs)
  record.updatedAtMs = now
  record.lastHeartbeatAt = new Date(now).toISOString()

  if (record.progress >= 100) {
    record.status = 'done'
    record.progress = 100
    record.itemCount = record.targetCount
    record.finishedAt = new Date(now).toISOString()
    record.workerId = null
    record.logs.push(createTaskLog('info', 'Task completed.', now))
  }
}

export function listTasks() {
  runtimeTasks.forEach(advanceTask)
  return runtimeTasks.map(toTask)
}

export function getTask(id: string) {
  runtimeTasks.forEach(advanceTask)
  const task = runtimeTasks.find((record) => record.id === id)
  return task ? toTaskDetail(task) : null
}

export function getTaskLogs(id: string) {
  runtimeTasks.forEach(advanceTask)
  const task = runtimeTasks.find((record) => record.id === id)
  return task ? [...task.logs] : null
}

export function createTask(form: NewTaskForm) {
  const now = Date.now()
  const task: TaskRuntimeRecord = {
    id: createTaskId(),
    url: form.url.trim(),
    status: 'pending',
    progress: 0,
    itemCount: 0,
    elapsed: '0s',
    createdAt: new Date(now).toISOString(),
    mode: form.mode,
    region: form.region,
    fields: form.fields,
    concurrency: form.concurrency,
    delay: form.delay,
    targetCount: estimateTargetCount(form),
    startedAt: null,
    finishedAt: null,
    errorMessage: null,
    workerId: null,
    lastHeartbeatAt: null,
    result: null,
    failureDetails: [],
    runHistory: [],
    startedAtMs: now,
    updatedAtMs: now,
    logs: [createTaskLog('info', 'Task queued.', now)],
    resultItems: [],
    activeRunId: null,
  }

  runtimeTasks.unshift(task)

  return toTask(task)
}

export function patchTask(id: string, patch: Partial<TaskDetail>) {
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

  if (typeof patch.errorMessage === 'string' || patch.errorMessage === null) {
    task.errorMessage = patch.errorMessage
  }

  if (task.status === 'done') {
    task.progress = 100
    task.itemCount = Math.max(task.itemCount, task.targetCount)
    task.finishedAt = task.finishedAt || new Date().toISOString()
    task.workerId = null
  }

  if (task.status === 'running' && task.startedAt === null) {
    task.startedAt = new Date().toISOString()
    task.startedAtMs = Date.now()
    task.workerId = 'local-worker-1'
  }

  task.updatedAtMs = Date.now()
  task.lastHeartbeatAt = task.status === 'pending' ? null : new Date(task.updatedAtMs).toISOString()

  return toTaskDetail(task)
}
