'use client'

import { useQuery } from '@tanstack/react-query'
import { usePolling } from '@/hooks/usePolling'
import type { ProxyItem } from '@/lib/types'

export function useProxy() {
  const refetchInterval = usePolling(true, 10_000)

  return useQuery<ProxyItem[]>({
    queryKey: ['proxy'],
    queryFn: async () => {
      const response = await fetch('/api/proxy')

      if (!response.ok) {
        throw new Error('Failed to fetch proxy list')
      }

      return response.json()
    },
    refetchInterval,
    staleTime: 5000,
  })
}
