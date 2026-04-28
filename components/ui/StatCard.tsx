import type { StatCardData } from '@/lib/types'
import { cn } from '@/lib/utils'

export function StatCard({ label, value, change, trend }: StatCardData) {
  return (
    <div className="rounded border border-border bg-surface px-4 py-[14px]">
      <div className="mb-[5px] text-[11px] text-text2">{label}</div>
      <div className="text-[22px] font-semibold leading-none text-text1">{value}</div>
      <div
        className={cn(
          'mt-1 text-[11px] text-green-text',
          trend === 'down' && 'text-red-text',
          trend === 'neutral' && 'text-text3',
        )}
      >
        {change}
      </div>
    </div>
  )
}
