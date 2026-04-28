import { ReactNode } from 'react'

interface TopbarProps {
  title: string
  subtitle: string
  actions?: ReactNode
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="flex h-topbar shrink-0 items-center gap-[10px] border-b border-border bg-surface px-5">
      <div>
        <div className="text-[15px] font-semibold text-text1">{title}</div>
        <div className="mt-px text-xs text-text3">{subtitle}</div>
      </div>
      <div className="flex-1" />
      {actions}
    </header>
  )
}
