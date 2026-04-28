import type { AnalyticsSnapshot, DatabaseShape, FieldConfig, MonitorItem, ProxyItem, ScheduleJob, TaskRuntimeRecord } from '../types'

function seedTask(input: {
  id: string
  url: string
  status: TaskRuntimeRecord['status']
  progress: number
  itemCount: number
  elapsedMs: number
  targetCount: number
}): TaskRuntimeRecord {
  const now = Date.now()
  const startedAtMs = now - input.elapsedMs

  return {
    id: input.id,
    url: input.url,
    status: input.status,
    progress: input.progress,
    itemCount: input.itemCount,
    elapsed: input.status === 'pending' ? '—' : formatElapsed(input.elapsedMs),
    createdAt: new Date(startedAtMs).toISOString(),
    mode: 'full',
    region: 'auto',
    fields: ['title', 'price', 'sku', 'images'],
    concurrency: 3,
    delay: '1-3s',
    targetCount: input.targetCount,
    startedAtMs,
    updatedAtMs: now,
  }
}

export function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds}s`
  }

  return `${minutes}m${seconds.toString().padStart(2, '0')}s`
}

const fieldConfigs: FieldConfig[] = [
  { id: 'title', label: '商品标题', path: 'product.title', type: 'String', enabled: true },
  { id: 'sku', label: 'SKU / 变体', path: 'product.variants', type: 'Array', enabled: true },
  { id: 'price', label: '售价 / 原价', path: 'product.price', type: 'Number', enabled: true },
  { id: 'images', label: '主图 / 图片组', path: 'product.images', type: 'URL[]', enabled: true },
  { id: 'inventory', label: '库存数量', path: 'product.inventory', type: 'Number', enabled: false },
  { id: 'rating', label: '用户评分 / 评论数', path: 'product.rating', type: 'Float', enabled: false },
  { id: 'tags', label: '商品标签 / 分类', path: 'product.tags', type: 'String[]', enabled: false },
  { id: 'vendor', label: '品牌 / 供应商', path: 'product.vendor', type: 'String', enabled: true },
]

const scheduleJobs: ScheduleJob[] = [
  {
    id: 'schedule-1',
    name: '每日价格巡检',
    cron: '0 */4 * * *',
    cronLabel: '每 4 小时',
    lastRun: '今天 12:00',
    nextRun: '今天 16:00',
    enabled: true,
  },
  {
    id: 'schedule-2',
    name: '新品站点全量采集',
    cron: '30 2 * * *',
    cronLabel: '每天 02:30',
    lastRun: '今天 02:30',
    nextRun: '明天 02:30',
    enabled: true,
  },
  {
    id: 'schedule-3',
    name: '库存波动复查',
    cron: '0 */6 * * *',
    cronLabel: '每 6 小时',
    lastRun: '今天 09:00',
    nextRun: '今天 15:00',
    enabled: false,
  },
  {
    id: 'schedule-4',
    name: '高价值品牌补采',
    cron: '15 8,20 * * *',
    cronLabel: '每天 08:15 / 20:15',
    lastRun: '昨天 20:15',
    nextRun: '今天 20:15',
    enabled: true,
  },
]

const monitorItems: MonitorItem[] = [
  {
    id: 'monitor-1',
    site: 'Gymshark',
    url: 'gymshark.com/products/adapt-seamless-leggings',
    price: 58,
    currency: '$',
    change: 6.4,
    status: 'up',
    history: [49, 49, 52, 52, 54, 55, 58],
  },
  {
    id: 'monitor-2',
    site: 'Allbirds',
    url: 'allbirds.com/products/tree-runner-go',
    price: 94,
    currency: '$',
    change: -4.1,
    status: 'down',
    history: [99, 99, 98, 97, 97, 96, 94],
  },
  {
    id: 'monitor-3',
    site: 'Bombas',
    url: 'bombas.com/products/mens-merino-calf-sock-4-pack',
    price: 64,
    currency: '$',
    change: 0,
    status: 'stable',
    history: [64, 64, 64, 64, 64, 64, 64],
  },
  {
    id: 'monitor-4',
    site: 'Ruggable',
    url: 'ruggable.com/products/kamran-rug',
    price: 219,
    currency: '$',
    change: -8.7,
    status: 'down',
    history: [249, 239, 239, 229, 229, 219, 219],
  },
  {
    id: 'monitor-5',
    site: 'Everlane',
    url: 'everlane.com/products/womens-organic-cotton-box-cut-tee',
    price: 26,
    currency: '$',
    change: 3.9,
    status: 'up',
    history: [24, 24, 24, 25, 25, 26, 26],
  },
  {
    id: 'monitor-6',
    site: 'Cettire',
    url: 'cettire.com/products/saint-laurent-logo-bag',
    price: 0,
    currency: '$',
    change: 0,
    status: 'outofstock',
    history: [1995, 1995, 1995, 1995, 0, 0, 0],
  },
]

const proxyItems: ProxyItem[] = [
  { id: 'proxy-1', ip: '23.91.214.16', port: 8000, country: 'United States', flag: 'US', latency: 182, traffic: '2.4 GB', status: 'online' },
  { id: 'proxy-2', ip: '51.79.144.80', port: 3128, country: 'Canada', flag: 'CA', latency: 236, traffic: '1.2 GB', status: 'online' },
  { id: 'proxy-3', ip: '92.204.163.55', port: 8080, country: 'Germany', flag: 'DE', latency: 421, traffic: '0.8 GB', status: 'slow' },
  { id: 'proxy-4', ip: '139.162.78.44', port: 9001, country: 'Japan', flag: 'JP', latency: 512, traffic: '0.5 GB', status: 'slow' },
  { id: 'proxy-5', ip: '185.198.59.16', port: 8080, country: 'United Kingdom', flag: 'GB', latency: 167, traffic: '3.1 GB', status: 'online' },
  { id: 'proxy-6', ip: '103.163.220.11', port: 1080, country: 'Singapore', flag: 'SG', latency: 0, traffic: '0 GB', status: 'offline' },
  { id: 'proxy-7', ip: '45.76.148.62', port: 8118, country: 'Australia', flag: 'AU', latency: 284, traffic: '0.9 GB', status: 'online' },
  { id: 'proxy-8', ip: '146.190.88.92', port: 8000, country: 'Netherlands', flag: 'NL', latency: 0, traffic: '0.1 GB', status: 'offline' },
]

const analyticsSnapshot: AnalyticsSnapshot = {
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

export function createSeedDatabase(): DatabaseShape {
  return {
    tasks: [
      seedTask({
        id: 'task-1',
        url: 'gymshark.com/collections/all',
        status: 'running',
        progress: 72,
        itemCount: 1243,
        elapsedMs: 252000,
        targetCount: 1720,
      }),
      seedTask({
        id: 'task-2',
        url: 'fashionnova.com/collections/dresses',
        status: 'done',
        progress: 100,
        itemCount: 3892,
        elapsedMs: 720000,
        targetCount: 3892,
      }),
      seedTask({
        id: 'task-3',
        url: 'allbirds.com/pages/all-products',
        status: 'pending',
        progress: 0,
        itemCount: 0,
        elapsedMs: 0,
        targetCount: 980,
      }),
      seedTask({
        id: 'task-4',
        url: 'bombas.com/collections/mens-socks',
        status: 'error',
        progress: 38,
        itemCount: 519,
        elapsedMs: 151000,
        targetCount: 1360,
      }),
      seedTask({
        id: 'task-5',
        url: 'ruggable.com/products',
        status: 'running',
        progress: 55,
        itemCount: 876,
        elapsedMs: 185000,
        targetCount: 1590,
      }),
      seedTask({
        id: 'task-6',
        url: 'everlane.com/collections/new-arrivals',
        status: 'done',
        progress: 100,
        itemCount: 2104,
        elapsedMs: 520000,
        targetCount: 2104,
      }),
      seedTask({
        id: 'task-7',
        url: 'cettire.com/collections/womens',
        status: 'running',
        progress: 30,
        itemCount: 441,
        elapsedMs: 112000,
        targetCount: 1460,
      }),
    ],
    fieldConfigs,
    scheduleJobs,
    monitorItems,
    proxyItems,
    analyticsSnapshot,
  }
}
