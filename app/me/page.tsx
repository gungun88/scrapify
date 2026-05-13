'use client'

import Image from 'next/image'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { LogOut } from 'lucide-react'
import { CatalogLimitPicker } from '@/components/ui/CatalogLimitPicker'
import { PlatformPicker } from '@/components/ui/PlatformPicker'
import { useConversations } from '@/hooks/useConversations'
import { useTasks } from '@/hooks/useTasks'
import {
  DEFAULT_CATALOG_LIMIT,
  DEFAULT_PLATFORM_ID,
  reconcilePlatform,
} from '@/lib/mock/platforms'
import { getPreferences, savePreferences } from '@/lib/preferences'
import type { CollectMode, UserPreferences } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tab = 'account' | 'preferences' | 'usage'

const TABS: { key: Tab; label: string }[] = [
  { key: 'account', label: '账户' },
  { key: 'preferences', label: '默认偏好' },
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
