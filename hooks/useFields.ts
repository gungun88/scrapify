'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FieldConfig } from '@/lib/types'

export function useFields() {
  return useQuery<FieldConfig[]>({
    queryKey: ['fields'],
    queryFn: async () => {
      const response = await fetch('/api/fields')

      if (!response.ok) {
        throw new Error('Failed to fetch field configs')
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
        throw new Error('Failed to update field configs')
      }

      return (await response.json()) as FieldConfig[]
    },
    onSuccess: (fields) => {
      queryClient.setQueryData(['fields'], fields)
    },
  })
}
