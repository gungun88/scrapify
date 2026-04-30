'use client'

import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { ProxyTable } from '@/components/proxy/ProxyTable'
import { useProxy, useRefreshProxy } from '@/hooks/useProxy'

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

function getLatestTimestamp(values: Array<string | null>) {
  return values.reduce<string | null>((latest, value) => {
    if (!value) {
      return latest
    }

    if (!latest) {
      return value
    }

    return new Date(value).getTime() > new Date(latest).getTime() ? value : latest
  }, null)
}

export default function ProxyPage() {
  const proxyQuery = useProxy()
  const refreshProxy = useRefreshProxy()
  const data = proxyQuery.data ?? []
  const onlineCount = data.filter((item) => item.status === 'online').length
  const slowCount = data.filter((item) => item.status === 'slow').length
  const offlineCount = data.filter((item) => item.status === 'offline').length
  const failingNodeCount = data.filter((item) => item.consecutiveFailures > 0).length
  const maxConsecutiveFailures = data.reduce((max, item) => Math.max(max, item.consecutiveFailures), 0)
  const latestCheckedAt = getLatestTimestamp(data.map((item) => item.lastCheckedAt))
  const latestHeartbeatAt = getLatestTimestamp(data.map((item) => item.lastHeartbeatAt))

  return (
    <>
      <Topbar
        title="代理管理"
        subtitle="查看代理池健康度、最近心跳和流量概况。"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refreshProxy.mutate()} disabled={refreshProxy.isPending}>
              {refreshProxy.isPending ? '刷新中...' : '刷新探活'}
            </Button>
            <Button disabled>新增节点</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {proxyQuery.isError ? (
          <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">{proxyQuery.error.message}</div>
        ) : null}

        {refreshProxy.isError ? (
          <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">
            {refreshProxy.error instanceof Error ? refreshProxy.error.message : '刷新代理探活失败。'}
          </div>
        ) : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            label="在线节点"
            value={String(onlineCount)}
            change={`最近心跳 ${formatDateTime(latestHeartbeatAt)}`}
            trend="up"
          />
          <StatCard
            label="高延迟节点"
            value={String(slowCount)}
            change={`最近检查 ${formatDateTime(latestCheckedAt)}`}
            trend={slowCount > 0 ? 'down' : 'neutral'}
          />
          <StatCard
            label="离线节点"
            value={String(offlineCount)}
            change={
              failingNodeCount === 0
                ? '当前没有连续失败节点'
                : `${failingNodeCount} 个节点存在失败，最高 ${maxConsecutiveFailures} 次`
            }
            trend={offlineCount > 0 ? 'down' : 'neutral'}
          />
        </section>

        <Panel
          title="代理 IP 列表"
          headerActions={
            <span className="text-[11px] font-medium text-text3">
              {`共 ${data.length} 个节点 · 最近检查 ${formatDateTime(latestCheckedAt)}`}
            </span>
          }
        >
          {proxyQuery.isLoading && data.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-text3">正在加载代理节点...</div>
          ) : (
            <ProxyTable items={data} />
          )}
        </Panel>
      </div>
    </>
  )
}
