'use client'

import { useQuery } from '@tanstack/react-query'
import type { AnalyticsSnapshot } from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

export function useAnalytics() {
  return useQuery<AnalyticsSnapshot>({
    queryKey: ['analytics'],
    queryFn: async () => {
      const response = await fetch('/api/analytics')

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return response.json()
    },
    staleTime: 60_000,
  })
}
