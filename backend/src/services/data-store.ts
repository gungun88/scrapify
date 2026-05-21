import { desc, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  conversations as conversationsTable,
  proxies as proxiesTable,
  tasks as tasksTable,
} from '../db/schema'
import type {
  CatalogLimit,
  CollectMode,
  ConversationRecord,
  DatabaseShape,
  ProxyRecord,
  ProxyScheme,
  ProxyStatus,
  TaskResultRow,
  TaskResultSummary,
  TaskRuntimeRecord,
} from '../types'

// 内存模型不变,数据仍在进程内 in-memory 维护;但**刷盘改为按差异写**:
// 每次 markTaskDirty / markTaskDeleted / markConversationDirty / markConversationDeleted
// 累积变更,saveDatabase() 在合并窗口结束后只 upsert/delete 这些 id,不再 truncate 全表。
//
// 之前 truncate+insert 的写法在多用户场景必崩:10 用户 × 50 任务 = 每 3s 心跳
// 锁全表 + 重写 500 行。改成行级 upsert 后,心跳只更新当前 running 任务自己那一行。

let state: DatabaseShape | null = null

// 同时进行的写入用 in-flight + pending 的方式合并
let saveInFlight: Promise<void> | null = null
let savePending = false

// 行级差异集合:saveDatabase 只刷出这些 id。
// dirty + deleted 之间互斥:标 deleted 时从 dirty 移除,反之亦然。
const dirtyTaskIds = new Set<string>()
const deletedTaskIds = new Set<string>()
const dirtyConvIds = new Set<string>()
const deletedConvIds = new Set<string>()
const dirtyProxyIds = new Set<string>()
const deletedProxyIds = new Set<string>()

export function markTaskDirty(id: string): void {
  dirtyTaskIds.add(id)
  deletedTaskIds.delete(id)
}

export function markTaskDeleted(id: string): void {
  deletedTaskIds.add(id)
  dirtyTaskIds.delete(id)
}

export function markConversationDirty(id: string): void {
  dirtyConvIds.add(id)
  deletedConvIds.delete(id)
}

export function markConversationDeleted(id: string): void {
  deletedConvIds.add(id)
  dirtyConvIds.delete(id)
}

export function markProxyDirty(id: string): void {
  dirtyProxyIds.add(id)
  deletedProxyIds.delete(id)
}

export function markProxyDeleted(id: string): void {
  deletedProxyIds.add(id)
  dirtyProxyIds.delete(id)
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
    platform: typeof task.platform === 'string' && task.platform ? task.platform : 'auto',
    catalogLimit:
      typeof task.catalogLimit === 'number' && task.catalogLimit > 0
        ? Math.floor(task.catalogLimit)
        : null,
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

interface ConversationDbRow {
  id: unknown
  userId: unknown
  title: unknown
  mode: unknown
  platform: unknown
  catalogLimit: unknown
  urls: unknown
  taskIds: unknown
  createdAt: unknown
}

function normalizeConversationRecord(row: ConversationDbRow): ConversationRecord | null {
  if (typeof row.id !== 'string' || typeof row.userId !== 'string') return null
  if (typeof row.title !== 'string') return null
  if (row.mode !== 'single' && row.mode !== 'catalog') return null
  if (typeof row.platform !== 'string') return null

  const urls = Array.isArray(row.urls) ? row.urls.filter((u): u is string => typeof u === 'string') : []
  const taskIds = Array.isArray(row.taskIds)
    ? row.taskIds.filter((id): id is string => typeof id === 'string')
    : []

  const catalogLimit: CatalogLimit | null =
    row.catalogLimit === 'all' || (typeof row.catalogLimit === 'number' && row.catalogLimit > 0)
      ? (row.catalogLimit as CatalogLimit)
      : null

  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : typeof row.createdAt === 'string'
        ? row.createdAt
        : new Date().toISOString()

  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    mode: row.mode as CollectMode,
    platform: row.platform,
    catalogLimit,
    urls,
    taskIds,
    createdAt,
  }
}

interface ProxyDbRow {
  id: unknown
  userId: unknown
  scheme: unknown
  host: unknown
  port: unknown
  username: unknown
  password: unknown
  label: unknown
  countryCode: unknown
  status: unknown
  latencyMs: unknown
  lastCheckedAt: unknown
  consecutiveFailures: unknown
  createdAt: unknown
}

function normalizeProxyRecord(row: ProxyDbRow): ProxyRecord | null {
  if (typeof row.id !== 'string' || typeof row.userId !== 'string') return null
  if (typeof row.host !== 'string' || typeof row.port !== 'number') return null
  if (row.scheme !== 'http' && row.scheme !== 'https') return null

  const status: ProxyStatus =
    row.status === 'online' || row.status === 'offline' || row.status === 'unknown'
      ? row.status
      : 'unknown'

  const lastCheckedAt =
    row.lastCheckedAt instanceof Date
      ? row.lastCheckedAt.toISOString()
      : typeof row.lastCheckedAt === 'string'
        ? row.lastCheckedAt
        : null

  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : typeof row.createdAt === 'string'
        ? row.createdAt
        : new Date().toISOString()

  return {
    id: row.id,
    userId: row.userId,
    scheme: row.scheme as ProxyScheme,
    host: row.host,
    port: row.port,
    username: typeof row.username === 'string' ? row.username : null,
    password: typeof row.password === 'string' ? row.password : null,
    label: typeof row.label === 'string' ? row.label : null,
    countryCode: typeof row.countryCode === 'string' ? row.countryCode : null,
    status,
    latencyMs: typeof row.latencyMs === 'number' ? row.latencyMs : null,
    lastCheckedAt,
    consecutiveFailures:
      typeof row.consecutiveFailures === 'number' ? row.consecutiveFailures : 0,
    createdAt,
  }
}

async function fetchStateFromPg(): Promise<DatabaseShape | null> {
  const db = getDb()
  const now = Date.now()

  const [taskRows, conversationRows, proxyRows] = await Promise.all([
    db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)),
    db.select().from(conversationsTable).orderBy(desc(conversationsTable.createdAt)),
    db.select().from(proxiesTable).orderBy(desc(proxiesTable.createdAt)),
  ])

  if (taskRows.length === 0 && conversationRows.length === 0 && proxyRows.length === 0) {
    return null
  }

  const tasks = taskRows.map((row: { payload: Partial<TaskRuntimeRecord>; userId: string }) =>
    normalizeTaskRecord(row.payload, now, row.userId),
  )

  const conversations = conversationRows
    .map((row: ConversationDbRow) => normalizeConversationRecord(row))
    .filter((c: ConversationRecord | null): c is ConversationRecord => c !== null)

  const proxies = proxyRows
    .map((row: ProxyDbRow) => normalizeProxyRecord(row))
    .filter((p: ProxyRecord | null): p is ProxyRecord => p !== null)

  return { tasks, conversations, proxies }
}

function buildTaskInsertValues(task: TaskRuntimeRecord) {
  return {
    id: task.id,
    userId: task.userId,
    url: task.url,
    status: task.status,
    payload: task,
    startedAtMs: task.startedAtMs,
    updatedAtMs: task.updatedAtMs,
    createdAt: new Date(Date.parse(task.createdAt) || Date.now()),
  }
}

function buildConversationInsertValues(conv: ConversationRecord) {
  return {
    id: conv.id,
    userId: conv.userId,
    title: conv.title,
    mode: conv.mode,
    platform: conv.platform,
    catalogLimit: conv.catalogLimit,
    urls: conv.urls,
    taskIds: conv.taskIds,
    createdAt: new Date(Date.parse(conv.createdAt) || Date.now()),
  }
}

function buildProxyInsertValues(proxy: ProxyRecord) {
  return {
    id: proxy.id,
    userId: proxy.userId,
    scheme: proxy.scheme,
    host: proxy.host,
    port: proxy.port,
    username: proxy.username,
    password: proxy.password,
    label: proxy.label,
    countryCode: proxy.countryCode,
    status: proxy.status,
    latencyMs: proxy.latencyMs,
    lastCheckedAt: proxy.lastCheckedAt ? new Date(proxy.lastCheckedAt) : null,
    consecutiveFailures: proxy.consecutiveFailures,
    createdAt: new Date(Date.parse(proxy.createdAt) || Date.now()),
  }
}

async function performSave(): Promise<void> {
  if (!state) {
    return
  }

  // 把 dirty / deleted 集合 swap 到本地,这样在写入期间产生的新 dirty
  // 会进入下次 save(避免本次刷盘和后续 mutation 互相覆盖)。
  const localDirtyTasks = new Set(dirtyTaskIds)
  const localDeletedTasks = new Set(deletedTaskIds)
  const localDirtyConvs = new Set(dirtyConvIds)
  const localDeletedConvs = new Set(deletedConvIds)
  const localDirtyProxies = new Set(dirtyProxyIds)
  const localDeletedProxies = new Set(deletedProxyIds)
  dirtyTaskIds.clear()
  deletedTaskIds.clear()
  dirtyConvIds.clear()
  deletedConvIds.clear()
  dirtyProxyIds.clear()
  deletedProxyIds.clear()

  // 没有差异就直接 return,避免空事务
  if (
    localDirtyTasks.size === 0 &&
    localDeletedTasks.size === 0 &&
    localDirtyConvs.size === 0 &&
    localDeletedConvs.size === 0 &&
    localDirtyProxies.size === 0 &&
    localDeletedProxies.size === 0
  ) {
    return
  }

  // 取当前状态快照(copy),保证写库期间 worker 改 state 不会污染 upsert 的值
  const tasksToUpsert: TaskRuntimeRecord[] = []
  for (const id of localDirtyTasks) {
    const task = state.tasks.find((t) => t.id === id)
    if (task) tasksToUpsert.push({ ...task, resultItems: [...task.resultItems] })
  }
  const convsToUpsert: ConversationRecord[] = []
  for (const id of localDirtyConvs) {
    const conv = state.conversations.find((c) => c.id === id)
    if (conv) convsToUpsert.push({ ...conv })
  }
  const proxiesToUpsert: ProxyRecord[] = []
  for (const id of localDirtyProxies) {
    const proxy = state.proxies.find((p) => p.id === id)
    if (proxy) proxiesToUpsert.push({ ...proxy })
  }

  const db = getDb()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.transaction(async (tx: any) => {
      // 先做 delete(避免删除后又被同 id upsert 撤回 —— 互斥语义已经保证过,
      // 但 PG 事务里按"删 → 插"顺序写更直观)
      if (localDeletedTasks.size > 0) {
        await tx.delete(tasksTable).where(inArray(tasksTable.id, [...localDeletedTasks]))
      }
      if (localDeletedConvs.size > 0) {
        await tx
          .delete(conversationsTable)
          .where(inArray(conversationsTable.id, [...localDeletedConvs]))
      }
      if (localDeletedProxies.size > 0) {
        await tx.delete(proxiesTable).where(inArray(proxiesTable.id, [...localDeletedProxies]))
      }

      // upsert:走单条 onConflictDoUpdate,事务里 Pipelined,代价远低于 truncate
      for (const task of tasksToUpsert) {
        await tx
          .insert(tasksTable)
          .values(buildTaskInsertValues(task))
          .onConflictDoUpdate({
            target: tasksTable.id,
            set: {
              url: task.url,
              status: task.status,
              payload: task,
              startedAtMs: task.startedAtMs,
              updatedAtMs: task.updatedAtMs,
            },
          })
      }
      for (const conv of convsToUpsert) {
        await tx
          .insert(conversationsTable)
          .values(buildConversationInsertValues(conv))
          .onConflictDoUpdate({
            target: conversationsTable.id,
            set: {
              title: conv.title,
              mode: conv.mode,
              platform: conv.platform,
              catalogLimit: conv.catalogLimit,
              urls: conv.urls,
              taskIds: conv.taskIds,
            },
          })
      }
      for (const proxy of proxiesToUpsert) {
        await tx
          .insert(proxiesTable)
          .values(buildProxyInsertValues(proxy))
          .onConflictDoUpdate({
            target: proxiesTable.id,
            set: {
              scheme: proxy.scheme,
              host: proxy.host,
              port: proxy.port,
              username: proxy.username,
              password: proxy.password,
              label: proxy.label,
              countryCode: proxy.countryCode,
              status: proxy.status,
              latencyMs: proxy.latencyMs,
              lastCheckedAt: proxy.lastCheckedAt ? new Date(proxy.lastCheckedAt) : null,
              consecutiveFailures: proxy.consecutiveFailures,
            },
          })
      }
    })
  } catch (error) {
    // 写库失败:把 local 集合合回 dirty/deleted,下次 save 会重试。
    // 注意要尊重当前 dirty/deleted 已有的 id(可能在 in-flight 期间又被改过)
    for (const id of localDirtyTasks) if (!deletedTaskIds.has(id)) dirtyTaskIds.add(id)
    for (const id of localDeletedTasks) if (!dirtyTaskIds.has(id)) deletedTaskIds.add(id)
    for (const id of localDirtyConvs) if (!deletedConvIds.has(id)) dirtyConvIds.add(id)
    for (const id of localDeletedConvs) if (!dirtyConvIds.has(id)) deletedConvIds.add(id)
    for (const id of localDirtyProxies) if (!deletedProxyIds.has(id)) dirtyProxyIds.add(id)
    for (const id of localDeletedProxies) if (!dirtyProxyIds.has(id)) deletedProxyIds.add(id)
    throw error
  }
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

  state = { tasks: [], conversations: [], proxies: [] }
  return state
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
        // 让出 event loop,再触发一次合并的写入
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
  dirtyTaskIds.clear()
  deletedTaskIds.clear()
  dirtyConvIds.clear()
  deletedConvIds.clear()
  dirtyProxyIds.clear()
  deletedProxyIds.clear()
}
