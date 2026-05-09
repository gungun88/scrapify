/**
 * 平台品牌图标注册表
 *
 * 三类来源，按优先级渲染：
 *  1) path：simple-icons 单色 SVG（最佳，可染色）
 *  2) imgSrc：本地 favicon 文件（public/brand-icons/，由 scripts/fetch-brand-icons.mjs 拉取）
 *  3) 都没有：上层用 lucide Package 占位
 */

import {
  siShopify,
  siAliexpress,
  siAlibabadotcom,
  siShopee,
  siEbay,
  siEtsy,
  siTaobao,
  siWordpress,
} from 'simple-icons'

export interface BrandIcon {
  /** SVG path d，viewBox 统一 0 0 24 24（来自 simple-icons） */
  path?: string
  /** 位图 favicon 路径（相对站点根，如 /brand-icons/shopline.png） */
  imgSrc?: string
  /** 品牌主色，形如 #FF6A00；imgSrc 模式下用于背景着色 */
  color: string
}

/** 统一成 #RRGGBB */
function hex(h: string): string {
  return h.startsWith('#') ? h : `#${h}`
}

export const BRAND_ICONS: Record<string, BrandIcon> = {
  // simple-icons 官方品牌
  shopify: { path: siShopify.path, color: hex(siShopify.hex) },
  aliexpress: { path: siAliexpress.path, color: hex(siAliexpress.hex) },
  alibaba: { path: siAlibabadotcom.path, color: hex(siAlibabadotcom.hex) },
  shopee: { path: siShopee.path, color: hex(siShopee.hex) },
  ebay: { path: siEbay.path, color: hex(siEbay.hex) },
  etsy: { path: siEtsy.path, color: hex(siEtsy.hex) },
  taobao: { path: siTaobao.path, color: hex(siTaobao.hex) },
  wp: { path: siWordpress.path, color: hex(siWordpress.hex) },

  // 自定义（simple-icons 无收录，使用简单字形占位 + 官方品牌色）
  // 1688 — 优先用真实 favicon
  '1688': {
    imgSrc: '/brand-icons/1688-fallback.ico',
    color: '#FF7300',
  },
  amazon: {
    path: 'M15.93 17.09c-1.78 1.31-4.36 2.01-6.58 2.01-3.12 0-5.93-1.15-8.05-3.07-.17-.15-.02-.36.18-.25 2.29 1.33 5.11 2.13 8.03 2.13 1.98 0 4.15-.41 6.16-1.26.3-.13.55.2.26.44zM16.73 16.16c-.23-.29-1.52-.14-2.1-.07-.17.02-.2-.13-.04-.24 1.03-.72 2.72-.52 2.92-.27.2.25-.05 1.94-1.01 2.75-.15.12-.29.05-.22-.11.22-.53.72-1.72.45-2.06zM14.37 3.53V2.4c0-.17.13-.29.29-.29h5.06c.17 0 .3.12.3.29v.96c0 .17-.14.39-.4.73l-2.62 3.74c.97-.02 2 .12 2.88.62.2.11.25.28.27.45v1.2c0 .17-.19.37-.38.27-1.55-.82-3.6-.91-5.31.01-.18.09-.37-.11-.37-.28V8.95c0-.19 0-.52.19-.8l3.04-4.36h-2.64c-.17 0-.31-.13-.31-.26zM5.87 14.6h-1.54c-.15-.01-.27-.12-.28-.26V2.43c0-.15.13-.27.29-.27h1.43c.15.01.27.13.28.27v1.58h.03c.38-1 1.08-1.47 2.03-1.47.96 0 1.57.47 2 1.47.37-1 1.22-1.47 2.13-1.47.65 0 1.36.27 1.8.87.49.67.39 1.64.39 2.49v5.01c0 .15-.13.27-.29.27h-1.54c-.16-.01-.28-.13-.28-.27V7.72c0-.34.03-1.18-.04-1.5-.11-.53-.46-.68-.9-.68-.37 0-.76.25-.92.65-.16.4-.14 1.07-.14 1.53v4.21c0 .15-.13.27-.29.27h-1.54c-.16-.01-.28-.13-.28-.27V7.72c0-.88.15-2.18-.94-2.18-1.11 0-1.06 1.26-1.06 2.18v4.21c0 .15-.13.27-.29.27z',
    color: '#FF9900',
  },
  walmart: {
    path: 'M12 0c-.7 0-1.2.5-1.2 1.2v4.6c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2V1.2C13.2.5 12.7 0 12 0zM5 2.9c-.6.4-.8 1.1-.4 1.7l2.3 4c.4.6 1.2.8 1.7.4.6-.4.8-1.1.4-1.7l-2.3-4C6.3 2.7 5.6 2.5 5 2.9zm14 0c-.6-.4-1.4-.2-1.7.4l-2.3 4c-.4.6-.2 1.4.4 1.7.6.4 1.4.2 1.7-.4l2.3-4c.4-.6.2-1.4-.4-1.7zM2.9 5c-.4.6-.2 1.4.4 1.7l4 2.3c.6.4 1.4.2 1.7-.4.4-.6.2-1.4-.4-1.7l-4-2.3C4 4.6 3.3 4.4 2.9 5zm18.2 0c-.4-.6-1.1-.8-1.7-.4l-4 2.3c-.6.4-.8 1.1-.4 1.7.4.6 1.1.8 1.7.4l4-2.3c.6-.3.8-1 .4-1.7zM12 9c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3zm-9.1 7c.4.6 1.1.8 1.7.4l4-2.3c.6-.4.8-1.1.4-1.7-.4-.6-1.1-.8-1.7-.4l-4 2.3c-.6.3-.8 1.1-.4 1.7zm18.2 0c.4-.6.2-1.4-.4-1.7l-4-2.3c-.6-.4-1.4-.2-1.7.4-.4.6-.2 1.4.4 1.7l4 2.3c.6.4 1.3.2 1.7-.4zM5 21.1c.6.4 1.4.2 1.7-.4l2.3-4c.4-.6.2-1.4-.4-1.7-.6-.4-1.4-.2-1.7.4l-2.3 4c-.4.5-.2 1.3.4 1.7zm14 0c.6-.4.8-1.1.4-1.7l-2.3-4c-.4-.6-1.1-.8-1.7-.4-.6.4-.8 1.1-.4 1.7l2.3 4c.3.6 1.1.8 1.7.4zM12 17c-.7 0-1.2.5-1.2 1.2v4.6c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2v-4.6c0-.7-.5-1.2-1.2-1.2z',
    color: '#0071CE',
  },
  lazada: {
    path: 'M12 1.5L3.5 6v6c0 5.1 3.6 9.8 8.5 10.5 4.9-.7 8.5-5.4 8.5-10.5V6L12 1.5zm5 6.5v4c0 3.7-2.5 7.1-5 7.9-2.5-.8-5-4.2-5-7.9V8l5-2.6L17 8z',
    color: '#0F146D',
  },
  costco: {
    imgSrc: '/brand-icons/costco.svg',
    color: '#E32127',
  },
  temu: {
    path: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    color: '#FB7701',
  },
  wayfair: {
    path: 'M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.3 6.5 3.6L12 11.6 5.5 7.9 12 4.3zM5 9.5l6 3.3v7.4l-6-3.3V9.5zm8 10.7v-7.4l6-3.3v7.4l-6 3.3z',
    color: '#7F187F',
  },

  // SAAS 独立站（来自抓取的 favicon）
  shopmatrix: { imgSrc: '/brand-icons/shopmatrix.png', color: '#1A1A1A' },
  xshoppy: { imgSrc: '/brand-icons/xshoppy.svg', color: '#FF7A45' },
  funpinpin: { imgSrc: '/brand-icons/funpinpin.png', color: '#FF6F61' },
  shopbase: { imgSrc: '/brand-icons/shopbase.png', color: '#1F8FFF' },
  shopline: { imgSrc: '/brand-icons/shopline.png', color: '#1F8FFF' },
  shopyy: { imgSrc: '/brand-icons/shopyy.ico', color: '#FF6A00' },
  shoplus: { imgSrc: '/brand-icons/shoplus.png', color: '#7C5CFF' },
  hotishop: { imgSrc: '/brand-icons/hotishop.ico', color: '#FF5722' },
  oemsaas: { imgSrc: '/brand-icons/oemsaas.png', color: '#2563EB' },

  // 开源 / 自建站
  zencart: { imgSrc: '/brand-icons/zencart.png', color: '#1B7A2D' },
  opencart: { imgSrc: '/brand-icons/opencart.ico', color: '#34A853' },
}

/** 获取品牌图标（不存在返回 null） */
export function getBrandIcon(id?: string): BrandIcon | null {
  if (!id) return null
  return BRAND_ICONS[id] ?? null
}
