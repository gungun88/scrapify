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

export interface NewTaskForm {
  url: string
  mode: 'full' | 'incremental' | 'price-only'
  region: string
  fields: string[]
  concurrency: number
  delay: string
}

/* ==================== 极简前端类型 ==================== */

export type CollectMode = 'single' | 'catalog'

/** 平台单项 */
export interface PlatformOption {
  id: string
  label: string
  /** 选项色块（可选，仅展示） */
  tone?: string
  /** 品牌图标 slug（对应 simple-icons 或自定义注册表的 key） */
  icon?: string
  /** 品牌主色（#RRGGBB） */
  brandColor?: string
}

/** 平台分组 */
export interface PlatformGroup {
  id: string
  label: string
  /** 副说明，仅"默认自动"那一项有 */
  desc?: string
  options: PlatformOption[]
}

/** 目录模式商品数上限：具体数字或 'all'（全部） */
export type CatalogLimit = number | 'all'

export interface UserPreferences {
  /** 当前选中的平台 id（默认 'auto'） */
  platform: string
  /** 默认采集模式 */
  defaultMode: CollectMode
  /** 目录模式下默认的商品数上限（默认 100） */
  catalogLimit: CatalogLimit
}

/** 一次"对话"——前端聚合，对应后端的若干 Task */
export interface CollectConversation {
  id: string
  /** 标题，自动生成 */
  title: string
  mode: CollectMode
  /** 采集时选中的平台 id */
  platform: string
  /** 目录模式下的商品数上限（仅 mode='catalog' 有效） */
  catalogLimit?: CatalogLimit
  /** 用户提交时输入的多行 URL */
  urls: string[]
  /** 关联的后端 task ids */
  taskIds: string[]
  createdAt: string
}
