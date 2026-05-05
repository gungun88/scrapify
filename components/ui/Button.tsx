import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'outline' | 'ghost'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  pill?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', pill = false, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-[14px]',
        size === 'md' && 'h-9 px-4 text-[15px]',
        pill ? 'rounded-pill' : 'rounded-sm',
        variant === 'primary' &&
          'bg-ink text-accent-fg border border-ink hover:bg-[#1f1f1f] active:bg-black',
        variant === 'outline' &&
          'border border-line-strong bg-surface text-ink hover:bg-surface-soft',
        variant === 'ghost' && 'border border-transparent text-ink-muted hover:bg-surface-soft hover:text-ink',
        className,
      )}
      {...props}
    />
  )
})
