'use client'

import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { ProxyTable } from '@/components/proxy/ProxyTable'
import { useProxy } from '@/hooks/useProxy'

/**
 * Proxy page for node health, latency, and traffic monitoring.
 */
export default function ProxyPage() {
  const { data = [] } = useProxy()
  const onlineCount = data.filter((item) => item.status === 'online').length
  const slowCount = data.filter((item) => item.status === 'slow').length
  const offlineCount = data.filter((item) => item.status === 'offline').length

  return (
    <>
      <Topbar
        title="代理管理"
        subtitle="查看代理池健康度与流量消耗"
        actions={
          <div className="flex gap-2">
            <Button variant="outline">导入代理</Button>
            <Button>新增节点</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="在线节点" value={String(onlineCount)} change="可用于自动分配" trend="up" />
          <StatCard label="高延迟节点" value={String(slowCount)} change="建议降权或复检" trend="down" />
          <StatCard label="离线节点" value={String(offlineCount)} change="需要人工介入" trend="neutral" />
        </section>

        <Panel title="代理 IP 列表" headerActions={<span className="text-[11px] font-medium text-text3">按健康度排序</span>}>
          <ProxyTable items={data} />
        </Panel>
      </div>
    </>
  )
}
