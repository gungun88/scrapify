import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline'
}

export function Button({ className, variant = 'primary', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-[5px] whitespace-nowrap rounded-sm border px-[13px] py-[6px] text-xs font-medium transition-colors',
        variant === 'primary' && 'border-brand bg-brand text-white hover:bg-brand-mid',
        variant === 'outline' && 'border-border2 bg-surface text-text2 hover:bg-surface2 hover:text-text1',
        className,
      )}
      {...props}
    />
  )
}
