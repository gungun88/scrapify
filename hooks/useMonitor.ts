'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePolling } from '@/hooks/usePolling'
import type { MonitorItem } from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

export function useMonitor() {
  const refetchInterval = usePolling(true, 5000)

  return useQuery<MonitorItem[]>({
    queryKey: ['monitor'],
    queryFn: async () => {
      const response = await fetch('/api/monitor')

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return response.json()
    },
    refetchInterval,
    staleTime: 2000,
  })
}

export function useRefreshMonitor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/monitor', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return (await response.json()) as MonitorItem[]
    },
    onSuccess: (items) => {
      queryClient.setQueryData(['monitor'], items)
    },
  })
}
