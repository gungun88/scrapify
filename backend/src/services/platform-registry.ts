// 平台 → collector 优先级映射。
// 现有 4 个 collector(shopify / woocommerce / sitemap / html)按这里给出的顺序逐个尝试,
// 第一个抓到 ≥1 件就 break。未知 platform 走 'auto' 顺序。
//
// 大型电商平台(amazon / temu / taobao 等 13 个)在前端 platforms.ts 已标 disabled,
// 这里**不**为它们配置专门顺序 —— 即便有人绕过 UI 提交,也回退到 auto。

export type CollectorKey = 'shopify' | 'woocommerce' | 'sitemap' | 'html'

const AUTO_ORDER: CollectorKey[] = ['shopify', 'woocommerce', 'sitemap', 'html']

const PLATFORM_COLLECTOR_ORDER: Record<string, CollectorKey[]> = {
  auto: AUTO_ORDER,

  // Shopify 纯种
  shopify: ['shopify', 'sitemap', 'html'],

  // Shopify-like SaaS:模板抄 Shopify,大多数公开店面会暴露 /products.json
  shopmatrix: ['shopify', 'sitemap', 'html'],
  xshoppy: ['shopify', 'sitemap', 'html'],
  funpinpin: ['shopify', 'sitemap', 'html'],
  shopbase: ['shopify', 'sitemap', 'html'],
  shopline: ['shopify', 'sitemap', 'html'],
  shopyy: ['shopify', 'sitemap', 'html'],
  shoplus: ['shopify', 'sitemap', 'html'],
  hotishop: ['shopify', 'sitemap', 'html'],
  oemsaas: ['shopify', 'sitemap', 'html'],

  // WordPress + WooCommerce
  wp: ['woocommerce', 'sitemap', 'html'],

  // 开源 PHP 自建系统:URL 多为 query string,
  // 只能靠 sitemap + 增强后的 HTML 选择器
  zencart: ['sitemap', 'html'],
  opencart: ['sitemap', 'html'],
}

export function getCollectorOrder(platform: string | undefined | null): CollectorKey[] {
  if (!platform) return AUTO_ORDER
  return PLATFORM_COLLECTOR_ORDER[platform] ?? AUTO_ORDER
}

// 给 executeTask 失败信息用,例如 "platform=shopline 试过 shopify+sitemap+html 都没抓到"
export function formatAttemptedCollectors(order: CollectorKey[]): string {
  return order.join(' → ')
}
