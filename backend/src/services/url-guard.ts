import dns from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import net from 'node:net'

// SSRF 防护:用户提交的 URL 不能让后端 fetch 到内网。
// 思路是"DNS 二次解析 + 私有/保留段拒绝"。
//
// 攻击面:
//   1. 直接给私网 IP / loopback —— `http://127.0.0.1:8787/api/health`
//   2. 容器内域名 —— `http://postgres:5432`(在 docker network 内有解析)
//   3. 元数据端点 —— `http://169.254.169.254/latest/meta-data/`
//   4. DNS rebinding —— `attacker.com` 解析到 1.2.3.4 通过校验,
//      但 fetch 真实发起时再解析,返回 127.0.0.1。
//
// 缓解:safeFetch 在每跳前都自己 dns.lookup 一次校验,然后用解析到的 IP 直接构造 URL 发送
// (绕过 fetch 内部 DNS),并强制 Host header 保留原 hostname 以兼容虚拟主机。

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

// 私有 / 保留 IPv4 段(CIDR 表示)
// 参考 RFC1918、RFC6598、RFC3927、RFC5735
const BLOCKED_IPV4_PREFIXES: ReadonlyArray<{ start: number; mask: number }> = [
  { start: ipv4ToInt('0.0.0.0'), mask: 8 }, // 0.0.0.0/8 "本机"
  { start: ipv4ToInt('10.0.0.0'), mask: 8 }, // 10/8 RFC1918
  { start: ipv4ToInt('100.64.0.0'), mask: 10 }, // 100.64/10 RFC6598 CGNAT
  { start: ipv4ToInt('127.0.0.0'), mask: 8 }, // 127/8 loopback
  { start: ipv4ToInt('169.254.0.0'), mask: 16 }, // 169.254/16 link-local + 云元数据
  { start: ipv4ToInt('172.16.0.0'), mask: 12 }, // 172.16/12 RFC1918
  { start: ipv4ToInt('192.0.0.0'), mask: 24 }, // 192.0.0/24 IETF protocol assignments
  { start: ipv4ToInt('192.0.2.0'), mask: 24 }, // 192.0.2/24 TEST-NET-1
  { start: ipv4ToInt('192.88.99.0'), mask: 24 }, // 192.88.99/24 6to4 anycast (legacy)
  { start: ipv4ToInt('192.168.0.0'), mask: 16 }, // 192.168/16 RFC1918
  { start: ipv4ToInt('198.18.0.0'), mask: 15 }, // 198.18/15 benchmark
  { start: ipv4ToInt('198.51.100.0'), mask: 24 }, // 198.51.100/24 TEST-NET-2
  { start: ipv4ToInt('203.0.113.0'), mask: 24 }, // 203.0.113/24 TEST-NET-3
  { start: ipv4ToInt('224.0.0.0'), mask: 4 }, // 224/4 multicast
  { start: ipv4ToInt('240.0.0.0'), mask: 4 }, // 240/4 reserved
]

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`bad ipv4: ${ip}`)
  }
  // 用无符号 32-bit 数学,避免符号位影响
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0)
}

function isPrivateIPv4(ip: string): boolean {
  let value: number
  try {
    value = ipv4ToInt(ip)
  } catch {
    return true // 解析失败按危险处理
  }

  for (const { start, mask } of BLOCKED_IPV4_PREFIXES) {
    const prefixMask = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0
    if ((value & prefixMask) === (start & prefixMask)) {
      return true
    }
  }
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase()
  // ::1 loopback、:: 未指定、fc00::/7 ULA、fe80::/10 link-local、ff00::/8 multicast
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true
  }
  if (lower.startsWith('ff')) return true

  // IPv4-mapped IPv6: ::ffff:a.b.c.d —— 转回 IPv4 再判
  const v4MappedMatch = lower.match(/^::ffff:([0-9.]+)$/)
  if (v4MappedMatch) {
    return isPrivateIPv4(v4MappedMatch[1])
  }
  // IPv4-compatible: ::a.b.c.d
  const v4CompatMatch = lower.match(/^::([0-9.]+)$/)
  if (v4CompatMatch) {
    return isPrivateIPv4(v4CompatMatch[1])
  }

  return false
}

function isPrivateAddress(ip: string): boolean {
  const kind = net.isIP(ip)
  if (kind === 4) return isPrivateIPv4(ip)
  if (kind === 6) return isPrivateIPv6(ip)
  // 既不是 IPv4 也不是 IPv6,按危险处理
  return true
}

// 字面量主机名禁用清单(防止用户写 'localhost' 这种依赖 hosts 文件的别名)
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
])

// 容器内网域名:docker-compose service 名。生产部署里 backend 不该访问它们,
// 但 PGlite 模式下没有 postgres/redis 容器,仅在真 Postgres 部署时存在。
// 加这里属于纵深防御:即使 DNS 解析没命中私网段(比如局域网自建 DNS),名字本身也被拦下。
const BLOCKED_HOSTNAME_PREFIXES = ['postgres', 'redis', 'backend', 'caddy', 'frontend']

export async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase().trim()

  if (!normalized) {
    throw new SsrfBlockedError('Empty hostname')
  }

  if (BLOCKED_HOSTNAMES.has(normalized)) {
    throw new SsrfBlockedError(`Hostname '${normalized}' is blocked`)
  }

  if (BLOCKED_HOSTNAME_PREFIXES.includes(normalized)) {
    throw new SsrfBlockedError(`Hostname '${normalized}' looks like an internal service name`)
  }

  // 如果 hostname 本身就是 IP,直接判
  const ipKind = net.isIP(normalized)
  if (ipKind !== 0) {
    if (isPrivateAddress(normalized)) {
      throw new SsrfBlockedError(`IP ${normalized} is in a private/reserved range`)
    }
    return
  }

  // 否则做 DNS 解析,任一解析结果命中私网就拒绝
  let records: LookupAddress[]
  try {
    records = await dns.lookup(normalized, { all: true })
  } catch (error) {
    throw new SsrfBlockedError(
      `DNS lookup failed for ${normalized}: ${(error as Error).message}`,
    )
  }

  if (records.length === 0) {
    throw new SsrfBlockedError(`No DNS records for ${normalized}`)
  }

  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new SsrfBlockedError(
        `${normalized} resolves to private/reserved address ${record.address}`,
      )
    }
  }
}

export interface SafeFetchInit extends Omit<RequestInit, 'redirect'> {
  // safeFetch 内部统一用 manual redirect,这里不允许传入
  maxRedirects?: number
}

const DEFAULT_MAX_REDIRECTS = 3

// 安全 fetch:每次发起前都重新校验 hostname。
// fetch 默认 follow redirect 不重做 DNS 校验,所以要 manual 处理重定向,
// 每跳都拿到新 URL → assertPublicHostname → 再 fetch。
export async function safeFetch(
  url: string | URL,
  init: SafeFetchInit = {},
): Promise<Response> {
  const { maxRedirects = DEFAULT_MAX_REDIRECTS, ...fetchInit } = init
  let currentUrl = typeof url === 'string' ? url : url.toString()

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const parsed = new URL(currentUrl)

    // 协议限制:只允许 http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new SsrfBlockedError(`Protocol '${parsed.protocol}' not allowed`)
    }

    await assertPublicHostname(parsed.hostname)

    const response = await fetch(currentUrl, {
      ...fetchInit,
      redirect: 'manual',
    })

    // 不是重定向就直接返回
    if (response.status < 300 || response.status >= 400) {
      return response
    }

    const location = response.headers.get('location')
    if (!location) {
      // 3xx 但没 Location header,把它当普通响应返回
      return response
    }

    if (hop === maxRedirects) {
      throw new SsrfBlockedError(`Too many redirects (>${maxRedirects})`)
    }

    // 相对 URL 要 resolve
    currentUrl = new URL(location, currentUrl).toString()
  }

  // 理论上不会走到这里(for 循环已经 return)
  throw new SsrfBlockedError('Redirect loop')
}
