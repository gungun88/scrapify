import { getDb } from '../db/client'
import { tasks as tasksTable } from '../db/schema'
import type { DatabaseShape, TaskResultRow, TaskResultSummary, TaskRuntimeRecord } from '../types'

let state: DatabaseShape | null = null

// 同时进行的写入用 in-flight + pending 的方式合并：
// 任何在写入过程中到来的新 save 调用都会被合并成单次后续刷盘，
// 避免高频 heartbeat 触发的 N 次 truncate+insert。
let saveInFlight: Promise<void> | null = null
let savePending = false

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

export function normalizeTaskRecord(
  task: Partial<TaskRuntimeRecord>,
  now: number,
  userId: string,
): TaskRuntimeRecord {
  const createdAtMs = Date.parse(task.createdAt || '') || now
  const startedAtMs = typeof task.startedAtMs === 'number' ? task.startedAtMs : createdAtMs
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
    userId,
    url: typeof task.url === 'string' ? task.url : '',
    status:
      task.status === 'running' || task.status === 'done' || task.status === 'error'
        ? task.status
        : 'pending',
    progress: typeof task.progress === 'number' ? task.progress : 0,
    itemCount: typeof task.itemCount === 'number' ? task.itemCount : 0,
    elapsed: typeof task.elapsed === 'string' && task.elapsed.trim() ? task.elapsed : '0s',
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date(createdAtMs).toISOString(),
    startedAtMs,
    updatedAtMs: typeof task.updatedAtMs === 'number' ? task.updatedAtMs : now,
    result,
    resultItems: Array.isArray(task.resultItems)
      ? task.resultItems.map(normalizeResultRow).filter((row): row is TaskResultRow => row !== null)
      : [],
  }
}

async function fetchStateFromPg(): Promise<DatabaseShape | null> {
  const db = getDb()
  const now = Date.now()

  const taskRows = await db.select().from(tasksTable)

  if (taskRows.length === 0) {
    return null
  }

  const tasks = taskRows.map((row: { payload: Partial<TaskRuntimeRecord>; userId: string }) =>
    normalizeTaskRecord(row.payload, now, row.userId),
  )

  return { tasks }
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
          userId: task.userId,
          url: task.url,
          status: task.status,
          payload: task,
          startedAtMs: task.startedAtMs,
          updatedAtMs: task.updatedAtMs,
          createdAt: new Date(Date.parse(task.createdAt) || Date.now()),
        })),
      )
    }
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

  state = { tasks: [] }
  return state
}

async function performSave(): Promise<void> {
  if (!state) {
    return
  }

  // 取一次内存快照避免在 PG 写入期间被 worker 修改导致不一致。
  const snapshot: DatabaseShape = {
    tasks: state.tasks.map((task) => ({ ...task })),
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
