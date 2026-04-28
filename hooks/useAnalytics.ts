'use client'

import { useQuery } from '@tanstack/react-query'
import type { AnalyticsSnapshot } from '@/lib/types'

export function useAnalytics() {
  return useQuery<AnalyticsSnapshot>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const response = await fetch('/api/analytics')

      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }

      return response.json()
    },
    staleTime: 60_000,
  })
}
