import { create } from 'zustand'

interface UIState {
  isResultsOpen: boolean
  openResults: () => void
  closeResults: () => void
  toggleResults: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isResultsOpen: false,
  openResults: () => set({ isResultsOpen: true }),
  closeResults: () => set({ isResultsOpen: false }),
  toggleResults: () => set((state) => ({ isResultsOpen: !state.isResultsOpen })),
}))
