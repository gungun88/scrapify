'use client'

import { createContext, useContext } from 'react'

export const SidebarRefreshContext = createContext<() => void>(() => {})

export function useSidebarRefresh() {
  return useContext(SidebarRefreshContext)
}
