'use client'

import { useEffect, useMemo, useState } from 'react'
import { CatalogLimitPicker } from '@/components/ui/CatalogLimitPicker'
import { PlatformPicker } from '@/components/ui/PlatformPicker'
import { useFields, useUpdateFields } from '@/hooks/useFields'
import { useTasks } from '@/hooks/useTasks'
import {
  DEFAULT_CATALOG_LIMIT,
  DEFAULT_PLATFORM_ID,
  reconcilePlatform,
} from '@/lib/mock/platforms'
import { getConversations, getPreferences, savePreferences } from '@/lib/preferences'
import type { CollectMode, FieldConfig, UserPreferences } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tab = 'account' | 'preferences' | 'fields' | 'usage'

const TABS: { key: Tab; label: string }[] = [
  { key: 'account', label: '账户' },
  { key: 'preferences', label: '默认偏好' },
  { key: 'fields', label: '字段模板' },
  { key: 'usage', label: '使用统计' },
]

export default function MePage() {
  const [tab, setTab] = useState<Tab>('preferences')

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-[16px] font-semibold text-accent-fg">
          C
        </span>
        <div>
          <div className="text-[18px] font-semibold tracking-tight text-ink">cooltest</div>
          <div className="text-[14px] text-ink-subtle">cooltest@example.com · 已加入 30 天</div>
        </div>
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
      {tab === 'fields' && <FieldsTab />}
      {tab === 'usage' && <UsageTab />}
    </div>
  )
}

/* ====================== 账户 ====================== */
function AccountTab() {
  return (
    <Section title="账户信息">
      <Row label="用户名" value="cooltest" />
      <Row label="邮箱" value="cooltest@example.com" />
      <Row label="加入时间" value="30 天前" />
      <Row label="登录方式" value="本地账号" />
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
function FieldsTab() {
  const fieldsQuery = useFields()
  const updateFields = useUpdateFields()
  const [draft, setDraft] = useState<FieldConfig[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (fieldsQuery.data) setDraft(fieldsQuery.data)
  }, [fieldsQuery.data])

  const dirty = JSON.stringify(draft) !== JSON.stringify(fieldsQuery.data ?? [])
  const enabledCount = draft.filter((f) => f.enabled).length

  function toggle(id: string) {
    setDraft((d) => d.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)))
  }

  async function handleSave() {
    await updateFields.mutateAsync(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Section
      title="字段模板"
      desc="选择默认随每次采集下发的字段。改动会同步到所有新任务。"
    >
      <div className="mb-4 flex items-center gap-3 text-[14.5px] text-ink-muted">
        已启用 <span className="font-semibold text-ink">{enabledCount}</span> / {draft.length}
      </div>

      {fieldsQuery.isLoading ? (
        <div className="py-8 text-center text-[15px] text-ink-subtle">加载中…</div>
      ) : fieldsQuery.isError ? (
        <div className="rounded-md border border-danger/30 bg-[#fff4f4] px-3 py-2 text-[14px] text-danger">
          {fieldsQuery.error.message}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {draft.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => toggle(f.id)}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-[15px] transition-colors',
                f.enabled
                  ? 'border-line-strong bg-surface text-ink'
                  : 'border-line bg-surface text-ink-muted hover:bg-surface-soft',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{f.label}</span>
                <span className="block truncate font-mono text-[12.5px] text-ink-subtle">
                  {f.path}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-pill px-2 py-0.5 text-[12.5px] font-semibold',
                  f.enabled ? 'bg-ink text-accent-fg' : 'bg-surface-soft text-ink-subtle',
                )}
              >
                {f.enabled ? '启用' : '关闭'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || updateFields.isPending}
          className="inline-flex h-9 items-center rounded-pill bg-ink px-5 text-[15px] font-medium text-accent-fg transition-colors hover:bg-[#1f1f1f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateFields.isPending ? '保存中…' : '保存'}
        </button>
        {saved ? <span className="text-[14px] text-success">已保存</span> : null}
        {dirty && !saved ? <span className="text-[14px] text-ink-subtle">有未保存的改动</span> : null}
      </div>
    </Section>
  )
}

/* ====================== 使用统计 ====================== */
function UsageTab() {
  const tasksQuery = useTasks()
  const [convCount, setConvCount] = useState(0)

  useEffect(() => {
    setConvCount(getConversations().length)
  }, [])

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const totalItems = useMemo(
    () => tasks.filter((t) => t.status === 'done').reduce((s, t) => s + t.itemCount, 0),
    [tasks],
  )
  const QUOTA = 5000
  const percent = Math.min(100, Math.round((totalItems / QUOTA) * 100))

  return (
    <Section title="本月使用" desc="跨设备配额，月初自动重置。">
      <div className="mb-2 flex items-end justify-between text-[14.5px]">
        <span className="text-ink-muted">已采集商品</span>
        <span>
          <span className="text-[21px] font-semibold text-ink">
            {totalItems.toLocaleString('en-US')}
          </span>
          <span className="text-ink-subtle"> / {QUOTA.toLocaleString('en-US')}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-soft">
        <div className="h-full bg-ink transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 text-[13.5px] text-ink-subtle">{percent}% 已使用</div>

      <div className="mt-6 grid grid-cols-2 gap-3">
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
