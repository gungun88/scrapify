'use client'

import { useQueries } from '@tanstack/react-query'
import { usePolling } from '@/hooks/usePolling'
import type { Task } from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

export function useTasksByIds(ids: string[]) {
  const refetchInterval = usePolling(true, 3000)

  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ['task', id],
      queryFn: async (): Promise<Task> => {
        const res = await fetch(`/api/tasks/${id}`)
        if (!res.ok) {
          throw new Error(await readErrorMessage(res))
        }
        return res.json()
      },
      refetchInterval,
      staleTime: 1000,
    })),
  })
}
