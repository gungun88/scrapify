'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Clock3, Database, Globe, ListTodo, Radar, Rows3 } from 'lucide-react'
import { useMonitor } from '@/hooks/useMonitor'
import { useSchedule } from '@/hooks/useSchedule'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  href: string
  icon: typeof ListTodo
  pulse?: boolean
  badge?: string
}

type NavSection = {
  label: string
  items: NavItem[]
}

function buildNavSections(monitorBadge: string | null): NavSection[] {
  return [
    {
      label: '采集',
      items: [
        { label: '任务中心', href: '/dashboard/tasks', icon: ListTodo, pulse: true },
        { label: '调度计划', href: '/dashboard/schedule', icon: Clock3 },
        { label: '字段配置', href: '/dashboard/fields', icon: Rows3 },
      ],
    },
    {
      label: '数据',
      items: [
        { label: '数据看板', href: '/dashboard/analytics', icon: BarChart3 },
        { label: '价格监控', href: '/dashboard/monitor', icon: Radar, badge: monitorBadge ?? undefined },
        { label: '代理管理', href: '/dashboard/proxy', icon: Globe },
      ],
    },
  ]
}

export function Sidebar() {
  const pathname = usePathname()
  const monitorQuery = useMonitor()
  const scheduleQuery = useSchedule()
  const monitorItems = monitorQuery.data ?? []
  const scheduleJobs = scheduleQuery.data ?? []
  const monitorAlertCount = monitorItems.filter((item) => item.status !== 'stable').length
  const enabledScheduleCount = scheduleJobs.filter((job) => job.enabled).length
  const navSections = buildNavSections(monitorAlertCount > 0 ? String(monitorAlertCount) : null)

  return (
    <aside className="z-10 flex h-full w-sidebar shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-[9px] border-b border-border px-[14px] py-[14px]">
        <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-brand text-white">
          <Database size={15} />
        </div>
        <div className="text-[15px] font-semibold text-text1">Scrapify</div>
        <div className="ml-auto rounded-[5px] bg-brand-light px-[7px] py-[2px] text-[10px] font-semibold text-brand">
          Local
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-[10px]">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-2 pb-[5px] pt-[10px] text-[10px] font-semibold uppercase tracking-[0.06em] text-text3">
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'mb-[2px] flex items-center gap-[9px] rounded-sm px-[10px] py-2 text-[13px] font-medium text-text2 transition-colors hover:bg-surface2 hover:text-text1',
                    isActive && 'bg-brand-light text-brand',
                  )}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto rounded-full bg-brand px-[6px] py-[1px] text-[10px] font-semibold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                  {item.pulse ? <span className="ml-auto h-[7px] w-[7px] rounded-full bg-green animate-pulse" /> : null}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-2 pb-[14px] pt-[10px]">
        <div className="rounded-sm px-[10px] py-2 transition-colors hover:bg-surface2">
          <div className="flex items-center gap-[9px]">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
              运
            </div>
            <div>
              <div className="text-[13px] font-medium text-text1">本地运行态</div>
              <div className="text-[11px] text-text3">
                {monitorQuery.isError || scheduleQuery.isError
                  ? '等待接口恢复'
                  : `${enabledScheduleCount} 条计划启用 · ${monitorItems.length} 个监控站点`}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-text3">
            <div className="rounded border border-border bg-surface2 px-2 py-2">
              <div>监控告警</div>
              <div className="mt-1 text-[13px] font-semibold text-text1">{monitorAlertCount}</div>
            </div>
            <div className="rounded border border-border bg-surface2 px-2 py-2">
              <div>监控状态</div>
              <div className="mt-1 text-[13px] font-semibold text-text1">
                {monitorQuery.isLoading && monitorItems.length === 0 ? '加载中' : '已连接'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
