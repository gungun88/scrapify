'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePolling } from '@/hooks/usePolling'
import type { ProxyItem } from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

export function useProxy() {
  const refetchInterval = usePolling(true, 10_000)

  return useQuery<ProxyItem[]>({
    queryKey: ['proxy'],
    queryFn: async () => {
      const response = await fetch('/api/proxy')

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return response.json()
    },
    refetchInterval,
    staleTime: 5000,
  })
}

export function useRefreshProxy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/proxy', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return (await response.json()) as ProxyItem[]
    },
    onSuccess: (items) => {
      queryClient.setQueryData(['proxy'], items)
    },
  })
}
