export type TaskStatus = 'running' | 'done' | 'error' | 'pending'
export type TaskResultValue = string | number | boolean | null | Array<string | number>
export type TaskResultRow = Record<string, TaskResultValue>

export interface Task {
  id: string
  url: string
  platform: string
  /** 目录采集时单任务可采集的最大件数;null 表示无限制(单品模式 / 'all') */
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
  /** 单品模式传 null;目录模式传具体数字或 'all'(后端会把 'all' 转成 null) */
  catalogLimit?: CatalogLimit | null
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
  /** 是否禁用：当前后端不具备采集能力（反爬/签名/登录态） */
  disabled?: boolean
  /** 禁用原因（hover tooltip 显示） */
  disabledReason?: string
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
  /** Phase 1 起会话按 userId 隔离；GET 列表时后端会带回，前端通常不直接消费 */
  userId?: string
  /** 标题，自动生成 */
  title: string
  mode: CollectMode
  /** 采集时选中的平台 id */
  platform: string
  /** 目录模式下的商品数上限（仅 mode='catalog' 有效）；后端始终回写 null 或值 */
  catalogLimit?: CatalogLimit | null
  /** 用户提交时输入的多行 URL */
  urls: string[]
  /** 关联的后端 task ids */
  taskIds: string[]
  createdAt: string
}

/** 新建会话 POST body（前端→后端→数据库） */
export interface NewConversationForm {
  title: string
  mode: CollectMode
  platform: string
  catalogLimit?: CatalogLimit | null
  urls: string[]
  taskIds: string[]
}
