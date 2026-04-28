'use client'

import { useQuery } from '@tanstack/react-query'
import { usePolling } from '@/hooks/usePolling'
import type { MonitorItem } from '@/lib/types'

export function useMonitor() {
  const refetchInterval = usePolling(true, 5000)

  return useQuery<MonitorItem[]>({
    queryKey: ['monitor'],
    queryFn: async () => {
      const response = await fetch('/api/monitor')

      if (!response.ok) {
        throw new Error('Failed to fetch monitor items')
      }

      return response.json()
    },
    refetchInterval,
    staleTime: 2000,
  })
}
