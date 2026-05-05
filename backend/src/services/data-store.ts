import { eq } from 'drizzle-orm'
import { createSeedDatabase } from '../data/seed'
import { getDb } from '../db/client'
import {
  analyticsSnapshots,
  fieldConfigs as fieldConfigsTable,
  monitorItems as monitorItemsTable,
  proxyItems as proxyItemsTable,
  scheduleJobs as scheduleJobsTable,
  tasks as tasksTable,
} from '../db/schema'
import type {
  AnalyticsSnapshot,
  DatabaseShape,
  FieldConfig,
  FieldType,
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

const ANALYTICS_SINGLETON_ID = 'global-analytics'

let state: DatabaseShape | null = null

// 同时进行的写入用 in-flight + pending 的方式合并：
// 任何在写入过程中到来的新 save 调用都会被合并成单次后续刷盘，
// 避免高频 heartbeat 触发的 N 次 truncate+insert。
let saveInFlight: Promise<void> | null = null
let savePending = false

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
      .filter(
        (log): log is TaskLogEntry =>
          Boolean(log && typeof log.message === 'string' && typeof log.at === 'string'),
      )
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
    logs.push(
      createMigratedLog(
        'error',
        task.errorMessage || 'Task failed during execution.',
        task.updatedAtMs || now,
      ),
    )
  }

  return logs
}

function normalizeResultRow(row: unknown): TaskResultRow | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return null
  }

  const normalized = Object.entries(row as Record<string, unknown>).reduce<TaskResultRow>(
    (result, [key, value]) => {
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
    },
    {},
  )

  return Object.keys(normalized).length > 0 ? normalized : null
}

function normalizeFailureDetail(detail: unknown): TaskFailureDetail | null {
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

function normalizeRunRecord(run: unknown, index: number): TaskRunRecord | null {
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
    status:
      value.status === 'pending' ||
      value.status === 'running' ||
      value.status === 'done' ||
      value.status === 'error'
        ? value.status
        : 'done',
    itemCount: typeof value.itemCount === 'number' ? value.itemCount : 0,
    pageCount: typeof value.pageCount === 'number' ? value.pageCount : 0,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : null,
  }
}

export function normalizeTaskRecord(task: Partial<TaskRuntimeRecord>, now: number): TaskRuntimeRecord {
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
  const resultPreview = Array.isArray(task.result?.preview)
    ? task.result.preview.map(normalizeResultRow).filter((row): row is TaskResultRow => row !== null)
    : []
  const result: TaskResultSummary | null =
    task.result && typeof task.result === 'object' && typeof task.result.source === 'string'
      ? {
          source: task.result.source,
          collectionUrl:
            typeof task.result.collectionUrl === 'string' ? task.result.collectionUrl : task.url || '',
          itemCount: typeof task.result.itemCount === 'number' ? task.result.itemCount : 0,
          pageCount: typeof task.result.pageCount === 'number' ? task.result.pageCount : 0,
          exportedAt: typeof task.result.exportedAt === 'string' ? task.result.exportedAt : null,
          preview: resultPreview,
        }
      : null

  return {
    id: typeof task.id === 'string' ? task.id : `task-migrated-${now}`,
    url: typeof task.url === 'string' ? task.url : '',
    status:
      task.status === 'running' || task.status === 'done' || task.status === 'error'
        ? task.status
        : 'pending',
    progress: typeof task.progress === 'number' ? task.progress : 0,
    itemCount: typeof task.itemCount === 'number' ? task.itemCount : 0,
    elapsed: typeof task.elapsed === 'string' && task.elapsed.trim() ? task.elapsed : '0s',
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date(createdAtMs).toISOString(),
    mode: task.mode === 'incremental' || task.mode === 'price-only' ? task.mode : 'full',
    region: typeof task.region === 'string' ? task.region : 'auto',
    fields: Array.isArray(task.fields)
      ? task.fields.filter((field): field is string => typeof field === 'string')
      : [],
    concurrency: typeof task.concurrency === 'number' ? task.concurrency : 1,
    delay: typeof task.delay === 'string' ? task.delay : '1-3s',
    targetCount:
      typeof task.targetCount === 'number'
        ? task.targetCount
        : Math.max(typeof task.itemCount === 'number' ? task.itemCount : 0, 100),
    startedAt,
    finishedAt,
    errorMessage:
      typeof task.errorMessage === 'string'
        ? task.errorMessage
        : task.status === 'error'
          ? 'Task failed before error details were persisted.'
          : null,
    workerId:
      typeof task.workerId === 'string'
        ? task.workerId
        : task.status === 'running'
          ? 'local-worker-1'
          : null,
    lastHeartbeatAt:
      typeof task.lastHeartbeatAt === 'string'
        ? task.lastHeartbeatAt
        : task.status === 'running' || task.status === 'done' || task.status === 'error'
          ? new Date(typeof task.updatedAtMs === 'number' ? task.updatedAtMs : now).toISOString()
          : null,
    result,
    failureDetails: Array.isArray(task.failureDetails)
      ? task.failureDetails
          .map(normalizeFailureDetail)
          .filter((detail): detail is TaskFailureDetail => detail !== null)
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

async function fetchStateFromPg(): Promise<DatabaseShape | null> {
  const db = getDb()
  const now = Date.now()

  const [taskRows, fieldRows, scheduleRows, monitorRows, proxyRows, analyticsRows] = await Promise.all([
    db.select().from(tasksTable),
    db.select().from(fieldConfigsTable),
    db.select().from(scheduleJobsTable),
    db.select().from(monitorItemsTable),
    db.select().from(proxyItemsTable),
    db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.id, ANALYTICS_SINGLETON_ID)),
  ])

  const everythingEmpty =
    taskRows.length === 0 &&
    fieldRows.length === 0 &&
    scheduleRows.length === 0 &&
    monitorRows.length === 0 &&
    proxyRows.length === 0 &&
    analyticsRows.length === 0

  if (everythingEmpty) {
    return null
  }

  const seed = createSeedDatabase()

  const tasks = taskRows.map((row: { payload: Partial<TaskRuntimeRecord> }) =>
    normalizeTaskRecord(row.payload, now),
  )

  const fieldConfigs: FieldConfig[] = fieldRows.length
    ? fieldRows.map(
        (row: { id: string; label: string; path: string; type: string; enabled: boolean }) => ({
          id: row.id,
          label: row.label,
          path: row.path,
          type: row.type as FieldType,
          enabled: row.enabled,
        }),
      )
    : seed.fieldConfigs

  const scheduleJobs: ScheduleJob[] = scheduleRows.length
    ? scheduleRows.map((row: { payload: ScheduleJob }) => row.payload)
    : seed.scheduleJobs

  const monitorItems: MonitorItem[] = monitorRows.length
    ? monitorRows.map((row: { payload: MonitorItem }) => row.payload)
    : seed.monitorItems

  const proxyItems: ProxyItem[] = proxyRows.length
    ? proxyRows.map((row: { payload: ProxyItem }) => row.payload)
    : seed.proxyItems

  const analyticsSnapshot: AnalyticsSnapshot = analyticsRows[0]
    ? (analyticsRows[0].payload as AnalyticsSnapshot)
    : seed.analyticsSnapshot

  return {
    tasks,
    fieldConfigs,
    scheduleJobs,
    monitorItems,
    proxyItems,
    analyticsSnapshot,
  }
}

async function flushStateToPg(snapshot: DatabaseShape): Promise<void> {
  const db = getDb()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.transaction(async (tx: any) => {
    await tx.delete(tasksTable)
    if (snapshot.tasks.length > 0) {
      await tx.insert(tasksTable).values(
        snapshot.tasks.map((task) => ({
          id: task.id,
          userId: null,
          url: task.url,
          status: task.status,
          payload: task,
          startedAtMs: task.startedAtMs,
          updatedAtMs: task.updatedAtMs,
          createdAt: new Date(Date.parse(task.createdAt) || Date.now()),
        })),
      )
    }

    await tx.delete(fieldConfigsTable)
    if (snapshot.fieldConfigs.length > 0) {
      await tx.insert(fieldConfigsTable).values(
        snapshot.fieldConfigs.map((field) => ({
          id: field.id,
          userId: null,
          label: field.label,
          path: field.path,
          type: field.type,
          enabled: field.enabled,
        })),
      )
    }

    await tx.delete(scheduleJobsTable)
    if (snapshot.scheduleJobs.length > 0) {
      await tx.insert(scheduleJobsTable).values(
        snapshot.scheduleJobs.map((job) => ({
          id: job.id,
          userId: null,
          payload: job,
        })),
      )
    }

    await tx.delete(monitorItemsTable)
    if (snapshot.monitorItems.length > 0) {
      await tx.insert(monitorItemsTable).values(
        snapshot.monitorItems.map((item) => ({
          id: item.id,
          userId: null,
          payload: item,
        })),
      )
    }

    await tx.delete(proxyItemsTable)
    if (snapshot.proxyItems.length > 0) {
      await tx.insert(proxyItemsTable).values(
        snapshot.proxyItems.map((item) => ({
          id: item.id,
          userId: null,
          payload: item,
        })),
      )
    }

    await tx.delete(analyticsSnapshots)
    await tx.insert(analyticsSnapshots).values({
      id: ANALYTICS_SINGLETON_ID,
      userId: null,
      payload: snapshot.analyticsSnapshot,
    })
  })
}

export async function loadDatabase(): Promise<DatabaseShape> {
  if (state) {
    return state
  }

  const fromPg = await fetchStateFromPg()
  if (fromPg) {
    state = fromPg
    return state
  }

  state = createSeedDatabase()
  await flushStateToPg(state)
  return state
}

async function performSave(): Promise<void> {
  if (!state) {
    return
  }

  // 取一次内存快照避免在 PG 写入期间被 worker 修改导致不一致。
  const snapshot: DatabaseShape = {
    tasks: state.tasks.map((task) => ({ ...task })),
    fieldConfigs: state.fieldConfigs.map((field) => ({ ...field })),
    scheduleJobs: state.scheduleJobs.map((job) => ({ ...job })),
    monitorItems: state.monitorItems.map((item) => ({ ...item })),
    proxyItems: state.proxyItems.map((item) => ({ ...item })),
    analyticsSnapshot: state.analyticsSnapshot,
  }

  await flushStateToPg(snapshot)
}

export async function saveDatabase(): Promise<void> {
  if (saveInFlight) {
    savePending = true
    return saveInFlight
  }

  saveInFlight = (async () => {
    try {
      await performSave()
    } finally {
      saveInFlight = null
      if (savePending) {
        savePending = false
        // 让出 event loop，再触发一次合并的写入
        setTimeout(() => {
          void saveDatabase()
        }, 50)
      }
    }
  })()

  return saveInFlight
}

export async function getDatabase(): Promise<DatabaseShape> {
  return loadDatabase()
}

// 仅供测试 / 迁移脚本使用
export function resetInMemoryStateForTest() {
  state = null
}
