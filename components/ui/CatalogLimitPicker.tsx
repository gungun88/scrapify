'use client'

import { Check, ChevronDown } from 'lucide-react'
import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import {
  CATALOG_LIMIT_OPTIONS,
  formatCatalogLimit,
  isPresetCatalogLimit,
} from '@/lib/mock/platforms'
import type { CatalogLimit } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CatalogLimitPickerProps {
  value: CatalogLimit
  onChange: (next: CatalogLimit) => void
  /** 'inline' 永久展开（个人中心） / 'compact' 折叠（Composer） */
  variant?: 'inline' | 'compact'
}

export function CatalogLimitPicker({ value, onChange, variant = 'compact' }: CatalogLimitPickerProps) {
  if (variant === 'inline') {
    return (
      <div className="rounded-md border border-line bg-surface">
        <CatalogLimitBody value={value} onChange={onChange} />
      </div>
    )
  }
  return <CompactCatalogLimitPicker value={value} onChange={onChange} />
}

function CompactCatalogLimitPicker({
  value,
  onChange,
}: {
  value: CatalogLimit
  onChange: (next: CatalogLimit) => void
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
    function keyHandler(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  function handlePick(next: CatalogLimit) {
    onChange(next)
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
        {formatCatalogLimit(value)}
        <ChevronDown size={12} strokeWidth={2.4} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[420px] max-w-[min(420px,calc(100vw-48px))] overflow-hidden rounded-md border border-line bg-surface shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
          <CatalogLimitBody value={value} onChange={handlePick} />
        </div>
      ) : null}
    </div>
  )
}

function CatalogLimitBody({
  value,
  onChange,
}: {
  value: CatalogLimit
  onChange: (next: CatalogLimit) => void
}) {
  return (
    <div className="space-y-2 py-2">
      <PresetRow value={value} onChange={onChange} />
      <CustomRow value={value} onChange={onChange} />
    </div>
  )
}

function PresetRow({
  value,
  onChange,
}: {
  value: CatalogLimit
  onChange: (next: CatalogLimit) => void
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-1">
      <span className="mt-1 w-[88px] shrink-0 text-[14px] font-medium text-ink-muted">预设</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATALOG_LIMIT_OPTIONS.map((option) => (
            <LimitChip
              key={option.id}
              label={option.label}
              active={value === option.value}
              onClick={() => onChange(option.value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CustomRow({
  value,
  onChange,
}: {
  value: CatalogLimit
  onChange: (next: CatalogLimit) => void
}) {
  const isCustom = value !== 'all' && typeof value === 'number' && !isPresetCatalogLimit(value)
  const [draft, setDraft] = useState<string>(isCustom ? String(value) : '')

  useEffect(() => {
    if (isCustom) setDraft(String(value))
  }, [isCustom, value])

  function commit() {
    const numeric = Number(draft.trim())
    if (!Number.isFinite(numeric) || numeric <= 0) return
    onChange(Math.floor(numeric))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }

  return (
    <div className="flex items-start gap-3 border-t border-line px-3 pb-1 pt-2">
      <span className="mt-1.5 w-[88px] shrink-0 text-[14px] font-medium text-ink-muted">自定义</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入数量，如 250"
            className={cn(
              'h-7 w-40 rounded-md border px-2 text-[14.5px] outline-none transition-colors',
              isCustom
                ? 'border-ink bg-surface text-ink'
                : 'border-line bg-surface text-ink placeholder:text-ink-subtle focus:border-line-strong',
            )}
          />
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim() || !Number.isFinite(Number(draft)) || Number(draft) <= 0}
            className={cn(
              'inline-flex h-7 items-center rounded-pill px-3 text-[14px] font-medium transition-colors',
              'bg-ink text-accent-fg hover:bg-[#1f1f1f] disabled:cursor-not-allowed disabled:bg-surface-soft disabled:text-ink-subtle',
            )}
          >
            确认
          </button>
          <span className="text-[13.5px] text-ink-subtle">件</span>
        </div>
      </div>
    </div>
  )
}

function LimitChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[14px] transition-colors',
        active
          ? 'border-ink bg-ink text-accent-fg'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
      role="radio"
      aria-checked={active}
    >
      <span
        className={cn(
          'flex h-3 w-3 items-center justify-center rounded-pill border',
          active ? 'border-accent-fg bg-accent-fg' : 'border-line-strong bg-surface',
        )}
      >
        {active ? <Check size={9} strokeWidth={3} className="text-ink" /> : null}
      </span>
      {label}
    </button>
  )
}
