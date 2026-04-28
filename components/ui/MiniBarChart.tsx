import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

interface MiniBarItem {
  label: string
  value: number
  color?: 'default' | 'green' | 'amber'
}

interface MiniBarChartProps {
  items: MiniBarItem[]
}

export function MiniBarChart({ items }: MiniBarChartProps) {
  return (
    <div className="flex flex-col gap-[10px] px-4 py-[14px]">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-[10px] text-xs">
          <div className="w-14 text-text2">{item.label}</div>
          <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-bg">
            <div
              className={cn(
                'h-full rounded-full bg-brand [width:var(--bar-width)]',
                item.color === 'green' && 'bg-green',
                item.color === 'amber' && 'bg-amber',
              )}
              style={{ '--bar-width': `${item.value}%` } as CSSProperties}
            />
          </div>
          <div className="w-[36px] text-right text-xs font-semibold text-text1">{item.value}%</div>
        </div>
      ))}
    </div>
  )
}
