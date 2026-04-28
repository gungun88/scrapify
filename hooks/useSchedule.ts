'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScheduleJob } from '@/lib/types'

export function useSchedule() {
  return useQuery<ScheduleJob[]>({
    queryKey: ['schedule'],
    queryFn: async () => {
      const response = await fetch('/api/schedule')

      if (!response.ok) {
        throw new Error('Failed to fetch schedules')
      }

      return response.json()
    },
    staleTime: 15_000,
  })
}

export function useUpdateScheduleJob() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ScheduleJob> }) => {
      const response = await fetch(`/api/schedule/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })

      if (!response.ok) {
        throw new Error('Failed to update schedule')
      }

      return (await response.json()) as ScheduleJob
    },
    onSuccess: (job) => {
      queryClient.setQueryData<ScheduleJob[] | undefined>(['schedule'], (current) =>
        current?.map((item) => (item.id === job.id ? job : item)),
      )
    },
  })
}
