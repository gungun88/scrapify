import { Check } from 'lucide-react'
import type { FieldConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CheckItemProps {
  field: FieldConfig
}

export function CheckItem({ field }: CheckItemProps) {
  return (
    <div className="flex items-center gap-[10px] border-b border-border px-4 py-[9px] text-xs last:border-b-0">
      <div
        className={cn(
          'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px]',
          field.enabled ? 'border-brand bg-brand text-white' : 'border-border2 bg-surface2 text-transparent',
        )}
      >
        <Check size={9} strokeWidth={2.4} />
      </div>
      <div className={cn('flex-1 text-text1', !field.enabled && 'text-text3')}>{field.label}</div>
      <div className="rounded-[4px] border border-border bg-surface2 px-[7px] py-[2px] font-mono text-[10px] font-medium text-text3">
        {field.type}
      </div>
    </div>
  )
}
