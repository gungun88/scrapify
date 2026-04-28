import { create } from 'zustand'
import type { Task } from '@/lib/types'

interface TaskState {
  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  addTask: (task: Task) => void
  removeTask: (id: string) => void
  replaceTask: (id: string, task: Task) => void
  updateTask: (id: string, patch: Partial<Task>) => void
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  setTasks: (tasks) =>
    set((state) => ({
      tasks: [...state.tasks.filter((task) => task.id.startsWith('temp-')), ...tasks],
    })),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) })),
  replaceTask: (id, task) =>
    set((state) => ({
      tasks: state.tasks.map((currentTask) => (currentTask.id === id ? task : currentTask)),
    })),
  updateTask: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    })),
}))
