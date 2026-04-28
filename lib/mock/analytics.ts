import type { AnalyticsSnapshot } from '@/lib/types'

export const analyticsSnapshot: AnalyticsSnapshot = {
  stats: [
    { label: '7 天采集商品', value: '84,290', change: '较上周 +12.4%', trend: 'up' },
    { label: '活跃站点覆盖', value: '126', change: '新增 9 个 Shopify 站点', trend: 'up' },
    { label: '平均采集时长', value: '6m18s', change: '较上周 -42s', trend: 'down' },
    { label: '导出成功率', value: '98.6%', change: '近 30 次导出稳定', trend: 'neutral' },
  ],
  trend: [
    { date: '4/22', count: 8200 },
    { date: '4/23', count: 9100 },
    { date: '4/24', count: 10300 },
    { date: '4/25', count: 9900 },
    { date: '4/26', count: 11800 },
    { date: '4/27', count: 13100 },
    { date: '4/28', count: 15890 },
  ],
  channels: [
    { label: '服饰', value: 84 },
    { label: '鞋包', value: 67 },
    { label: '家居', value: 52, color: 'green' },
    { label: '美妆', value: 41 },
    { label: '运动', value: 33, color: 'amber' },
  ],
  highlights: [
    { label: '峰值并发', value: '10 workers', note: '由 Gymshark 和 Cettire 两个任务触发' },
    { label: '最佳来源站', value: 'fashionnova.com', note: '近 7 天新增 SKU 8,420 个' },
    { label: '异常告警', value: '3 条', note: '均来自价格变动超 12% 的监控任务' },
    { label: '平均字段完整度', value: '94.8%', note: '图片与库存字段覆盖率最高' },
  ],
}
