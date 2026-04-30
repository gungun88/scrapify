import type { FieldConfig, NewTaskForm, StatCardData, Task } from '@/lib/types'
import { createTaskId } from '@/lib/utils'

export const taskStats: StatCardData[] = [
  { label: '今日采集商品', value: '12,480', change: '↑ 8.3% vs 昨日', trend: 'up' },
  { label: '运行中任务', value: '7', change: '↑ 2 个新增', trend: 'up' },
  { label: '采集成功率', value: '96.2%', change: '↓ 1.1% 较昨日', trend: 'down' },
  { label: '代理消耗 / 今日', value: '3.8 GB', change: '剩余 46.2 GB', trend: 'neutral' },
]

export const fieldConfigs: FieldConfig[] = [
  { id: 'title', label: '商品标题', path: 'product.title', type: 'String', enabled: true },
  { id: 'sku', label: 'SKU / 变体', path: 'product.variants', type: 'Array', enabled: true },
  { id: 'price', label: '售价 / 原价', path: 'product.price', type: 'Number', enabled: true },
  { id: 'images', label: '主图 / 图片组', path: 'product.images', type: 'URL[]', enabled: true },
  { id: 'inventory', label: '库存数量', path: 'product.inventory', type: 'Number', enabled: false },
  { id: 'rating', label: '用户评分 / 评论数', path: 'product.rating', type: 'Float', enabled: false },
  { id: 'tags', label: '商品标签 / 分类', path: 'product.tags', type: 'String[]', enabled: false },
]

export const categoryDistribution = [
  { label: '服装', value: 84 },
  { label: '鞋包', value: 61 },
  { label: '美妆', value: 47 },
  { label: '家居', value: 38, color: 'green' as const },
  { label: '运动', value: 29, color: 'green' as const },
  { label: '电子', value: 12, color: 'amber' as const },
]

export const taskModalFields = [
  { id: 'title', label: '商品标题', defaultChecked: true },
  { id: 'price', label: '售价 / 原价', defaultChecked: true },
  { id: 'sku', label: 'SKU / 变体', defaultChecked: true },
  { id: 'images', label: '主图 / 图片集', defaultChecked: true },
  { id: 'inventory', label: '库存数量', defaultChecked: false },
  { id: 'rating', label: '用户评分', defaultChecked: false },
]

export const taskRecords: Task[] = [
  {
    id: 'task-1',
    url: 'gymshark.com/collections/all',
    status: 'running',
    progress: 72,
    itemCount: 1243,
    elapsed: '4m12s',
    createdAt: '2026-04-28T08:10:00.000Z',
  },
  {
    id: 'task-2',
    url: 'fashionnova.com/collections/dresses',
    status: 'done',
    progress: 100,
    itemCount: 3892,
    elapsed: '12m',
    createdAt: '2026-04-28T07:53:00.000Z',
  },
  {
    id: 'task-3',
    url: 'allbirds.com/pages/all-products',
    status: 'pending',
    progress: 0,
    itemCount: 0,
    elapsed: '—',
    createdAt: '2026-04-28T08:21:00.000Z',
  },
  {
    id: 'task-4',
    url: 'bombas.com/collections/mens-socks',
    status: 'error',
    progress: 38,
    itemCount: 519,
    elapsed: '2m31s',
    createdAt: '2026-04-28T08:01:00.000Z',
  },
  {
    id: 'task-5',
    url: 'ruggable.com/products',
    status: 'running',
    progress: 55,
    itemCount: 876,
    elapsed: '3m05s',
    createdAt: '2026-04-28T08:15:00.000Z',
  },
  {
    id: 'task-6',
    url: 'everlane.com/collections/new-arrivals',
    status: 'done',
    progress: 100,
    itemCount: 2104,
    elapsed: '8m40s',
    createdAt: '2026-04-28T07:48:00.000Z',
  },
  {
    id: 'task-7',
    url: 'cettire.com/collections/womens',
    status: 'running',
    progress: 30,
    itemCount: 441,
    elapsed: '1m52s',
    createdAt: '2026-04-28T08:19:00.000Z',
  },
]

export function createPendingTask(payload: Partial<NewTaskForm>): Task {
  return {
    id: createTaskId(),
    url: String(payload.url ?? '').trim() || 'untitled-task',
    status: 'pending',
    progress: 0,
    itemCount: 0,
    elapsed: '—',
    createdAt: new Date().toISOString(),
  }
}
