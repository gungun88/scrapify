export type TaskStatus = 'running' | 'done' | 'error' | 'pending'

export interface Task {
  id: string
  url: string
  status: TaskStatus
  progress: number
  itemCount: number
  elapsed: string
  createdAt: string
}

export type FieldType = 'String' | 'Number' | 'Float' | 'Array' | 'URL[]' | 'String[]' | 'HTML'

export interface FieldConfig {
  id: string
  label: string
  path: string
  type: FieldType
  enabled: boolean
}

export interface StatCardData {
  label: string
  value: string
  change: string
  trend: 'up' | 'down' | 'neutral'
}

export interface NewTaskForm {
  url: string
  mode: 'full' | 'incremental' | 'price-only'
  region: string
  fields: string[]
  concurrency: number
  delay: string
}

export interface ChartPoint {
  date: string
  count: number
}

export interface AnalyticsHighlight {
  label: string
  value: string
  note: string
}

export interface AnalyticsSnapshot {
  stats: StatCardData[]
  trend: ChartPoint[]
  channels: Array<{
    label: string
    value: number
    color?: 'default' | 'green' | 'amber'
  }>
  highlights: AnalyticsHighlight[]
}

export interface ScheduleJob {
  id: string
  name: string
  cron: string
  cronLabel: string
  lastRun: string
  nextRun: string
  enabled: boolean
}

export interface MonitorItem {
  id: string
  site: string
  url: string
  price: number
  currency: string
  change: number
  status: 'up' | 'down' | 'stable' | 'outofstock'
  history: number[]
}

export interface ProxyItem {
  id: string
  ip: string
  port: number
  country: string
  flag: string
  latency: number
  traffic: string
  status: 'online' | 'slow' | 'offline'
}
