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

export interface DatabaseShape {
  tasks: TaskRuntimeRecord[]
  conversations: ConversationRecord[]
}
