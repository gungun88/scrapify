import type { StatCardData, Task } from '@/lib/types'

type MiniBarColor = 'default' | 'green' | 'amber'

interface CategoryDistributionItem {
  label: string
  value: number
  color?: MiniBarColor
}

interface TaskCenterMetrics {
  stats: StatCardData[]
  categoryDistribution: CategoryDistributionItem[]
}

const numberFormatter = new Intl.NumberFormat('zh-CN')
const categoryColors: MiniBarColor[] = ['default', 'green', 'amber', 'default', 'green', 'amber']

const categoryRules = [
  {
    label: '服饰',
    keywords: [
      'fashion',
      'apparel',
      'clothing',
      'dress',
      'dresses',
      'shoe',
      'shoes',
      'sock',
      'socks',
      'mens',
      'womens',
      'women',
      'men',
      'bag',
      'bags',
      'fashionnova',
      'everlane',
      'cettire',
      'bombas',
      'allbirds',
    ],
  },
  {
    label: '运动',
    keywords: ['sport', 'sports', 'gym', 'fitness', 'active', 'athletic', 'workout', 'gymshark'],
  },
  {
    label: '家居',
    keywords: ['home', 'furniture', 'decor', 'rug', 'rugs', 'ruggable', 'kitchen', 'bath', 'bedding'],
  },
  {
    label: '美妆',
    keywords: ['beauty', 'makeup', 'cosmetic', 'skincare', 'skin', 'hair', 'fragrance'],
  },
  {
    label: '电子',
    keywords: ['electronic', 'electronics', 'tech', 'phone', 'laptop', 'computer', 'camera', 'audio', 'gaming'],
  },
]

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function formatPercent(value: number) {
  const rounded = Math.round(Math.max(0, value) * 10) / 10

  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

function normalizeTaskUrl(url: string) {
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

function getTaskCategory(url: string) {
  const normalizedUrl = normalizeTaskUrl(url)

  for (const rule of categoryRules) {
    if (rule.keywords.some((keyword) => normalizedUrl.includes(keyword))) {
      return rule.label
    }
  }

  return '其他'
}

export function getTaskCenterMetrics(tasks: Task[]): TaskCenterMetrics {
  const totalTasks = tasks.length
  const totalItems = tasks.reduce((sum, task) => sum + Math.max(0, task.itemCount), 0)
  const runningCount = tasks.filter((task) => task.status === 'running').length
  const pendingCount = tasks.filter((task) => task.status === 'pending').length
  const doneCount = tasks.filter((task) => task.status === 'done').length
  const errorCount = tasks.filter((task) => task.status === 'error').length
  const completionRate = totalTasks === 0 ? 0 : (doneCount / totalTasks) * 100
  const averageProgress =
    totalTasks === 0
      ? 0
      : tasks.reduce((sum, task) => sum + Math.min(100, Math.max(0, task.progress)), 0) / totalTasks

  const stats: StatCardData[] = [
    {
      label: '累计采集商品',
      value: formatNumber(totalItems),
      change: totalTasks > 0 ? `${formatNumber(totalTasks)} 个任务累计` : '暂无任务数据',
      trend: totalItems > 0 ? 'up' : 'neutral',
    },
    {
      label: '运行中任务',
      value: String(runningCount),
      change: pendingCount > 0 ? `待执行 ${pendingCount} 个` : '暂无排队任务',
      trend: runningCount > 0 ? 'up' : 'neutral',
    },
    {
      label: '任务完成率',
      value: formatPercent(completionRate),
      change: totalTasks > 0 ? `已完成 ${doneCount} 个，异常 ${errorCount} 个` : '暂无任务数据',
      trend: errorCount > 0 ? 'down' : doneCount > 0 ? 'up' : 'neutral',
    },
    {
      label: '平均进度',
      value: formatPercent(averageProgress),
      change: totalTasks > 0 ? `待处理 ${pendingCount} 个任务` : '等待任务开始',
      trend: averageProgress >= 60 ? 'up' : 'neutral',
    },
  ]

  if (totalTasks === 0) {
    return {
      stats,
      categoryDistribution: [{ label: '暂无任务', value: 0, color: 'amber' }],
    }
  }

  const categoryCounts = new Map<string, number>()

  for (const task of tasks) {
    const category = getTaskCategory(task.url)
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
  }

  const categoryDistribution = [...categoryCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, count], index) => ({
      label,
      value: Math.round((count / totalTasks) * 100),
      color: categoryColors[index],
    }))

  return {
    stats,
    categoryDistribution,
  }
}
