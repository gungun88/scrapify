export type TaskStatus = 'running' | 'done' | 'error' | 'pending'
export type TaskResultValue = string | number | boolean | null | Array<string | number>
export type TaskResultRow = Record<string, TaskResultValue>

export interface Task {
  id: string
  url: string
  platform: string
  catalogLimit: number | null
  status: TaskStatus
  progress: number
  itemCount: number
  elapsed: string
  createdAt: string
}

export interface NewTaskForm {
  url: string
  platform: string
  catalogLimit?: CatalogLimit | null
}

export interface TaskResultSummary {
  source: string
  collectionUrl: string
  itemCount: number
  pageCount: number
  exportedAt: string | null
  preview: TaskResultRow[]
}

export interface TaskRuntimeRecord extends Task {
  userId: string
  startedAtMs: number
  updatedAtMs: number
  result: TaskResultSummary | null
  resultItems: TaskResultRow[]
}

// 前端"一次提交"聚合若干 Task；写一次后不变。
export type CollectMode = 'single' | 'catalog'
export type CatalogLimit = number | 'all'

export interface ConversationRecord {
  id: string
  userId: string
  title: string
  mode: CollectMode
  platform: string
  catalogLimit: CatalogLimit | null
  urls: string[]
  taskIds: string[]
  createdAt: string
}

export interface NewConversationForm {
  title: string
  mode: CollectMode
  platform: string
  catalogLimit?: CatalogLimit | null
  urls: string[]
  taskIds: string[]
}

// 用户配置的 HTTP(S) 代理。后端在 docker 内网,PG 不对外,密码字段直接明文存。
// status 由 proxy-runtime worker 周期性 TCP 探活回写。
export type ProxyScheme = 'http' | 'https'
export type ProxyStatus = 'online' | 'offline' | 'unknown'

export interface ProxyRecord {
  id: string
  userId: string
  scheme: ProxyScheme
  host: string
  port: number
  username: string | null
  password: string | null
  label: string | null
  countryCode: string | null
  status: ProxyStatus
  latencyMs: number | null
  lastCheckedAt: string | null
  consecutiveFailures: number
  createdAt: string
}

export interface NewProxyForm {
  scheme: ProxyScheme
  host: string
  port: number
  username?: string | null
  password?: string | null
  label?: string | null
  countryCode?: string | null
}

export interface DatabaseShape {
  tasks: TaskRuntimeRecord[]
  conversations: ConversationRecord[]
  proxies: ProxyRecord[]
}
