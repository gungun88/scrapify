import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  getDatabase,
  markConversationDeleted,
  markConversationDirty,
  markTaskDeleted,
  markTaskDirty,
  saveDatabase,
} from '../services/data-store'
import { abortActiveTask, createRuntimeTask, isTaskActive, toTask } from '../services/task-runtime'
import { assertPublicHostname, SsrfBlockedError } from '../services/url-guard'
import type {
  CatalogLimit,
  CollectMode,
  ConversationRecord,
  NewConversationForm,
  NewTaskForm,
  Task,
} from '../types'

const MAX_CONVERSATIONS_PER_USER = 200
const MAX_URLS_PER_CONVERSATION = 50
const MAX_URL_LENGTH = 2048
const MAX_TITLE_LENGTH = 200

function userIdOf(request: FastifyRequest): string {
  if (!request.user) {
    throw new Error('requireUser hook did not run before conversations route')
  }
  return request.user.id
}

function normalizeNewConversation(body: unknown): NewConversationForm | null {
  if (!body || typeof body !== 'object') return null
  const v = body as Record<string, unknown>

  // title 超长截断而不是拒绝 —— 用户的 title 是自动拼出来的,极少触发
  const rawTitle = typeof v.title === 'string' ? v.title.trim() : ''
  if (!rawTitle) return null
  const title = rawTitle.slice(0, MAX_TITLE_LENGTH)

  const mode: CollectMode | null =
    v.mode === 'single' || v.mode === 'catalog' ? v.mode : null
  if (!mode) return null

  const platform = typeof v.platform === 'string' && v.platform ? v.platform : null
  if (!platform) return null

  const urls = Array.isArray(v.urls)
    ? v.urls.filter((u): u is string => typeof u === 'string' && u.length > 0 && u.length <= MAX_URL_LENGTH)
    : []
  if (urls.length === 0 || urls.length > MAX_URLS_PER_CONVERSATION) return null

  const taskIds = Array.isArray(v.taskIds)
    ? v.taskIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 100)
    : []
  if (taskIds.length === 0 || taskIds.length > MAX_URLS_PER_CONVERSATION) return null

  let catalogLimit: CatalogLimit | null = null
  if (v.catalogLimit === 'all') {
    catalogLimit = 'all'
  } else if (typeof v.catalogLimit === 'number' && v.catalogLimit > 0) {
    catalogLimit = Math.floor(v.catalogLimit)
  }

  return { title, mode, platform, catalogLimit, urls, taskIds }
}

interface NewConversationWithTasksForm {
  title: string
  mode: CollectMode
  platform: string
  catalogLimit: CatalogLimit | null
  urls: string[]
}

function normalizeNewConversationWithTasks(body: unknown): NewConversationWithTasksForm | null {
  if (!body || typeof body !== 'object') return null
  const v = body as Record<string, unknown>

  const rawTitle = typeof v.title === 'string' ? v.title.trim() : ''
  if (!rawTitle) return null
  const title = rawTitle.slice(0, MAX_TITLE_LENGTH)

  const mode: CollectMode | null =
    v.mode === 'single' || v.mode === 'catalog' ? v.mode : null
  if (!mode) return null

  const platform = typeof v.platform === 'string' && v.platform ? v.platform : null
  if (!platform) return null

  const urls = Array.isArray(v.urls)
    ? v.urls.filter((u): u is string => typeof u === 'string' && u.length > 0 && u.length <= MAX_URL_LENGTH)
    : []
  if (urls.length === 0 || urls.length > MAX_URLS_PER_CONVERSATION) return null

  let catalogLimit: CatalogLimit | null = null
  if (v.catalogLimit === 'all') {
    catalogLimit = 'all'
  } else if (typeof v.catalogLimit === 'number' && v.catalogLimit > 0) {
    catalogLimit = Math.floor(v.catalogLimit)
  }

  return { title, mode, platform, catalogLimit, urls }
}

function parseAndValidateUrl(raw: string): URL | { error: string } {
  let parsed: URL
  try {
    const withScheme = raw.trim().startsWith('http') ? raw.trim() : `https://${raw.trim()}`
    parsed = new URL(withScheme)
  } catch {
    return { error: `Invalid URL: ${raw}` }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `Protocol not allowed: ${parsed.protocol}` }
  }
  return parsed
}

export async function registerConversationRoutes(app: FastifyInstance) {
  app.get('/api/conversations', async (request, reply) => {
    const userId = userIdOf(request)
    const db = await getDatabase()
    const list = db.conversations
      .filter((conv) => conv.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    return reply.send(list)
  })

  // 旧式两阶段提交:保留作为内部 / 迁移 / 管理面板入口,
  // 但限流卡紧(20/min)。前端 Composer 走 with-tasks。
  app.post(
    '/api/conversations',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const form = normalizeNewConversation(request.body)
    if (!form) {
      return reply.status(400).send({ message: 'Invalid conversation payload' })
    }

    const userId = userIdOf(request)
    const db = await getDatabase()

    const record: ConversationRecord = {
      id: `conv-${randomUUID().slice(0, 12)}`,
      userId,
      title: form.title,
      mode: form.mode,
      platform: form.platform,
      catalogLimit: form.catalogLimit ?? null,
      urls: form.urls,
      taskIds: form.taskIds,
      createdAt: new Date().toISOString(),
    }

    db.conversations.unshift(record)
    markConversationDirty(record.id)

    // 单用户上限:超过就丢掉最老的几条,避免无限制堆积。
    // 注意:本上限只裁剪 conversation 行,关联的 task 不动 —— 老 task 仍可在 /me 里看到。
    const userCount = db.conversations.filter((c) => c.userId === userId).length
    if (userCount > MAX_CONVERSATIONS_PER_USER) {
      const trimmed: ConversationRecord[] = []
      let kept = 0
      for (const conv of db.conversations) {
        if (conv.userId !== userId) {
          trimmed.push(conv)
          continue
        }
        if (kept < MAX_CONVERSATIONS_PER_USER) {
          trimmed.push(conv)
          kept += 1
        } else {
          // 被裁掉的 conversation:从 PG 删,从内存丢
          markConversationDeleted(conv.id)
        }
      }
      db.conversations = trimmed
    }

    await saveDatabase()
    return reply.status(201).send(record)
  })

  // 原子化提交:URL 校验 → 创建所有 task → 创建会话 → 一次刷盘。
  // 任何 URL 通不过 SSRF 校验,整批拒绝(0 个 task 进队列),彻底消除孤儿任务。
  // 前端 Composer 替换原来 N 次 POST /api/tasks + 1 次 POST /api/conversations 的写法。
  // 限流 20/min/user:这是用户最主要的写入入口,但每次会创建 1-50 个 task,
  // 配合 task worker 的 2 并发上限,20/min 已经远超合理使用。
  app.post(
    '/api/conversations/with-tasks',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const form = normalizeNewConversationWithTasks(request.body)
    if (!form) {
      return reply.status(400).send({ message: 'Invalid payload' })
    }

    // Step 1: 解析 + 协议白名单
    const parsed: URL[] = []
    for (const raw of form.urls) {
      const result = parseAndValidateUrl(raw)
      if (result instanceof URL) {
        parsed.push(result)
      } else {
        return reply.status(400).send({ message: result.error })
      }
    }

    // Step 2: SSRF 校验 —— 任何一个失败整批拒绝
    for (const url of parsed) {
      try {
        await assertPublicHostname(url.hostname)
      } catch (error) {
        if (error instanceof SsrfBlockedError) {
          return reply.status(400).send({ message: `URL not allowed: ${error.message}` })
        }
        throw error
      }
    }

    // Step 3: 全部通过 → 批量创建 task + 会话,一次 saveDatabase
    const userId = userIdOf(request)
    const db = await getDatabase()

    const tasks: Task[] = []
    const taskIds: string[] = []
    for (let i = 0; i < parsed.length; i += 1) {
      const taskForm: NewTaskForm = {
        url: parsed[i].toString(),
        platform: form.platform,
        catalogLimit: form.mode === 'catalog' ? form.catalogLimit : null,
      }
      const task = createRuntimeTask(taskForm, userId)
      db.tasks.unshift(task)
      markTaskDirty(task.id)
      taskIds.push(task.id)
      tasks.push(toTask(task))
    }

    const record: ConversationRecord = {
      id: `conv-${randomUUID().slice(0, 12)}`,
      userId,
      title: form.title,
      mode: form.mode,
      platform: form.platform,
      catalogLimit: form.catalogLimit,
      urls: parsed.map((u) => u.toString()),
      taskIds,
      createdAt: new Date().toISOString(),
    }
    db.conversations.unshift(record)
    markConversationDirty(record.id)

    // 单用户会话上限 trim(沿用 POST /api/conversations 的逻辑)
    const userCount = db.conversations.filter((c) => c.userId === userId).length
    if (userCount > MAX_CONVERSATIONS_PER_USER) {
      const trimmed: ConversationRecord[] = []
      let kept = 0
      for (const conv of db.conversations) {
        if (conv.userId !== userId) {
          trimmed.push(conv)
          continue
        }
        if (kept < MAX_CONVERSATIONS_PER_USER) {
          trimmed.push(conv)
          kept += 1
        } else {
          markConversationDeleted(conv.id)
        }
      }
      db.conversations = trimmed
    }

    await saveDatabase()
    return reply.status(201).send({ conversation: record, tasks })
  })

  app.delete<{ Params: { id: string } }>(
    '/api/conversations/:id',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const userId = userIdOf(request)
      const db = await getDatabase()
      const idx = db.conversations.findIndex(
        (conv) => conv.id === request.params.id && conv.userId === userId,
      )
      if (idx < 0) {
        return reply.status(404).send({ message: 'Conversation not found' })
      }

      // 级联清理:删会话同时把它关联的 task 也清掉,避免孤儿任务。
      // - worker 没在跑:直接 markTaskDeleted + 从 state.tasks 移除
      // - worker 正在跑:标 error 让它自然终止(worker.finally 会 markTaskDirty,
      //   但此时 status='error' 已经持久化,前端会看到失败任务)
      const conv = db.conversations[idx]
      const taskIdSet = new Set(conv.taskIds)
      const survivors: typeof db.tasks = []
      for (const task of db.tasks) {
        if (task.userId !== userId || !taskIdSet.has(task.id)) {
          survivors.push(task)
          continue
        }
        if (isTaskActive(task.id)) {
          // worker 持有它 —— 先标 error,worker.finally 会保留行(标记结果);
          // 用户重新刷新 /records 时看不到这条会话,但单独看 tasks 列表仍能看到失败记录。
          abortActiveTask(task, 'Conversation deleted by user')
          survivors.push(task)
        } else {
          markTaskDeleted(task.id)
        }
      }
      db.tasks = survivors

      markConversationDeleted(conv.id)
      db.conversations.splice(idx, 1)
      await saveDatabase()
      return reply.status(204).send()
    },
  )
}
