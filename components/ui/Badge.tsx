import { cn, getTaskStatusLabel } from '@/lib/utils'
import type { TaskStatus } from '@/lib/types'

interface BadgeProps {
  variant: TaskStatus
}

export function Badge({ variant }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex rounded-[5px] px-[9px] py-[3px] text-[10px] font-semibold',
        variant === 'running' && 'bg-green-bg text-green-text',
        variant === 'done' && 'bg-brand-light text-brand',
        variant === 'error' && 'bg-red-bg text-red-text',
        variant === 'pending' && 'bg-amber-bg text-amber-text',
      )}
    >
      {getTaskStatusLabel(variant)}
    </span>
  )
}
