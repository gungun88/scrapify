'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTaskStore } from '@/lib/store/taskStore'
import type { NewTaskForm, Task } from '@/lib/types'
import { readErrorMessage } from '@/lib/utils'

function createOptimisticTask(url: string): Task {
  return {
    id: `temp-${Math.random().toString(36).slice(2, 10)}`,
    url,
    status: 'pending',
    progress: 0,
    itemCount: 0,
    elapsed: '0s',
    createdAt: new Date().toISOString(),
  }
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  const addTask = useTaskStore((state) => state.addTask)
  const removeTask = useTaskStore((state) => state.removeTask)
  const replaceTask = useTaskStore((state) => state.replaceTask)

  return useMutation({
    mutationFn: async (form: NewTaskForm) => {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        throw new Error(await readErrorMessage(response))
      }

      return (await response.json()) as Task
    },
    onMutate: async (form) => {
      const optimisticTask = createOptimisticTask(form.url.trim())
      addTask(optimisticTask)

      return { optimisticTask }
    },
    onError: (_error, _form, context) => {
      if (context?.optimisticTask) {
        removeTask(context.optimisticTask.id)
      }
    },
    onSuccess: (task, _form, context) => {
      if (context?.optimisticTask) {
        replaceTask(context.optimisticTask.id, task)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
