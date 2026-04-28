import { create } from 'zustand'

interface UIState {
  isNewTaskModalOpen: boolean
  openNewTaskModal: () => void
  closeNewTaskModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isNewTaskModalOpen: false,
  openNewTaskModal: () => set({ isNewTaskModalOpen: true }),
  closeNewTaskModal: () => set({ isNewTaskModalOpen: false }),
}))
