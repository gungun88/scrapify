import type { FieldConfig } from '@/lib/types'

export const fieldConfigSeed: FieldConfig[] = [
  { id: 'title', label: '商品标题', path: 'product.title', type: 'String', enabled: true },
  { id: 'sku', label: 'SKU / 变体', path: 'product.variants', type: 'Array', enabled: true },
  { id: 'price', label: '售价 / 原价', path: 'product.price', type: 'Number', enabled: true },
  { id: 'images', label: '主图 / 图片组', path: 'product.images', type: 'URL[]', enabled: true },
  { id: 'inventory', label: '库存数量', path: 'product.inventory', type: 'Number', enabled: false },
  { id: 'rating', label: '用户评分 / 评论数', path: 'product.rating', type: 'Float', enabled: false },
  { id: 'tags', label: '商品标签 / 分类', path: 'product.tags', type: 'String[]', enabled: false },
  { id: 'vendor', label: '品牌 / 供应商', path: 'product.vendor', type: 'String', enabled: true },
]

let fieldConfigsRuntime = fieldConfigSeed.map((field) => ({ ...field }))

export function listFieldConfigs() {
  return fieldConfigsRuntime.map((field) => ({ ...field }))
}

export function updateFieldConfigs(nextFields: FieldConfig[]) {
  fieldConfigsRuntime = nextFields.map((field) => ({ ...field }))
  return listFieldConfigs()
}
