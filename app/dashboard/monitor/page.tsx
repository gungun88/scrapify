'use client'

import { MonitorCard } from '@/components/monitor/MonitorCard'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { useMonitor } from '@/hooks/useMonitor'

/**
 * Monitor page for recent price changes and stock anomalies.
 */
export default function MonitorPage() {
  const { data = [] } = useMonitor()

  const increasedCount = data.filter((item) => item.status === 'up').length
  const decreasedCount = data.filter((item) => item.status === 'down').length
  const outOfStockCount = data.filter((item) => item.status === 'outofstock').length

  return (
    <>
      <Topbar
        title="价格监控"
        subtitle="跟踪站点价格波动与库存状态"
        actions={
          <div className="flex gap-2">
            <Button variant="outline">刷新监控</Button>
            <Button>添加站点</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="涨价商品" value={String(increasedCount)} change="触发红色趋势提醒" trend="up" />
          <StatCard label="降价商品" value={String(decreasedCount)} change="适合做竞品回采" trend="down" />
          <StatCard label="缺货商品" value={String(outOfStockCount)} change="建议排查库存同步" trend="neutral" />
        </section>

        <Panel
          title="重点监控站点"
          headerActions={<span className="text-[11px] font-medium text-text3">近 7 个价格点</span>}
        >
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((item) => (
              <MonitorCard key={item.id} item={item} />
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
