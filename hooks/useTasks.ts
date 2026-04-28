'use client'

import { useQuery } from '@tanstack/react-query'
import { usePolling } from '@/hooks/usePolling'
import type { Task } from '@/lib/types'

export function useTasks() {
  const refetchInterval = usePolling(true, 3000)

  return useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await fetch('/api/tasks')

      if (!response.ok) {
        throw new Error('Failed to fetch tasks')
      }

      return response.json()
    },
    refetchInterval,
    staleTime: 1000,
  })
}
