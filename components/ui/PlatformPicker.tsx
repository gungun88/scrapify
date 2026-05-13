'use client'

import { ChevronDown, Package } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getPlatformBreadcrumb, getPlatformGroups } from '@/lib/mock/platforms'
import { getBrandIcon } from '@/lib/mock/brandIcons'

/**
 * 判断品牌色是否"过暗"（在深色背景上几乎隐形）。
 * 用 Rec.709 感知亮度，阈值 80：
 *   #1A1A1A → 26（暗）  → true
 *   #0F146D → 25（暗）  → true
 *   #FF7A45 → 158（亮） → false
 */
function isDarkBrandColor(hex: string): boolean {
  const c = hex.replace('#', '')
  if (c.length !== 6) return false
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 80
}
import type { CollectMode, PlatformGroup, PlatformOption } from '@/lib/types'
import { cn } from '@/lib/utils'

interface PlatformPickerProps {
  /** 当前模式（决定显示哪一套分组） */
  mode: CollectMode
  value: string
  onChange: (id: string) => void
  /** 'inline' 永久展开（个人中心） / 'compact' 折叠（Composer） */
  variant?: 'inline' | 'compact'
}

export function PlatformPicker({ mode, value, onChange, variant = 'compact' }: PlatformPickerProps) {
  if (variant === 'inline') {
    return (
      <div className="rounded-md border border-line bg-surface">
        <PlatformGroupsBody mode={mode} value={value} onChange={onChange} />
      </div>
    )
  }
  return <CompactPlatformPicker mode={mode} value={value} onChange={onChange} />
}

function CompactPlatformPicker({
  mode,
  value,
  onChange,
}: {
  mode: CollectMode
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  // 当模式切换时自动收起
  useEffect(() => {
    setOpen(false)
  }, [mode])

  function handlePick(id: string) {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-[14.5px] font-medium transition-colors',
          'border-line bg-surface text-ink hover:border-line-strong',
        )}
        aria-expanded={open}
      >
        <span className="h-1.5 w-1.5 rounded-pill bg-ink" />
        {getPlatformBreadcrumb(value)}
        <ChevronDown size={12} strokeWidth={2.4} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[680px] max-w-[min(680px,calc(100vw-48px))] overflow-hidden rounded-md border border-line bg-surface shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <PlatformGroupsBody mode={mode} value={value} onChange={handlePick} />
        </div>
      ) : null}
    </div>
  )
}

function PlatformGroupsBody({
  mode,
  value,
  onChange,
}: {
  mode: CollectMode
  value: string
  onChange: (id: string) => void
}) {
  const groups = getPlatformGroups(mode)
  return (
    <ul className="max-h-[480px] overflow-y-auto py-1">
      {groups.map((g) => (
        <li key={g.id} className="px-3 py-2">
          <PlatformGroupRow group={g} value={value} onChange={onChange} />
        </li>
      ))}
    </ul>
  )
}

function PlatformGroupRow({
  group,
  value,
  onChange,
}: {
  group: PlatformGroup
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-1 w-[88px] shrink-0 text-[14px] font-medium text-ink-muted">
        {group.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {group.options.map((opt) => (
            <PlatformChip
              key={opt.id}
              option={opt}
              active={value === opt.id}
              onClick={() => onChange(opt.id)}
            />
          ))}
          {group.desc ? (
            <span className="ml-1 inline-flex items-center text-[13.5px] text-ink-subtle">
              {group.desc}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PlatformChip({
  option,
  active,
  onClick,
}: {
  option: PlatformOption
  active: boolean
  onClick: () => void
}) {
  const brand = getBrandIcon(option.icon)
  const hasBrand = Boolean(brand)
  const isDisabled = Boolean(option.disabled)

  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      title={isDisabled ? option.disabledReason : undefined}
      data-color-dark={!active && !isDisabled && hasBrand && isDarkBrandColor(brand!.color) ? 'true' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[14px] transition-colors',
        isDisabled
          ? 'cursor-not-allowed border-line bg-surface-soft text-ink-subtle opacity-50'
          : active
            ? 'border-ink bg-ink text-accent-fg'
            : hasBrand
              ? 'text-ink hover:brightness-95'
              : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
      style={
        !active && !isDisabled && hasBrand
          ? {
              backgroundColor: `${brand!.color}14`,
              borderColor: `${brand!.color}55`,
            }
          : undefined
      }
      role="radio"
      aria-checked={active}
      aria-disabled={isDisabled || undefined}
    >
      <PlatformIcon brand={brand} active={active} dimmed={isDisabled} />
      {option.label}
      {isDisabled ? <span className="text-[11px] text-ink-subtle">·暂不支持</span> : null}
    </button>
  )
}

function PlatformIcon({
  brand,
  active,
  dimmed = false,
}: {
  brand: ReturnType<typeof getBrandIcon>
  active: boolean
  dimmed?: boolean
}) {
  if (brand?.path) {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={cn('shrink-0', dimmed && 'opacity-60 grayscale')}
      >
        <path d={brand.path} fill={active ? 'currentColor' : brand.color} />
      </svg>
    )
  }
  if (brand?.imgSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.imgSrc}
        alt=""
        width={12}
        height={12}
        aria-hidden="true"
        className={cn('h-3 w-3 shrink-0 object-contain', dimmed && 'opacity-60 grayscale')}
      />
    )
  }
  return (
    <Package
      size={11}
      strokeWidth={2}
      aria-hidden="true"
      className={cn('shrink-0', active ? 'text-accent-fg' : 'text-ink-subtle')}
    />
  )
}
