'use client'

import { useQuery } from '@tanstack/react-query'
import { usePolling } from '@/hooks/usePolling'
import type { TaskDetail, TaskLogEntry, TaskStatus } from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

function shouldPoll(status?: TaskStatus) {
  return status === 'running' || status === 'pending'
}

export function useTaskDetail(taskId: string | null, initialStatus?: TaskStatus) {
  const refetchInterval = usePolling(Boolean(taskId) && shouldPoll(initialStatus), 3000)

  return useQuery<TaskDetail>({
    queryKey: ['task-detail', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}`)

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return response.json()
    },
    enabled: Boolean(taskId) && !taskId?.startsWith('temp-'),
    refetchInterval,
    staleTime: 1000,
  })
}

export function useTaskLogs(taskId: string | null, status?: TaskStatus) {
  const refetchInterval = usePolling(Boolean(taskId) && shouldPoll(status), 3000)

  return useQuery<TaskLogEntry[]>({
    queryKey: ['task-logs', taskId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/logs`)

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return response.json()
    },
    enabled: Boolean(taskId) && !taskId?.startsWith('temp-'),
    refetchInterval,
    staleTime: 1000,
  })
}
