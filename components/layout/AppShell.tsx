'use client'

import { ReactNode, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { SidebarRefreshContext } from '@/components/layout/SidebarRefreshContext'

interface AppShellProps {
  children: ReactNode
}

/**
 * 应用主框架：左侧 Sidebar + 右侧内容区。
 * 通过 Context 暴露 bumpSidebar()，让任何深层子组件提交后能刷新最近列表。
 *
 * 首页（"/"）作为 marketing-style hero，会接管整个视口，因此在那里隐藏 Sidebar；
 * 其它路由（/c/[id], /records, /me 等）保留侧栏。
 */
export function AppShell({ children }: AppShellProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])
  const pathname = usePathname()
  const isHome = pathname === '/'

  return (
    <SidebarRefreshContext.Provider value={bump}>
      <div className="flex h-screen overflow-hidden bg-bg">
        {isHome ? null : <Sidebar refreshKey={refreshKey} />}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </SidebarRefreshContext.Provider>
  )
}
