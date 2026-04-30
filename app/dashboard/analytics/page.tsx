'use client'

import { TrendChart } from '@/components/analytics/TrendChart'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { MiniBarChart } from '@/components/ui/MiniBarChart'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { useAnalytics } from '@/hooks/useAnalytics'

export default function AnalyticsPage() {
  const { data, error, isError, isLoading } = useAnalytics()

  if (isLoading && !data) {
    return (
      <>
        <Topbar title="数据看板" subtitle="查看采集趋势、站点覆盖和导出表现。" />
        <div className="flex flex-1 items-center justify-center p-5 text-sm text-text3">正在加载数据看板...</div>
      </>
    )
  }

  if (isError && !data) {
    return (
      <>
        <Topbar title="数据看板" subtitle="查看采集趋势、站点覆盖和导出表现。" />
        <div className="flex flex-1 items-center justify-center p-5 text-sm text-red-text">{error.message}</div>
      </>
    )
  }

  if (!data) {
    return null
  }

  return (
    <>
      <Topbar
        title="数据看板"
        subtitle="查看采集趋势、站点覆盖和导出表现。"
        actions={
          <div className="flex gap-2">
            <Button variant="outline">最近 7 天</Button>
            <Button>导出周报</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {isError ? <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">{error.message}</div> : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.stats.map((item) => (
            <StatCard key={item.label} {...item} />
          ))}
        </section>

        <Panel title="采集量趋势" headerActions={<span className="text-[11px] font-medium text-text3">按天聚合 · 自动刷新</span>}>
          <TrendChart data={data.trend} />
        </Panel>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel title="站点分类覆盖">
            <MiniBarChart items={data.channels} />
          </Panel>

          <Panel title="运行概览">
            <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2">
              {data.highlights.map((item) => (
                <div key={item.label} className="rounded border border-border bg-surface2 p-3">
                  <div className="text-[11px] text-text3">{item.label}</div>
                  <div className="mt-2 text-lg font-semibold text-text1">{item.value}</div>
                  <div className="mt-1 text-xs text-text2">{item.note}</div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </div>
    </>
  )
}
