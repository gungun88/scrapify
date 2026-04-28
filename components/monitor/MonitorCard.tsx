import { ArrowDownRight, ArrowUpRight, Minus, PackageX } from 'lucide-react'
import { SparkLine } from '@/components/ui/SparkLine'
import { cn } from '@/lib/utils'
import type { MonitorItem } from '@/lib/types'

interface MonitorCardProps {
  item: MonitorItem
}

function getMonitorTone(item: MonitorItem) {
  if (item.status === 'up') {
    return {
      color: '#EF4444',
      badge: '涨价',
      icon: ArrowUpRight,
      textClassName: 'text-red-text',
      badgeClassName: 'bg-red-bg text-red-text',
    }
  }

  if (item.status === 'down') {
    return {
      color: '#10B981',
      badge: '降价',
      icon: ArrowDownRight,
      textClassName: 'text-green-text',
      badgeClassName: 'bg-green-bg text-green-text',
    }
  }

  if (item.status === 'outofstock') {
    return {
      color: '#A09DB8',
      badge: '缺货',
      icon: PackageX,
      textClassName: 'text-text3',
      badgeClassName: 'bg-surface2 text-text3',
    }
  }

  return {
    color: '#A09DB8',
    badge: '稳定',
    icon: Minus,
    textClassName: 'text-text3',
    badgeClassName: 'bg-surface2 text-text3',
  }
}

export function MonitorCard({ item }: MonitorCardProps) {
  const tone = getMonitorTone(item)
  const ToneIcon = tone.icon

  return (
    <article className="rounded border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text1">{item.site}</div>
          <div className="mt-1 truncate text-[11px] text-text3">{item.url}</div>
        </div>
        <span className={cn('rounded-full px-[8px] py-[3px] text-[10px] font-semibold', tone.badgeClassName)}>
          {tone.badge}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[24px] font-semibold leading-none text-text1">
            {item.currency}
            {item.price.toLocaleString('en-US')}
          </div>
          <div className={cn('mt-2 flex items-center gap-1 text-xs font-medium', tone.textClassName)}>
            <ToneIcon size={14} />
            {item.status === 'stable' || item.status === 'outofstock' ? tone.badge : `${Math.abs(item.change)}%`}
          </div>
        </div>
        <div className="w-[110px]">
          <SparkLine data={item.history} color={tone.color} />
        </div>
      </div>
    </article>
  )
}
