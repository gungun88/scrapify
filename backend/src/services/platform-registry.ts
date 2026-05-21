// 平台 → collector 优先级映射。
// 现有 collector(shopify / woocommerce / sitemap / html / etsy)按这里给出的顺序逐个尝试,
// 第一个抓到 ≥1 件就 break。未知 platform 走 'auto' 顺序。
//
// 大型电商平台(amazon / temu / taobao 等)在前端 platforms.ts 还标 disabled,
// 这里**不**为它们配置专门顺序 —— 即便有人绕过 UI 提交,也回退到 auto。
// Etsy 是首个解锁的平台(2026-05),POC 阶段仅支持单品 listing URL。

export type CollectorKey = 'shopify' | 'woocommerce' | 'sitemap' | 'html' | 'etsy' | 'aliexpress'

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

  // Etsy listing 页:商品字段在 JSON-LD(<script type="application/ld+json">),
  // 走专用 etsy collector 直取 JSON-LD;若被 CF 拦或解析空,fallback 到 html collector 再试一次通用 JSON-LD。
  // AUTO_ORDER 不含 etsy,避免给所有非 Etsy 站点多跑一次。
  etsy: ['etsy', 'html'],

  // AliExpress 商品详情页:vi.aliexpress.com 强制重定向 + CSR,商品数据在 MTOP API 响应里。
  // 走专用 aliexpress collector(基于 Playwright 浏览器拦截 MTOP 响应);不配 fallback
  // —— 浏览器型采集已经是最重路径,html collector 拿不到 CSR 数据,fallback 无意义。
  // 必须配代理(无代理时 collector 内部直接返回空,task 标 error)。
  aliexpress: ['aliexpress'],
}

export function getCollectorOrder(platform: string | undefined | null): CollectorKey[] {
  if (!platform) return AUTO_ORDER
  return PLATFORM_COLLECTOR_ORDER[platform] ?? AUTO_ORDER
}

// 给 executeTask 失败信息用,例如 "platform=shopline 试过 shopify+sitemap+html 都没抓到"
export function formatAttemptedCollectors(order: CollectorKey[]): string {
  return order.join(' → ')
}
