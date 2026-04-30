export type TaskStatus = 'running' | 'done' | 'error' | 'pending'
export type TaskLogLevel = 'info' | 'warn' | 'error'
export type TaskResultValue = string | number | boolean | null | Array<string | number>
export type TaskResultRow = Record<string, TaskResultValue>

export interface Task {
  id: string
  url: string
  status: TaskStatus
  progress: number
  itemCount: number
  elapsed: string
  createdAt: string
}

export interface TaskLogEntry {
  id: string
  at: string
  level: TaskLogLevel
  message: string
}

export interface TaskFailureDetail {
  at: string
  code: string
  message: string
}

export interface TaskRunRecord {
  id: string
  source: string
  startedAt: string
  finishedAt: string | null
  status: TaskStatus
  itemCount: number
  pageCount: number
  errorMessage: string | null
}

export interface TaskResultSummary {
  source: string
  collectionUrl: string
  itemCount: number
  pageCount: number
  exportedAt: string | null
  preview: TaskResultRow[]
}

export interface TaskDetail extends Task {
  mode: NewTaskForm['mode']
  region: string
  fields: string[]
  concurrency: number
  delay: string
  targetCount: number
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  workerId: string | null
  lastHeartbeatAt: string | null
  result: TaskResultSummary | null
  failureDetails: TaskFailureDetail[]
  runHistory: TaskRunRecord[]
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
  taskTemplate: NewTaskForm
  lastRunAt: string | null
  nextRunAt: string | null
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
  lastCheckedAt: string | null
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
  lastCheckedAt: string | null
  lastHeartbeatAt: string | null
  consecutiveFailures: number
}
