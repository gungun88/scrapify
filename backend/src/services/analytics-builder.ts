import type { AnalyticsSnapshot, ChartPoint, DatabaseShape, StatCardData } from '../types'
import { parseTrafficGb, roundTo } from './runtime-utils'

const CATEGORY_RULES = [
  { label: '服饰', keywords: ['fashion', 'apparel', 'clothing', 'dress', 'sock', 'mens', 'womens', 'women', 'men'], color: 'default' as const },
  { label: '鞋包', keywords: ['shoe', 'shoes', 'bag', 'bags', 'boot', 'boots', 'allbirds', 'cettire'], color: 'amber' as const },
  { label: '家居', keywords: ['home', 'decor', 'rug', 'rugs', 'ruggable', 'kitchen', 'bath', 'bedding'], color: 'green' as const },
  { label: '美妆', keywords: ['beauty', 'makeup', 'cosmetic', 'skincare', 'skin', 'hair', 'fragrance'], color: 'default' as const },
  { label: '运动', keywords: ['sport', 'sports', 'gym', 'fitness', 'active', 'athletic', 'workout', 'gymshark'], color: 'amber' as const },
]

function formatNumber(value: number) {
  return value.toLocaleString('en-US')
}

function formatPercent(value: number, fractionDigits = 1) {
  return `${value.toFixed(fractionDigits)}%`
}

function normalizeUrl(url: string) {
  const trimmed = url.trim()

  if (!trimmed) {
    return ''
  }

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}

function getDomain(url: string) {
  const normalized = normalizeUrl(url)
  const [domain] = normalized.split('/')
  return domain || normalized
}

function getCategoryLabel(url: string) {
  const normalized = normalizeUrl(url)

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.label
    }
  }

  return '其他'
}

function buildStats(db: DatabaseShape): StatCardData[] {
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const tasksInRange = db.tasks.filter((task) => {
    const createdAt = Date.parse(task.createdAt)
    return !Number.isNaN(createdAt) && createdAt >= sevenDaysAgo.getTime()
  })

  const collectedItems = tasksInRange.reduce((sum, task) => sum + task.itemCount, 0)
  const uniqueDomains = new Set([
    ...db.tasks.map((task) => getDomain(task.url)).filter(Boolean),
    ...db.monitorItems.map((item) => getDomain(item.url)).filter(Boolean),
  ])
  const averageProgress =
    db.tasks.length === 0 ? 0 : db.tasks.reduce((sum, task) => sum + Math.max(0, Math.min(100, task.progress)), 0) / db.tasks.length
  const taskAlerts = db.tasks.filter((task) => task.status === 'error').length
  const monitorAlerts = db.monitorItems.filter((item) => item.status === 'outofstock' || Math.abs(item.change) >= 5).length
  const proxyAlerts = db.proxyItems.filter((item) => item.status === 'offline' || item.consecutiveFailures >= 3).length
  const runningCount = db.tasks.filter((task) => task.status === 'running').length
  const enabledScheduleCount = db.scheduleJobs.filter((job) => job.enabled).length
  const totalTraffic = db.proxyItems.reduce((sum, item) => sum + parseTrafficGb(item.traffic), 0)
  const alertCount = taskAlerts + monitorAlerts + proxyAlerts

  return [
    {
      label: '7 天采集商品',
      value: formatNumber(collectedItems),
      change: `${runningCount} 个任务运行中 / ${enabledScheduleCount} 条计划已启用`,
      trend: collectedItems > 0 ? 'up' : 'neutral',
    },
    {
      label: '活跃站点覆盖',
      value: String(uniqueDomains.size),
      change: `${db.monitorItems.length} 个监控站点 / ${db.proxyItems.length} 个代理节点`,
      trend: uniqueDomains.size > 0 ? 'up' : 'neutral',
    },
    {
      label: '平均采集进度',
      value: formatPercent(averageProgress),
      change: `${db.tasks.filter((task) => task.status === 'done').length} 个任务已完成`,
      trend: averageProgress >= 60 ? 'up' : averageProgress <= 25 ? 'down' : 'neutral',
    },
    {
      label: '异常告警',
      value: `${alertCount} 条`,
      change: `任务 ${taskAlerts} / 监控 ${monitorAlerts} / 代理 ${proxyAlerts} · 流量 ${totalTraffic.toFixed(1)} GB`,
      trend: alertCount > 0 ? 'down' : 'neutral',
    },
  ]
}

function buildTrend(db: DatabaseShape): ChartPoint[] {
  const now = new Date()
  const points: ChartPoint[] = []

  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(now)
    day.setDate(now.getDate() - offset)
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
    const end = start + 24 * 60 * 60 * 1000

    const count = db.tasks.reduce((sum, task) => {
      const createdAt = Date.parse(task.createdAt)
      if (Number.isNaN(createdAt) || createdAt < start || createdAt >= end) {
        return sum
      }

      return sum + task.itemCount
    }, 0)

    points.push({
      date: `${day.getMonth() + 1}/${day.getDate()}`,
      count,
    })
  }

  return points
}

function buildChannels(db: DatabaseShape) {
  const urls = [
    ...db.tasks.map((task) => task.url),
    ...db.monitorItems.map((item) => item.url),
    ...db.scheduleJobs.map((job) => job.taskTemplate.url),
  ].filter(Boolean)

  if (urls.length === 0) {
    return [{ label: '其他', value: 0 }]
  }

  const counts = new Map<string, number>()
  for (const url of urls) {
    const label = getCategoryLabel(url)
    counts.set(label, (counts.get(label) || 0) + 1)
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      value: Math.round((count / urls.length) * 100),
      color: CATEGORY_RULES.find((rule) => rule.label === label)?.color,
    }))
}

function buildHighlights(db: DatabaseShape) {
  const runningCount = db.tasks.filter((task) => task.status === 'running').length
  const pendingCount = db.tasks.filter((task) => task.status === 'pending').length
  const domainTotals = db.tasks.reduce((map, task) => {
    const domain = getDomain(task.url)
    if (domain) {
      map.set(domain, (map.get(domain) || 0) + task.itemCount)
    }
    return map
  }, new Map<string, number>())
  const topDomainEntry = [...domainTotals.entries()].sort((left, right) => right[1] - left[1])[0]
  const alertCount =
    db.tasks.filter((task) => task.status === 'error').length +
    db.monitorItems.filter((item) => item.status === 'outofstock' || Math.abs(item.change) >= 5).length +
    db.proxyItems.filter((item) => item.status === 'offline' || item.consecutiveFailures >= 3).length
  const enabledFieldCount = db.fieldConfigs.filter((field) => field.enabled).length
  const fieldCoverage = db.fieldConfigs.length === 0 ? 0 : roundTo((enabledFieldCount / db.fieldConfigs.length) * 100, 1)

  return [
    {
      label: '当前并发',
      value: `${runningCount} tasks`,
      note: `${pendingCount} 个任务等待执行`,
    },
    {
      label: '最佳来源站',
      value: topDomainEntry?.[0] || '暂无数据',
      note: topDomainEntry ? `累计贡献 ${formatNumber(topDomainEntry[1])} 条商品记录` : '等待任务产生来源数据',
    },
    {
      label: '异常告警',
      value: `${alertCount} 条`,
      note: '包含任务失败、价格异常和代理离线等运行时信号',
    },
    {
      label: '字段完整度',
      value: formatPercent(fieldCoverage),
      note: `${enabledFieldCount}/${db.fieldConfigs.length} 个字段处于启用状态`,
    },
  ]
}

export function buildAnalyticsSnapshot(db: DatabaseShape): AnalyticsSnapshot {
  return {
    stats: buildStats(db),
    trend: buildTrend(db),
    channels: buildChannels(db),
    highlights: buildHighlights(db),
  }
}
