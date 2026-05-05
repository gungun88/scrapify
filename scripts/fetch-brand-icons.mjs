// 批量下载 SaaS/开源建站平台的 favicon 到 public/brand-icons/
// 用法：node scripts/fetch-brand-icons.mjs
// 双轨抓取：先 Google s2/favicons，未命中再直连 https://<domain>/favicon.ico

import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'brand-icons')

// domain 可填字符串，也可填字符串数组（依次尝试）
const TARGETS = [
  // SAAS 独立站
  { id: 'shopmatrix', domain: ['shoplazza.cn', 'shoplazza.com'] },
  { id: 'xshoppy', domain: ['xshoppy.com'] },
  { id: 'funpinpin', domain: ['funpinpin.cn', 'funpinpin.com'] },
  { id: 'shopbase', domain: ['shopbase.net.cn', 'shopbase.com'] },
  { id: 'shopline', domain: ['shopline.com'] },
  { id: 'shopyy', domain: ['shopyy.com'] },
  { id: 'shoplus', domain: ['jz.shoplus.net', 'shoplus.net'] },
  { id: 'hotishop', domain: ['helpcenter.hotishop.com', 'hotishop.com'] },
  { id: 'oemsaas', domain: ['oemsaas.net'] },
  // 开源 / 自建站
  { id: 'zencart', domain: ['zen-cart.com', 'zencart.com'] },
  { id: 'opencart', domain: ['opencart.com'] },
  // 兜底
  { id: 'costco-fallback', domain: ['costco.com'] },
  { id: '1688-fallback', domain: ['1688.com'] },
]

const SIZE = 128
const FAILED = []
const SAVED = []

async function tryGoogle(domain) {
  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${SIZE}`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) return { ok: false, reason: `google ${res.status}` }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 900) return { ok: false, reason: `google placeholder (${buf.length}B)` }
  return { ok: true, buf, source: 'google' }
}

async function tryDirect(domain) {
  // /favicon.ico 是浏览器默认请求的位置，几乎所有现代站点都有。
  // 同时尝试 apex 和 www 子域，再退一步从首页 HTML 里提取 <link rel="icon">。
  const candidates = [
    `https://${domain}/favicon.ico`,
    `https://www.${domain}/favicon.ico`,
  ]
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 200) continue
      return { ok: true, buf, source: 'direct', ext: 'ico' }
    } catch {
      // ignore, try next
    }
  }
  // 最后兜底：抓首页 HTML，解析出 <link rel="icon"> 路径再 fetch
  const homepages = [`https://${domain}/`, `https://www.${domain}/`]
  for (const home of homepages) {
    try {
      const res = await fetch(home, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      })
      if (!res.ok) continue
      const html = await res.text()
      // 提取 <link> 标签里同时含 rel=icon 和 href 的（顺序不限）
      const linkTags = html.match(/<link\b[^>]*>/gi) ?? []
      let iconHref = null
      for (const tag of linkTags) {
        const relMatch = tag.match(/rel\s*=\s*["']([^"']+)["']/i)
        const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i)
        if (!relMatch || !hrefMatch) continue
        const rel = relMatch[1].toLowerCase()
        if (rel.includes('icon')) {
          iconHref = hrefMatch[1]
          if (rel.includes('apple-touch')) break // apple-touch 通常分辨率更高，优先
        }
      }
      if (!iconHref) continue
      const iconUrl = new URL(iconHref, home).toString()
      const r2 = await fetch(iconUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      if (!r2.ok) continue
      const buf = Buffer.from(await r2.arrayBuffer())
      if (buf.length < 200) continue
      const ext = iconUrl.toLowerCase().endsWith('.png')
        ? 'png'
        : iconUrl.toLowerCase().endsWith('.svg')
          ? 'svg'
          : 'ico'
      return { ok: true, buf, source: 'html', ext }
    } catch {
      // ignore
    }
  }
  return { ok: false, reason: 'direct/html all failed' }
}

async function fetchOne(target) {
  const domains = Array.isArray(target.domain) ? target.domain : [target.domain]
  const reasons = []
  for (const domain of domains) {
    // 先 Google
    const g = await tryGoogle(domain)
    if (g.ok) {
      const dest = path.join(OUT_DIR, `${target.id}.png`)
      await writeFile(dest, g.buf)
      SAVED.push({ id: target.id, domain, bytes: g.buf.length, source: 'google', ext: 'png' })
      return
    }
    reasons.push(`${domain}: ${g.reason}`)
    // Google 没拿到 → 直连官网
    const d = await tryDirect(domain)
    if (d.ok) {
      const dest = path.join(OUT_DIR, `${target.id}.${d.ext}`)
      await writeFile(dest, d.buf)
      SAVED.push({ id: target.id, domain, bytes: d.buf.length, source: 'direct', ext: d.ext })
      return
    }
    reasons.push(`${domain}: ${d.reason}`)
  }
  FAILED.push({ ...target, reason: reasons.join(' | ') })
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true })
  for (const t of TARGETS) {
    await fetchOne(t)
  }
  console.log('SAVED:', SAVED.length)
  for (const s of SAVED)
    console.log(`  ${s.id.padEnd(22)} ${s.domain.padEnd(22)} ${s.source.padEnd(7)} ${s.ext.padEnd(4)} ${s.bytes}B`)
  console.log('FAILED:', FAILED.length)
  for (const f of FAILED) console.log(`  ${f.id.padEnd(22)} -> ${f.reason}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
