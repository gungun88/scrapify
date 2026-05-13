import type { CatalogLimit, CollectMode, PlatformGroup, PlatformOption } from '@/lib/types'

export const DEFAULT_PLATFORM_ID = 'auto'

/* ============================================================
 * 目录采集 —— 商品数上限
 * ============================================================ */
export const CATALOG_LIMIT_OPTIONS: Array<{ id: string; label: string; value: CatalogLimit }> = [
  { id: '50', label: '50 件', value: 50 },
  { id: '100', label: '100 件', value: 100 },
  { id: '200', label: '200 件', value: 200 },
  { id: '500', label: '500 件', value: 500 },
  { id: '1000', label: '1000 件', value: 1000 },
  { id: 'all', label: '全部', value: 'all' },
]

export const DEFAULT_CATALOG_LIMIT: CatalogLimit = 100

export function catalogLimitToId(value: CatalogLimit): string {
  return value === 'all' ? 'all' : String(value)
}

export function idToCatalogLimit(id: string): CatalogLimit {
  const match = CATALOG_LIMIT_OPTIONS.find((option) => option.id === id)
  if (match) return match.value
  const numeric = Number(id)
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric)
  return DEFAULT_CATALOG_LIMIT
}

export function formatCatalogLimit(value: CatalogLimit): string {
  return value === 'all' ? '全部' : `${value} 件`
}

/** 该值是否属于内置预设 */
export function isPresetCatalogLimit(value: CatalogLimit): boolean {
  return CATALOG_LIMIT_OPTIONS.some((option) => option.value === value)
}

/* ============================================================
 * 单品采集 —— 平台分组
 * ============================================================ */
export const SINGLE_PLATFORM_GROUPS: PlatformGroup[] = [
  {
    id: 'auto',
    label: '默认自动',
    desc: '优先使用自动:它会自动判断系统类型并采集',
    options: [{ id: 'auto', label: '自动' }],
  },
  {
    id: 'saas',
    label: 'SAAS 独立站',
    options: [
      { id: 'shopify', label: 'Shopify', icon: 'shopify' },
      { id: 'shopmatrix', label: '店匠', icon: 'shopmatrix' },
      { id: 'xshoppy', label: 'Xshoppy', icon: 'xshoppy' },
      { id: 'funpinpin', label: 'FunPinPin', icon: 'funpinpin' },
      { id: 'shopbase', label: 'ShopBase', icon: 'shopbase' },
      { id: 'shopline', label: 'Shopline', icon: 'shopline' },
      { id: 'shopyy', label: 'SHOPYY', icon: 'shopyy' },
      { id: 'shoplus', label: 'Shoplus', icon: 'shoplus' },
      { id: 'hotishop', label: 'Hotishop', icon: 'hotishop' },
      { id: 'oemsaas', label: 'OEMSAAS', icon: 'oemsaas' },
    ],
  },
  {
    id: 'ecommerce',
    label: '电商平台',
    options: [
      { id: '1688', label: '1688', icon: '1688' },
      { id: 'amazon', label: 'Amazon', icon: 'amazon' },
      { id: 'aliexpress', label: 'Aliexpress', icon: 'aliexpress' },
      { id: 'alibaba', label: 'alibaba', icon: 'alibaba' },
      { id: 'walmart', label: 'Walmart', icon: 'walmart' },
      { id: 'wayfair', label: 'wayfair', icon: 'wayfair' },
      { id: 'shopee', label: 'Shopee', icon: 'shopee' },
      { id: 'lazada', label: 'Lazada', icon: 'lazada' },
      { id: 'ebay', label: 'ebay', icon: 'ebay' },
      { id: 'costco', label: 'Costco', icon: 'costco' },
      { id: 'etsy', label: 'Etsy', icon: 'etsy' },
      { id: 'taobao', label: 'taobao', icon: 'taobao' },
      { id: 'temu', label: 'Temu', icon: 'temu' },
    ],
  },
  {
    id: 'opensource',
    label: '开源 / 自建站',
    options: [
      { id: 'wp', label: 'WP', icon: 'wp' },
      { id: 'zencart', label: 'ZenCart', icon: 'zencart' },
      { id: 'opencart', label: 'OpenCart', icon: 'opencart' },
    ],
  },
]

/* ============================================================
 * 目录采集 —— 平台分组
 * ============================================================ */
export const CATALOG_PLATFORM_GROUPS: PlatformGroup[] = [
  {
    id: 'auto',
    label: '默认自动',
    desc: '默认自动识别:它会自动判断系统类型并采集',
    options: [{ id: 'auto', label: '自动' }],
  },
  {
    id: 'saas',
    label: 'SAAS 独立站',
    options: [
      { id: 'shopify', label: 'Shopify', icon: 'shopify' },
      { id: 'shopmatrix', label: '店匠', icon: 'shopmatrix' },
      { id: 'xshoppy', label: 'Xshoppy', icon: 'xshoppy' },
      { id: 'funpinpin', label: 'FunPinPin', icon: 'funpinpin' },
      { id: 'shopbase', label: 'ShopBase', icon: 'shopbase' },
      { id: 'shopline', label: 'Shopline', icon: 'shopline' },
      { id: 'shopyy', label: 'SHOPYY', icon: 'shopyy' },
      { id: 'shoplus', label: 'Shoplus', icon: 'shoplus' },
      { id: 'hotishop', label: 'Hotishop', icon: 'hotishop' },
      { id: 'oemsaas', label: 'OEMSAAS', icon: 'oemsaas' },
    ],
  },
  {
    id: 'ecommerce',
    label: '电商平台',
    options: [
      { id: '1688', label: '1688', icon: '1688' },
      { id: 'amazon', label: 'Amazon', icon: 'amazon' },
      { id: 'aliexpress', label: 'Aliexpress', icon: 'aliexpress' },
      { id: 'alibaba', label: 'alibaba', icon: 'alibaba' },
      { id: 'walmart', label: 'Walmart', icon: 'walmart' },
      { id: 'wayfair', label: 'wayfair', icon: 'wayfair' },
      { id: 'shopee', label: 'Shopee', icon: 'shopee' },
      { id: 'lazada', label: 'Lazada', icon: 'lazada' },
      { id: 'ebay', label: 'ebay', icon: 'ebay' },
      { id: 'costco', label: 'Costco', icon: 'costco' },
      { id: 'etsy', label: 'Etsy', icon: 'etsy' },
      { id: 'taobao', label: 'taobao', icon: 'taobao' },
      { id: 'temu', label: 'Temu', icon: 'temu' },
    ],
  },
  {
    id: 'opensource',
    label: '开源 / 自建站',
    options: [
      { id: 'wp', label: 'WP', icon: 'wp' },
      { id: 'zencart', label: 'ZenCart', icon: 'zencart' },
      { id: 'opencart', label: 'OpenCart', icon: 'opencart' },
    ],
  },
]

/* ============================================================
 * 不可用平台列表
 * 这些站点都依赖反爬绕过 / 登录态 / 签名,纯 HTTP 采集不可行。
 * UI 显示为灰色不可选 + tooltip 提示原因。
 * 即便用户绕过 UI 强行 POST,后端 platform-registry 也会回退到 'auto'。
 * ============================================================ */
const UNSUPPORTED_PLATFORM_IDS = new Set([
  '1688',
  'amazon',
  'aliexpress',
  'alibaba',
  'walmart',
  'wayfair',
  'shopee',
  'lazada',
  'ebay',
  'costco',
  'etsy',
  'taobao',
  'temu',
])

const UNSUPPORTED_REASON = '该平台需要登录态 / 反爬绕过,当前采集器暂不支持'

function markUnsupported(option: PlatformOption): PlatformOption {
  if (!UNSUPPORTED_PLATFORM_IDS.has(option.id)) return option
  return { ...option, disabled: true, disabledReason: UNSUPPORTED_REASON }
}

function markGroupOptions(groups: PlatformGroup[]): PlatformGroup[] {
  return groups.map((g) => ({ ...g, options: g.options.map(markUnsupported) }))
}

const GROUPS_BY_MODE: Record<CollectMode, PlatformGroup[]> = {
  single: markGroupOptions(SINGLE_PLATFORM_GROUPS),
  catalog: markGroupOptions(CATALOG_PLATFORM_GROUPS),
}

export function getPlatformGroups(mode: CollectMode): PlatformGroup[] {
  return GROUPS_BY_MODE[mode]
}

/** 全局合并索引：用于历史记录里渲染 label / breadcrumb，无需关心当时的 mode */
const GLOBAL_INDEX = (() => {
  const map = new Map<string, { option: PlatformOption; group: PlatformGroup }>()
  // 单品优先（label 与目录里同 id 的预期一致）
  for (const list of [GROUPS_BY_MODE.single, GROUPS_BY_MODE.catalog]) {
    for (const g of list) {
      for (const o of g.options) {
        if (!map.has(o.id)) map.set(o.id, { option: o, group: g })
      }
    }
  }
  return map
})()

export function getPlatformLabel(id: string): string {
  return GLOBAL_INDEX.get(id)?.option.label ?? id
}

export function getPlatformBreadcrumb(id: string): string {
  const entry = GLOBAL_INDEX.get(id)
  if (!entry) return id
  if (entry.group.id === 'auto') return entry.option.label
  return `${entry.group.label} · ${entry.option.label}`
}

/** 该 platform 是否在 mode 下可用(disabled 视为不可用) */
export function isPlatformAvailableInMode(id: string, mode: CollectMode): boolean {
  for (const g of getPlatformGroups(mode)) {
    for (const o of g.options) {
      if (o.id === id) return !o.disabled
    }
  }
  return false
}

/** 切换 mode 时校正 platform：不可用就回退到 auto */
export function reconcilePlatform(id: string, mode: CollectMode): string {
  return isPlatformAvailableInMode(id, mode) ? id : DEFAULT_PLATFORM_ID
}
