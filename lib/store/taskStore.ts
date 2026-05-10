import { create } from 'zustand'
import type { Task } from '@/lib/types'

interface TaskState {
  tasks: Task[]
  addTask: (task: Task) => void
  removeTask: (id: string) => void
  replaceTask: (id: string, task: Task) => void
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
  replaceTask: (id, task) =>
    set((state) => ({
      tasks: state.tasks.map((currentTask) => (currentTask.id === id ? task : currentTask)),
    })),
}))
