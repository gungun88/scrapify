'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CatalogLimit,
  CollectConversation,
  CollectMode,
  NewConversationForm,
  Task,
} from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

const QUERY_KEY = ['conversations'] as const
const TASKS_QUERY_KEY = ['tasks'] as const

export function useConversations() {
  return useQuery<CollectConversation[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/conversations')
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      return response.json()
    },
    staleTime: 2000,
  })
}

export function useCreateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (form: NewConversationForm) => {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      return (await response.json()) as CollectConversation
    },
    onSuccess: (conv) => {
      queryClient.setQueryData<CollectConversation[]>(QUERY_KEY, (prev) =>
        prev ? [conv, ...prev] : [conv],
      )
    },
  })
}

export interface NewConversationWithTasksForm {
  title: string
  mode: CollectMode
  platform: string
  catalogLimit: CatalogLimit | null
  urls: string[]
}

export interface ConversationWithTasksResult {
  conversation: CollectConversation
  tasks: Task[]
}

// 原子化提交:一次 POST 同时创建会话 + 关联 task,
// 后端会先做 SSRF 校验,任何 URL 不通过整批 400,前端不会留下孤儿 task。
// 替代旧版"N 次 POST /api/tasks + 1 次 POST /api/conversations"的非原子流程。
export function useCreateConversationWithTasks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (form: NewConversationWithTasksForm) => {
      const response = await fetch('/api/conversations/with-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      return (await response.json()) as ConversationWithTasksResult
    },
    onSuccess: ({ conversation, tasks }) => {
      // 会话列表:前置新会话
      queryClient.setQueryData<CollectConversation[]>(QUERY_KEY, (prev) =>
        prev ? [conversation, ...prev] : [conversation],
      )
      // 任务列表:前置新任务(顺序与后端 unshift 一致)
      queryClient.setQueryData<Task[]>(TASKS_QUERY_KEY, (prev) =>
        prev ? [...tasks, ...prev] : tasks,
      )
    },
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 204) {
        throw new Error(await readErrorMessage(response))
      }
    },
    onSuccess: (_void, id) => {
      queryClient.setQueryData<CollectConversation[]>(QUERY_KEY, (prev) =>
        prev ? prev.filter((c) => c.id !== id) : prev,
      )
      // 关联的 task 也已经被后端级联清理,主动失效让前端下次拉到最新
      void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY })
    },
  })
}
