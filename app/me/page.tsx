'use client'

import Image from 'next/image'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { LogOut, RefreshCw, Trash2 } from 'lucide-react'
import { CatalogLimitPicker } from '@/components/ui/CatalogLimitPicker'
import { PlatformPicker } from '@/components/ui/PlatformPicker'
import { useConversations } from '@/hooks/useConversations'
import {
  useCreateProxy,
  useDeleteProxy,
  useProxies,
  useRefreshProxies,
  useTestProxy,
} from '@/hooks/useProxies'
import { useTasks } from '@/hooks/useTasks'
import {
  DEFAULT_CATALOG_LIMIT,
  DEFAULT_PLATFORM_ID,
  reconcilePlatform,
} from '@/lib/mock/platforms'
import { getPreferences, savePreferences } from '@/lib/preferences'
import type { CollectMode, NewProxyForm, ProxyRecord, ProxyScheme, UserPreferences } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tab = 'account' | 'preferences' | 'proxies' | 'usage'

const TABS: { key: Tab; label: string }[] = [
  { key: 'account', label: '账户' },
  { key: 'preferences', label: '默认偏好' },
  { key: 'proxies', label: '代理池' },
  { key: 'usage', label: '使用统计' },
]

export default function MePage() {
  const [tab, setTab] = useState<Tab>('preferences')
  const { data: session } = useSession()

  const userName = session?.user?.name ?? '我'
  const userEmail = session?.user?.email ?? null
  const userImage = session?.user?.image ?? null
  const userInitial = userName.slice(0, 1).toUpperCase()

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        {userImage ? (
          <Image
            src={userImage}
            alt={userName}
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-full"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-[16px] font-semibold text-accent-fg">
            {userInitial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[18px] font-semibold tracking-tight text-ink">{userName}</div>
          <div className="truncate text-[14px] text-ink-subtle">
            {userEmail ?? '—'} · 通过 Google 登录
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/login' })}
          className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line px-3 text-[13.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          title="登出"
        >
          <LogOut size={13} />
          登出
        </button>
      </header>

      <nav className="mb-6 flex items-center gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[15px] font-medium transition-colors',
              tab === t.key
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'account' && <AccountTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'proxies' && <ProxiesTab />}
      {tab === 'usage' && <UsageTab />}
    </div>
  )
}

/* ====================== 账户 ====================== */
function AccountTab() {
  const { data: session } = useSession()
  const name = session?.user?.name ?? '—'
  const email = session?.user?.email ?? '—'

  return (
    <Section title="账户信息">
      <Row label="用户名" value={name} />
      <Row label="邮箱" value={email} />
      <Row label="登录方式" value="Google" />
    </Section>
  )
}

/* ====================== 默认偏好 ====================== */
function PreferencesTab() {
  const [prefs, setPrefs] = useState<UserPreferences>({
    platform: DEFAULT_PLATFORM_ID,
    defaultMode: 'single',
    catalogLimit: DEFAULT_CATALOG_LIMIT,
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPrefs(getPreferences())
  }, [])

  function update<K extends keyof UserPreferences>(key: K, val: UserPreferences[K]) {
    setPrefs((p) => {
      const next = { ...p, [key]: val }
      // 切换默认模式时若平台不可用，自动回退
      if (key === 'defaultMode') {
        next.platform = reconcilePlatform(next.platform, val as CollectMode)
      }
      return next
    })
    setSaved(false)
  }

  function handleSave() {
    savePreferences(prefs)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Section
      title="默认偏好"
      desc="新建采集时会自动带上这些设置，每次提交前仍可临时修改。"
    >
      <PrefRow label="默认采集模式">
        <ModeSegmented
          value={prefs.defaultMode}
          onChange={(v) => update('defaultMode', v)}
        />
      </PrefRow>
      <PrefRow label="默认平台" alignTop>
        <PlatformPicker
          mode={prefs.defaultMode}
          value={prefs.platform}
          onChange={(v) => update('platform', v)}
          variant="inline"
        />
      </PrefRow>

      {prefs.defaultMode === 'catalog' ? (
        <PrefRow label="默认商品数" alignTop>
          <CatalogLimitPicker
            value={prefs.catalogLimit}
            onChange={(v) => update('catalogLimit', v)}
            variant="inline"
          />
        </PrefRow>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex h-9 items-center rounded-pill bg-ink px-5 text-[15px] font-medium text-accent-fg transition-colors hover:bg-[#1f1f1f]"
        >
          保存
        </button>
        {saved ? <span className="text-[14px] text-success">已保存</span> : null}
      </div>
    </Section>
  )
}

/* ====================== 字段模板 ====================== */
// 字段模板功能已下线（前端不再选择启用字段，后端总是输出全集）。

/* ====================== 代理池 ====================== */
const MAX_PROXIES_PER_USER = 10

function ProxiesTab() {
  const proxiesQuery = useProxies()
  const proxies = useMemo(() => proxiesQuery.data ?? [], [proxiesQuery.data])

  const createMutation = useCreateProxy()
  const deleteMutation = useDeleteProxy()
  const refreshMutation = useRefreshProxies()
  const testMutation = useTestProxy()

  // 表单本地状态
  const [scheme, setScheme] = useState<ProxyScheme>('http')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const atLimit = proxies.length >= MAX_PROXIES_PER_USER

  function resetForm() {
    setHost('')
    setPort('')
    setUsername('')
    setPassword('')
    setLabel('')
    setFormError(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const trimmedHost = host.trim()
    const portNum = Number.parseInt(port, 10)
    if (!trimmedHost) {
      setFormError('请填写代理地址')
      return
    }
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setFormError('端口必须是 1-65535 的整数')
      return
    }

    const form: NewProxyForm = {
      scheme,
      host: trimmedHost,
      port: portNum,
      username: username.trim() || null,
      password: password || null,
      label: label.trim() || null,
      countryCode: null,
    }

    try {
      await createMutation.mutateAsync(form)
      resetForm()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '新增失败')
    }
  }

  async function handleDelete(proxy: ProxyRecord) {
    if (!window.confirm(`确认删除代理 ${proxy.host}:${proxy.port}?`)) return
    try {
      await deleteMutation.mutateAsync(proxy.id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '删除失败')
    }
  }

  async function handleTest(proxy: ProxyRecord) {
    try {
      await testMutation.mutateAsync(proxy.id)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '测试失败')
    }
  }

  async function handleRefresh() {
    try {
      await refreshMutation.mutateAsync()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '刷新失败')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="代理池"
        desc="采集任务会自动通过你配置的 HTTP(S) 代理访问目标站点。后端每 60 秒探活一次,延迟最低的在线代理会被优先选用。"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[14px] text-ink-subtle">
            已配置 {proxies.length} / {MAX_PROXIES_PER_USER}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshMutation.isPending || proxies.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-line px-3 text-[13.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshMutation.isPending ? 'animate-spin' : ''} />
            刷新探活
          </button>
        </div>

        {proxiesQuery.isLoading ? (
          <div className="rounded-md border border-line bg-surface px-4 py-6 text-center text-[14px] text-ink-subtle">
            正在加载…
          </div>
        ) : proxiesQuery.error ? (
          <div className="rounded-md border border-line bg-surface px-4 py-6 text-center text-[14px] text-danger">
            {proxiesQuery.error instanceof Error ? proxiesQuery.error.message : '加载失败'}
          </div>
        ) : proxies.length === 0 ? (
          <div className="rounded-md border border-dashed border-line bg-surface px-4 py-6 text-center text-[14px] text-ink-subtle">
            还没有配置代理。在下方新增一个,采集任务会自动使用。
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {proxies.map((proxy) => (
              <li
                key={proxy.id}
                className="flex flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ProxyStatusBadge status={proxy.status} />
                    <span className="truncate font-mono text-[14px] text-ink">
                      {proxy.scheme}://{proxy.host}:{proxy.port}
                    </span>
                    {proxy.hasPassword ? (
                      <span className="rounded-pill bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink-subtle">
                        已认证
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-subtle">
                    {proxy.label ? <span>{proxy.label}</span> : null}
                    {proxy.latencyMs !== null ? <span>{proxy.latencyMs} ms</span> : null}
                    {proxy.consecutiveFailures > 0 ? (
                      <span className="text-warning">连续失败 {proxy.consecutiveFailures} 次</span>
                    ) : null}
                    {proxy.lastCheckedAt ? (
                      <span>最近探活 {formatRelative(proxy.lastCheckedAt)}</span>
                    ) : (
                      <span>未探活</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleTest(proxy)}
                    disabled={testMutation.isPending}
                    className="inline-flex h-7 items-center gap-1 rounded-pill border border-line px-2.5 text-[12.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    测试
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(proxy)}
                    disabled={deleteMutation.isPending}
                    className="inline-flex h-7 items-center justify-center rounded-pill border border-line px-2 text-ink-muted transition-colors hover:border-danger/60 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="新增代理" desc="只支持 HTTP / HTTPS 代理;SOCKS 暂不支持。">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={scheme}
              onChange={(e) => setScheme(e.target.value as ProxyScheme)}
              disabled={atLimit}
              className="h-9 rounded-md border border-line bg-surface px-2 text-[14px] text-ink focus:outline-none focus:ring-1 focus:ring-ink"
            >
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="代理地址(IP 或域名)"
              disabled={atLimit}
              className="h-9 flex-1 rounded-md border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-ink"
            />
            <input
              type="text"
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="端口"
              disabled={atLimit}
              className="h-9 w-full rounded-md border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-ink sm:w-[100px]"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名(可选)"
              autoComplete="off"
              disabled={atLimit}
              className="h-9 flex-1 rounded-md border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-ink"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码(可选)"
              autoComplete="new-password"
              disabled={atLimit}
              className="h-9 flex-1 rounded-md border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-ink"
            />
          </div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="备注(可选,如 HK-1)"
            disabled={atLimit}
            className="h-9 rounded-md border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-ink"
          />

          {formError ? <p className="text-[13px] text-danger">{formError}</p> : null}
          {atLimit ? (
            <p className="text-[13px] text-ink-subtle">已达每用户 {MAX_PROXIES_PER_USER} 个上限。</p>
          ) : null}

          <div>
            <button
              type="submit"
              disabled={createMutation.isPending || atLimit}
              className="inline-flex h-9 items-center rounded-pill bg-ink px-5 text-[15px] font-medium text-accent-fg transition-colors hover:bg-[#1f1f1f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? '添加中…' : '添加代理'}
            </button>
          </div>
        </form>
      </Section>
    </div>
  )
}

function ProxyStatusBadge({ status }: { status: ProxyRecord['status'] }) {
  const cfg = {
    online: { dot: 'bg-success', label: '在线', text: 'text-success' },
    offline: { dot: 'bg-danger', label: '离线', text: 'text-danger' },
    unknown: { dot: 'bg-ink/30', label: '未知', text: 'text-ink-subtle' },
  }[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px]', cfg.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function formatRelative(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return '—'
  const deltaSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (deltaSec < 60) return `${deltaSec} 秒前`
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} 分钟前`
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} 小时前`
  return `${Math.floor(deltaSec / 86400)} 天前`
}

/* ====================== 使用统计 ====================== */
function UsageTab() {
  const tasksQuery = useTasks()
  const conversationsQuery = useConversations()
  const convCount = conversationsQuery.data?.length ?? 0

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const totalItems = useMemo(
    () => tasks.filter((t) => t.status === 'done').reduce((s, t) => s + t.itemCount, 0),
    [tasks],
  )

  return (
    <Section title="使用情况" desc="当前账号累计统计。">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="已采集商品" value={totalItems.toLocaleString('en-US')} />
        <Tile label="任务总数" value={String(tasks.length)} />
        <Tile label="会话次数" value={String(convCount)} />
      </div>
    </Section>
  )
}

/* ====================== 通用小组件 ====================== */
function Section({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <h2 className="text-[16px] font-semibold tracking-tight text-ink">{title}</h2>
      {desc ? <p className="mt-1 text-[14px] text-ink-subtle">{desc}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 text-[15px] last:border-b-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  )
}

function PrefRow({
  label,
  children,
  alignTop = false,
}: {
  label: string
  children: React.ReactNode
  alignTop?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-b border-line py-3 last:border-b-0 sm:flex-row sm:gap-4',
        alignTop ? 'sm:items-start' : 'sm:items-center',
      )}
    >
      <span
        className={cn(
          'w-[140px] shrink-0 text-[14.5px] text-ink-muted',
          alignTop && 'pt-2',
        )}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function ModeSegmented({
  value,
  onChange,
}: {
  value: CollectMode
  onChange: (v: CollectMode) => void
}) {
  return (
    <div className="inline-flex gap-1 rounded-pill border border-line bg-surface p-0.5">
      {(['single', 'catalog'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            'rounded-pill px-3 py-1 text-[14.5px] font-medium transition-colors',
            value === m ? 'bg-ink text-accent-fg' : 'text-ink-muted hover:text-ink',
          )}
        >
          {m === 'single' ? '单品' : '目录'}
        </button>
      ))}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-[13.5px] text-ink-subtle">{label}</div>
      <div className="mt-1 text-[21px] font-semibold text-ink">{value}</div>
    </div>
  )
}
