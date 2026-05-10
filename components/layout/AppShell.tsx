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
 * 接管整个视口的页面（首页 hero、records 浮窗布局）会自带左侧导航，
 * 因此在这些路由隐藏全局 Sidebar，避免双导航。
 */
const FULL_BLEED_ROUTES = new Set(['/', '/records', '/login'])

export function AppShell({ children }: AppShellProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])
  const pathname = usePathname()
  const fullBleed = FULL_BLEED_ROUTES.has(pathname)

  return (
    <SidebarRefreshContext.Provider value={bump}>
      <div className="flex h-screen overflow-hidden bg-bg">
        {fullBleed ? null : <Sidebar refreshKey={refreshKey} />}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </SidebarRefreshContext.Provider>
  )
}
