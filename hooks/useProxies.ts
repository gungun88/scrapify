'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NewProxyForm, ProxyRecord } from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

const QUERY_KEY = ['proxies'] as const

export interface ProxyTestResult {
  ok: boolean
  latencyMs: number | null
}

export function useProxies() {
  return useQuery<ProxyRecord[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await fetch('/api/proxies')
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      return response.json()
    },
    // 30s 轮询:后端 worker 每 60s 探活一次,30s 间隔够看到状态翻转
    refetchInterval: 30_000,
    staleTime: 5000,
  })
}

export function useCreateProxy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (form: NewProxyForm) => {
      const response = await fetch('/api/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      return (await response.json()) as ProxyRecord
    },
    onSuccess: (proxy) => {
      queryClient.setQueryData<ProxyRecord[]>(QUERY_KEY, (prev) =>
        prev ? [proxy, ...prev] : [proxy],
      )
    },
  })
}

export function useDeleteProxy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/proxies/${id}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 204) {
        throw new Error(await readErrorMessage(response))
      }
    },
    onSuccess: (_void, id) => {
      queryClient.setQueryData<ProxyRecord[]>(QUERY_KEY, (prev) =>
        prev ? prev.filter((p) => p.id !== id) : prev,
      )
    },
  })
}

export function useRefreshProxies() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/proxies/refresh', { method: 'POST' })
      if (!response.ok && response.status !== 204) {
        throw new Error(await readErrorMessage(response))
      }
    },
    onSuccess: () => {
      // 让 useProxies 立刻重拉一次
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export function useTestProxy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string): Promise<ProxyTestResult> => {
      const response = await fetch(`/api/proxies/${id}/test`, { method: 'POST' })
      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }
      return (await response.json()) as ProxyTestResult
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}
