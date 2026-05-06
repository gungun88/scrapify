import { randomUUID } from 'node:crypto'
import type {
  DatabaseShape,
  FieldConfig,
  TaskLogEntry,
  TaskRuntimeRecord,
} from '../types'

function createTaskLog(atMs: number, level: TaskLogEntry['level'], message: string): TaskLogEntry {
  return {
    id: `log-${randomUUID().slice(0, 8)}`,
    at: new Date(atMs).toISOString(),
    level,
    message,
  }
}

function seedTask(input: {
  id: string
  url: string
  status: TaskRuntimeRecord['status']
  progress: number
  itemCount: number
  elapsedMs: number
  targetCount: number
}): TaskRuntimeRecord {
  const now = Date.now()
  const startedAtMs = now - input.elapsedMs
  const createdAt = new Date(startedAtMs).toISOString()
  const startedAt = input.status === 'pending' ? null : createdAt
  const finishedAt = input.status === 'done' || input.status === 'error' ? new Date(now).toISOString() : null
  const logs: TaskLogEntry[] = [createTaskLog(startedAtMs, 'info', 'Task queued.')]

  if (startedAt) {
    logs.push(createTaskLog(startedAtMs, 'info', 'Worker claimed task.'))
  }

  if (input.status === 'done') {
    logs.push(createTaskLog(now, 'info', 'Task completed.'))
  }

  if (input.status === 'error') {
    logs.push(createTaskLog(now, 'error', 'Task failed during execution.'))
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
    failureDetails:
      input.status === 'error'
        ? [
            {
              at: new Date(now).toISOString(),
              code: 'seed-error',
              message: 'Task failed during execution.',
            },
          ]
        : [],
    runHistory:
      input.status === 'pending'
        ? []
        : [
            {
              id: `run-${input.id}`,
              source: 'seed-runtime',
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

export function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m${seconds.toString().padStart(2, '0')}s`
}

const fieldConfigs: FieldConfig[] = [
  { id: 'title', label: '商品标题', path: 'product.title', type: 'String', enabled: true },
  { id: 'sku', label: 'SKU / 变体', path: 'product.variants', type: 'Array', enabled: true },
  { id: 'price', label: '售价 / 原价', path: 'product.price', type: 'Number', enabled: true },
  { id: 'images', label: '主图 / 图片集', path: 'product.images', type: 'URL[]', enabled: true },
  { id: 'inventory', label: '库存数量', path: 'product.inventory', type: 'Number', enabled: false },
  { id: 'rating', label: '用户评分 / 评论数', path: 'product.rating', type: 'Float', enabled: false },
  { id: 'tags', label: '商品标签 / 分类', path: 'product.tags', type: 'String[]', enabled: false },
  { id: 'vendor', label: '品牌 / 供应商', path: 'product.vendor', type: 'String', enabled: true },
]

export function createSeedDatabase(): DatabaseShape {
  return {
    tasks: [
      seedTask({
        id: 'task-1',
        url: 'gymshark.com/collections/all',
        status: 'running',
        progress: 72,
        itemCount: 1243,
        elapsedMs: 252000,
        targetCount: 1720,
      }),
      seedTask({
        id: 'task-2',
        url: 'fashionnova.com/collections/dresses',
        status: 'done',
        progress: 100,
        itemCount: 3892,
        elapsedMs: 720000,
        targetCount: 3892,
      }),
      seedTask({
        id: 'task-3',
        url: 'allbirds.com/pages/all-products',
        status: 'pending',
        progress: 0,
        itemCount: 0,
        elapsedMs: 0,
        targetCount: 980,
      }),
      seedTask({
        id: 'task-4',
        url: 'bombas.com/collections/mens-socks',
        status: 'error',
        progress: 38,
        itemCount: 519,
        elapsedMs: 151000,
        targetCount: 1360,
      }),
      seedTask({
        id: 'task-5',
        url: 'ruggable.com/products',
        status: 'running',
        progress: 55,
        itemCount: 876,
        elapsedMs: 185000,
        targetCount: 1590,
      }),
      seedTask({
        id: 'task-6',
        url: 'everlane.com/collections/new-arrivals',
        status: 'done',
        progress: 100,
        itemCount: 2104,
        elapsedMs: 520000,
        targetCount: 2104,
      }),
      seedTask({
        id: 'task-7',
        url: 'cettire.com/collections/womens',
        status: 'running',
        progress: 30,
        itemCount: 441,
        elapsedMs: 112000,
        targetCount: 1460,
      }),
    ],
    fieldConfigs,
  }
}
