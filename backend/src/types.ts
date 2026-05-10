export type TaskStatus = 'running' | 'done' | 'error' | 'pending'
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

export interface NewTaskForm {
  url: string
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

export interface DatabaseShape {
  tasks: TaskRuntimeRecord[]
}
