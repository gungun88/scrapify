import { create } from 'zustand'

interface UIState {
  isNewTaskModalOpen: boolean
  selectedTaskId: string | null
  openNewTaskModal: () => void
  closeNewTaskModal: () => void
  openTaskDetail: (taskId: string) => void
  closeTaskDetail: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isNewTaskModalOpen: false,
  selectedTaskId: null,
  openNewTaskModal: () => set({ isNewTaskModalOpen: true }),
  closeNewTaskModal: () => set({ isNewTaskModalOpen: false }),
  openTaskDetail: (taskId) => set({ selectedTaskId: taskId }),
  closeTaskDetail: () => set({ selectedTaskId: null }),
}))
