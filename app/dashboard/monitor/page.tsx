'use client'

import type { MonitorItem } from '@/lib/types'
import { MonitorCard } from '@/components/monitor/MonitorCard'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { useMonitor, useRefreshMonitor } from '@/hooks/useMonitor'

function formatDateTime(value: string | null) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function pickLatestCheckedItem(items: MonitorItem[]) {
  return [...items]
    .filter((item) => item.lastCheckedAt)
    .sort((left, right) => Date.parse(right.lastCheckedAt || '') - Date.parse(left.lastCheckedAt || ''))[0]
}

function formatShare(count: number, total: number) {
  if (total === 0) {
    return '0%'
  }

  return `${Math.round((count / total) * 100)}%`
}

export default function MonitorPage() {
  const monitorQuery = useMonitor()
  const refreshMonitor = useRefreshMonitor()
  const data = monitorQuery.data ?? []

  const increasedCount = data.filter((item) => item.status === 'up').length
  const decreasedCount = data.filter((item) => item.status === 'down').length
  const outOfStockCount = data.filter((item) => item.status === 'outofstock').length
  const latestCheckedItem = pickLatestCheckedItem(data)

  return (
    <>
      <Topbar
        title="价格监控"
        subtitle="跟踪站点价格波动、缺货状态和最近检查时间。"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refreshMonitor.mutate()} disabled={refreshMonitor.isPending}>
              {refreshMonitor.isPending ? '刷新中...' : '刷新监控'}
            </Button>
            <Button disabled>添加站点</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {monitorQuery.isError ? (
          <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">{monitorQuery.error.message}</div>
        ) : null}

        {refreshMonitor.isError ? (
          <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">
            {refreshMonitor.error instanceof Error ? refreshMonitor.error.message : '刷新监控失败。'}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            label="涨价商品"
            value={String(increasedCount)}
            change={`占全部监控项 ${formatShare(increasedCount, data.length)}`}
            trend={increasedCount > 0 ? 'up' : 'neutral'}
          />
          <StatCard
            label="降价商品"
            value={String(decreasedCount)}
            change={`占全部监控项 ${formatShare(decreasedCount, data.length)}`}
            trend={decreasedCount > 0 ? 'down' : 'neutral'}
          />
          <StatCard
            label="最近检查"
            value={formatDateTime(latestCheckedItem?.lastCheckedAt ?? null)}
            change={
              latestCheckedItem
                ? `${latestCheckedItem.site} 已完成最近一轮检查`
                : outOfStockCount > 0
                  ? `${outOfStockCount} 个商品当前缺货`
                  : '等待后台轮询返回检查结果'
            }
            trend={latestCheckedItem ? 'up' : 'neutral'}
          />
        </section>

        <Panel
          title="重点监控站点"
          headerActions={
            <span className="text-[11px] font-medium text-text3">
              {`共 ${data.length} 个站点 · 最近检查 ${formatDateTime(latestCheckedItem?.lastCheckedAt ?? null)}`}
            </span>
          }
        >
          {monitorQuery.isLoading && data.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-text3">正在加载监控数据...</div>
          ) : data.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-text3">当前没有可展示的监控站点。</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              {data.map((item) => (
                <MonitorCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
