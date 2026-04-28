import { cn } from '@/lib/utils'
import type { ProxyItem } from '@/lib/types'

interface ProxyTableProps {
  items: ProxyItem[]
}

function getProxyTone(status: ProxyItem['status']) {
  if (status === 'online') {
    return {
      label: '在线',
      dotClassName: 'bg-green',
      badgeClassName: 'bg-green-bg text-green-text',
    }
  }

  if (status === 'slow') {
    return {
      label: '延迟高',
      dotClassName: 'bg-amber',
      badgeClassName: 'bg-amber-bg text-amber-text',
    }
  }

  return {
    label: '离线',
    dotClassName: 'bg-red',
    badgeClassName: 'bg-red-bg text-red-text',
  }
}

export function ProxyTable({ items }: ProxyTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-surface2 text-[11px] uppercase tracking-[0.04em] text-text3">
          <tr>
            <th className="px-4 py-3 font-semibold">代理节点</th>
            <th className="px-4 py-3 font-semibold">地区</th>
            <th className="px-4 py-3 font-semibold">延迟</th>
            <th className="px-4 py-3 font-semibold">流量</th>
            <th className="px-4 py-3 font-semibold">状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const tone = getProxyTone(item.status)

            return (
              <tr key={item.id} className="border-t border-border text-[13px] text-text2 transition-colors hover:bg-surface2">
                <td className="px-4 py-3">
                  <div className="font-mono text-text1">
                    {item.ip}:{item.port}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-text1">{item.flag}</div>
                  <div className="text-xs text-text3">{item.country}</div>
                </td>
                <td className="px-4 py-3 text-text1">{item.latency ? `${item.latency} ms` : '—'}</td>
                <td className="px-4 py-3 text-text1">{item.traffic}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex items-center gap-2 rounded-full px-[9px] py-[4px] text-[11px] font-semibold', tone.badgeClassName)}>
                    <span className={cn('h-2 w-2 rounded-full', tone.dotClassName)} />
                    {tone.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
