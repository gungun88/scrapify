import { ReactNode } from 'react'

interface PanelProps {
  title: string
  headerActions?: ReactNode
  children: ReactNode
}

export function Panel({ title, headerActions, children }: PanelProps) {
  return (
    <section className="overflow-hidden rounded border border-border bg-surface">
      <div className="flex items-center gap-[10px] border-b border-border px-4 py-3">
        <div className="flex-1 text-[13px] font-semibold text-text1">{title}</div>
        {headerActions}
      </div>
      {children}
    </section>
  )
}
