import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  variant?: 'default' | 'error'
}

export function ProgressBar({ value, variant = 'default' }: ProgressBarProps) {
  return (
    <div className="h-[5px] w-[60px] overflow-hidden rounded-[3px] bg-bg">
      <div
        className={cn(
          'h-full rounded-[3px] bg-brand transition-[width] duration-700 ease-out [width:var(--progress-width)]',
          variant === 'error' && 'bg-red',
        )}
        style={{ '--progress-width': `${Math.max(0, Math.min(100, value))}%` } as CSSProperties}
      />
    </div>
  )
}
