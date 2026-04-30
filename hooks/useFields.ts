'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FieldConfig } from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

export function useFields() {
  return useQuery<FieldConfig[]>({
    queryKey: ['fields'],
    queryFn: async () => {
      const response = await fetch('/api/fields')

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return response.json()
    },
    staleTime: 30_000,
  })
}

export function useUpdateFields() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fields: FieldConfig[]) => {
      const response = await fetch('/api/fields', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return (await response.json()) as FieldConfig[]
    },
    onSuccess: (fields) => {
      queryClient.setQueryData(['fields'], fields)
    },
  })
}
