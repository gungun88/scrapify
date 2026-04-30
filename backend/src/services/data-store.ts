import fs from 'node:fs/promises'
import path from 'node:path'
import { backendConfig } from '../config'
import { createSeedDatabase } from '../data/seed'
import type {
  DatabaseShape,
  MonitorItem,
  ProxyItem,
  ScheduleJob,
  TaskFailureDetail,
  TaskLogEntry,
  TaskResultRow,
  TaskResultSummary,
  TaskRunRecord,
  TaskRuntimeRecord,
} from '../types'

let state: DatabaseShape | null = null

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

function createMigratedLog(level: TaskLogEntry['level'], message: string, atMs: number): TaskLogEntry {
  return {
    id: `log-migrated-${atMs}-${Math.random().toString(16).slice(2, 8)}`,
    at: new Date(atMs).toISOString(),
    level,
    message,
  }
}

function normalizeTaskLogs(task: Partial<TaskRuntimeRecord>, now: number): TaskLogEntry[] {
  if (Array.isArray(task.logs)) {
    return task.logs
      .filter((log): log is TaskLogEntry => Boolean(log && typeof log.message === 'string' && typeof log.at === 'string'))
      .map((log, index) => ({
        id: typeof log.id === 'string' ? log.id : `log-migrated-${index}`,
        at: log.at,
        level: log.level === 'warn' || log.level === 'error' ? log.level : 'info',
        message: log.message,
      }))
  }

  const createdAtMs = Date.parse(task.createdAt || '') || now
  const logs: TaskLogEntry[] = [createMigratedLog('info', 'Task queued.', createdAtMs)]

  if (task.status === 'running' || task.status === 'done' || task.status === 'error') {
    logs.push(createMigratedLog('info', 'Worker claimed task.', task.startedAtMs || createdAtMs))
  }

  if (task.status === 'done') {
    logs.push(createMigratedLog('info', 'Task completed.', task.updatedAtMs || now))
  }

  if (task.status === 'error') {
    logs.push(createMigratedLog('error', task.errorMessage || 'Task failed during execution.', task.updatedAtMs || now))
  }

  return logs
}

function normalizeTask(task: Partial<TaskRuntimeRecord>, now: number): TaskRuntimeRecord {
  const createdAtMs = Date.parse(task.createdAt || '') || now
  const startedAtMs = typeof task.startedAtMs === 'number' ? task.startedAtMs : createdAtMs
  const startedAt =
    typeof task.startedAt === 'string'
      ? task.startedAt
      : task.status === 'running' || task.status === 'done' || task.status === 'error'
        ? new Date(startedAtMs).toISOString()
        : null
  const finishedAt =
    typeof task.finishedAt === 'string'
      ? task.finishedAt
      : task.status === 'done' || task.status === 'error'
        ? new Date(typeof task.updatedAtMs === 'number' ? task.updatedAtMs : now).toISOString()
        : null
  const normalizeResultRow = (row: unknown): TaskResultRow | null => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return null
    }

    const normalized = Object.entries(row as Record<string, unknown>).reduce<TaskResultRow>((result, [key, value]) => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (Array.isArray(value) && value.every((item) => typeof item === 'string' || typeof item === 'number'))
      ) {
        result[key] = value as TaskResultRow[string]
      }

      return result
    }, {})

    return Object.keys(normalized).length > 0 ? normalized : null
  }
  const normalizeFailureDetail = (detail: unknown): TaskFailureDetail | null => {
    if (!detail || typeof detail !== 'object') {
      return null
    }

    const value = detail as Partial<TaskFailureDetail>

    if (typeof value.at !== 'string' || typeof value.message !== 'string') {
      return null
    }

    return {
      at: value.at,
      code: typeof value.code === 'string' ? value.code : 'task-error',
      message: value.message,
    }
  }
  const normalizeRunRecord = (run: unknown, index: number): TaskRunRecord | null => {
    if (!run || typeof run !== 'object') {
      return null
    }

    const value = run as Partial<TaskRunRecord>

    if (typeof value.startedAt !== 'string') {
      return null
    }

    return {
      id: typeof value.id === 'string' ? value.id : `run-migrated-${index}`,
      source: typeof value.source === 'string' ? value.source : 'legacy-runtime',
      startedAt: value.startedAt,
      finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
      status: value.status === 'pending' || value.status === 'running' || value.status === 'done' || value.status === 'error' ? value.status : 'done',
      itemCount: typeof value.itemCount === 'number' ? value.itemCount : 0,
      pageCount: typeof value.pageCount === 'number' ? value.pageCount : 0,
      errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : null,
    }
  }
  const resultPreview = Array.isArray(task.result?.preview)
    ? task.result.preview.map(normalizeResultRow).filter((row): row is TaskResultRow => row !== null)
    : []
  const result: TaskResultSummary | null =
    task.result && typeof task.result === 'object' && typeof task.result.source === 'string'
      ? {
          source: task.result.source,
          collectionUrl: typeof task.result.collectionUrl === 'string' ? task.result.collectionUrl : task.url || '',
          itemCount: typeof task.result.itemCount === 'number' ? task.result.itemCount : 0,
          pageCount: typeof task.result.pageCount === 'number' ? task.result.pageCount : 0,
          exportedAt: typeof task.result.exportedAt === 'string' ? task.result.exportedAt : null,
          preview: resultPreview,
        }
      : null

  return {
    id: typeof task.id === 'string' ? task.id : `task-migrated-${now}`,
    url: typeof task.url === 'string' ? task.url : '',
    status: task.status === 'running' || task.status === 'done' || task.status === 'error' ? task.status : 'pending',
    progress: typeof task.progress === 'number' ? task.progress : 0,
    itemCount: typeof task.itemCount === 'number' ? task.itemCount : 0,
    elapsed: typeof task.elapsed === 'string' && task.elapsed.trim() ? task.elapsed : '0s',
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date(createdAtMs).toISOString(),
    mode: task.mode === 'incremental' || task.mode === 'price-only' ? task.mode : 'full',
    region: typeof task.region === 'string' ? task.region : 'auto',
    fields: Array.isArray(task.fields) ? task.fields.filter((field): field is string => typeof field === 'string') : [],
    concurrency: typeof task.concurrency === 'number' ? task.concurrency : 1,
    delay: typeof task.delay === 'string' ? task.delay : '1-3s',
    targetCount: typeof task.targetCount === 'number' ? task.targetCount : Math.max(typeof task.itemCount === 'number' ? task.itemCount : 0, 100),
    startedAt,
    finishedAt,
    errorMessage:
      typeof task.errorMessage === 'string'
        ? task.errorMessage
        : task.status === 'error'
          ? 'Task failed before error details were persisted.'
          : null,
    workerId: typeof task.workerId === 'string' ? task.workerId : task.status === 'running' ? 'local-worker-1' : null,
    lastHeartbeatAt:
      typeof task.lastHeartbeatAt === 'string'
        ? task.lastHeartbeatAt
        : task.status === 'running' || task.status === 'done' || task.status === 'error'
          ? new Date(typeof task.updatedAtMs === 'number' ? task.updatedAtMs : now).toISOString()
          : null,
    result,
    failureDetails: Array.isArray(task.failureDetails)
      ? task.failureDetails.map(normalizeFailureDetail).filter((detail): detail is TaskFailureDetail => detail !== null)
      : [],
    runHistory: Array.isArray(task.runHistory)
      ? task.runHistory.map(normalizeRunRecord).filter((run): run is TaskRunRecord => run !== null)
      : [],
    startedAtMs,
    updatedAtMs: typeof task.updatedAtMs === 'number' ? task.updatedAtMs : now,
    logs: normalizeTaskLogs(task, now),
    resultItems: Array.isArray(task.resultItems)
      ? task.resultItems.map(normalizeResultRow).filter((row): row is TaskResultRow => row !== null)
      : [],
    activeRunId: typeof task.activeRunId === 'string' ? task.activeRunId : null,
  }
}

function normalizeDatabase(input: Partial<DatabaseShape> | null | undefined): DatabaseShape {
  const seed = createSeedDatabase()
  const now = Date.now()

  if (!input) {
    return seed
  }

  const normalizeScheduleJob = (job: Partial<ScheduleJob>, fallback: ScheduleJob): ScheduleJob => ({
    ...fallback,
    ...job,
    taskTemplate: {
      ...fallback.taskTemplate,
      ...(job.taskTemplate || {}),
      url: typeof job.taskTemplate?.url === 'string' ? job.taskTemplate.url : fallback.taskTemplate.url,
      mode:
        job.taskTemplate?.mode === 'incremental' || job.taskTemplate?.mode === 'price-only'
          ? job.taskTemplate.mode
          : fallback.taskTemplate.mode,
      region: typeof job.taskTemplate?.region === 'string' ? job.taskTemplate.region : fallback.taskTemplate.region,
      fields: Array.isArray(job.taskTemplate?.fields)
        ? job.taskTemplate.fields.filter((field): field is string => typeof field === 'string')
        : fallback.taskTemplate.fields,
      concurrency:
        typeof job.taskTemplate?.concurrency === 'number'
          ? job.taskTemplate.concurrency
          : fallback.taskTemplate.concurrency,
      delay: typeof job.taskTemplate?.delay === 'string' ? job.taskTemplate.delay : fallback.taskTemplate.delay,
    },
    lastRunAt: typeof job.lastRunAt === 'string' ? job.lastRunAt : fallback.lastRunAt,
    nextRunAt: typeof job.nextRunAt === 'string' ? job.nextRunAt : fallback.nextRunAt,
  })

  const normalizeMonitorItem = (item: Partial<MonitorItem>, fallback: MonitorItem): MonitorItem => ({
    ...(shouldRestoreMonitorBaseline(item, fallback)
      ? fallback
      : {
          ...fallback,
          ...item,
          history: Array.isArray(item.history)
            ? item.history.filter((value): value is number => typeof value === 'number')
            : fallback.history,
          lastCheckedAt: typeof item.lastCheckedAt === 'string' ? item.lastCheckedAt : fallback.lastCheckedAt,
        }),
  })

  const normalizeProxyItem = (item: Partial<ProxyItem>, fallback: ProxyItem): ProxyItem => ({
    ...(shouldRestoreProxyBaseline(item, fallback)
      ? fallback
      : {
          ...fallback,
          ...item,
          lastCheckedAt: typeof item.lastCheckedAt === 'string' ? item.lastCheckedAt : fallback.lastCheckedAt,
          lastHeartbeatAt: typeof item.lastHeartbeatAt === 'string' ? item.lastHeartbeatAt : fallback.lastHeartbeatAt,
          consecutiveFailures:
            typeof item.consecutiveFailures === 'number' ? item.consecutiveFailures : fallback.consecutiveFailures,
        }),
  })

  const scheduleSeedById = new Map(seed.scheduleJobs.map((job) => [job.id, job]))
  const monitorSeedById = new Map(seed.monitorItems.map((item) => [item.id, item]))
  const proxySeedById = new Map(seed.proxyItems.map((item) => [item.id, item]))

  return {
    tasks: Array.isArray(input.tasks) ? input.tasks.map((task) => normalizeTask(task, now)) : seed.tasks,
    fieldConfigs: Array.isArray(input.fieldConfigs) ? input.fieldConfigs : seed.fieldConfigs,
    scheduleJobs: Array.isArray(input.scheduleJobs)
      ? input.scheduleJobs.map((job) => normalizeScheduleJob(job, scheduleSeedById.get(job.id || '') || seed.scheduleJobs[0]))
      : seed.scheduleJobs,
    monitorItems: Array.isArray(input.monitorItems)
      ? input.monitorItems.map((item) => normalizeMonitorItem(item, monitorSeedById.get(item.id || '') || seed.monitorItems[0]))
      : seed.monitorItems,
    proxyItems: Array.isArray(input.proxyItems)
      ? input.proxyItems.map((item) => normalizeProxyItem(item, proxySeedById.get(item.id || '') || seed.proxyItems[0]))
      : seed.proxyItems,
    analyticsSnapshot: input.analyticsSnapshot || seed.analyticsSnapshot,
  }
}

function shouldRestoreMonitorBaseline(item: Partial<MonitorItem>, fallback: MonitorItem) {
  if (fallback.status === 'outofstock' || fallback.price === 0) {
    return false
  }

  const currentHistory = Array.isArray(item.history) ? item.history.filter((value): value is number => typeof value === 'number') : []
  const isZeroedHistory = currentHistory.length > 0 && currentHistory.every((value) => value === 0)
  const isCollapsedLowHistory =
    currentHistory.length > 0 &&
    currentHistory.every((value) => value > 0 && value <= 3) &&
    fallback.history.some((value) => value >= 50)
  const currentStatus = item.status
  const currentPrice = typeof item.price === 'number' ? item.price : null

  return (isZeroedHistory && currentStatus === 'outofstock' && currentPrice === 0) || (isCollapsedLowHistory && currentPrice !== null && currentPrice <= 3)
}

function shouldRestoreProxyBaseline(item: Partial<ProxyItem>, fallback: ProxyItem) {
  const currentFailures = typeof item.consecutiveFailures === 'number' ? item.consecutiveFailures : fallback.consecutiveFailures
  const currentTraffic = typeof item.traffic === 'string' ? item.traffic : fallback.traffic

  return currentFailures >= 100 || /^(\d+(?:\.\d+)?)\s*GB$/i.test(currentTraffic) && Number(currentTraffic.match(/(\d+(?:\.\d+)?)/)?.[1] || 0) >= 20
}

export async function loadDatabase() {
  if (state) {
    return state
  }

  try {
    const raw = await fs.readFile(backendConfig.dataFile, 'utf8')
    state = normalizeDatabase(JSON.parse(raw) as Partial<DatabaseShape>)
    return state
  } catch {
    try {
      const seedRaw = await fs.readFile(backendConfig.seedDataFile, 'utf8')
      state = normalizeDatabase(JSON.parse(seedRaw) as Partial<DatabaseShape>)
    } catch {
      state = createSeedDatabase()
    }

    await saveDatabase()
    return state
  }
}

export async function saveDatabase() {
  if (!state) {
    return
  }

  await ensureParentDir(backendConfig.dataFile)
  await fs.writeFile(backendConfig.dataFile, JSON.stringify(state, null, 2), 'utf8')
}

export async function getDatabase() {
  return loadDatabase()
}
