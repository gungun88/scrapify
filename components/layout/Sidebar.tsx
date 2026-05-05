'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Plus, Settings, User, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getConversations } from '@/lib/preferences'
import type { CollectConversation } from '@/lib/types'
import { cn } from '@/lib/utils'

interface SidebarProps {
  /** 触发刷新最近列表（提交新任务后自增） */
  refreshKey?: number
}

const MAX_RECENT = 8

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} 天前`
  return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function Sidebar({ refreshKey = 0 }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [conversations, setConversations] = useState<CollectConversation[]>([])

  useEffect(() => {
    setConversations(getConversations())
  }, [refreshKey, pathname])

  const recent = conversations.slice(0, MAX_RECENT)

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-line bg-surface">
      {/* Logo */}
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-[14px] font-bold text-accent-fg">
            S
          </span>
          Scrapify
        </Link>
      </div>

      {/* New */}
      <div className="px-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-[15px] font-medium text-ink transition-colors hover:bg-surface-soft"
        >
          <Plus size={14} strokeWidth={2.4} />
          新建采集
        </button>
      </div>

      {/* Recent */}
      <nav className="mt-4 flex-1 overflow-y-auto px-2">
        <div className="mb-1 px-2 text-[12.5px] font-semibold uppercase tracking-wider text-ink-subtle">
          最近
        </div>
        {recent.length === 0 ? (
          <div className="px-2 py-3 text-[14px] text-ink-subtle">还没有采集记录</div>
        ) : (
          <ul>
            {recent.map((conv) => {
              const active = pathname === `/c/${conv.id}`
              return (
                <li key={conv.id}>
                  <Link
                    href={`/c/${conv.id}`}
                    className={cn(
                      'group flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-[15px] transition-colors',
                      active ? 'bg-surface-soft text-ink' : 'text-ink-muted hover:bg-surface-soft hover:text-ink',
                    )}
                  >
                    <span className="truncate">{conv.title}</span>
                    <span className="text-[12.5px] text-ink-subtle">
                      {formatRelative(conv.createdAt)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {conversations.length > MAX_RECENT ? (
          <Link
            href="/records"
            className="mt-2 block px-2 py-1.5 text-[14px] text-ink-muted transition-colors hover:text-ink"
          >
            ⋯ 全部记录
          </Link>
        ) : (
          <Link
            href="/records"
            className="mt-2 block px-2 py-1.5 text-[14px] text-ink-muted transition-colors hover:text-ink"
          >
            采集记录 →
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-line p-3">
        <Link
          href="/me"
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
            pathname?.startsWith('/me')
              ? 'bg-surface-soft text-ink'
              : 'text-ink-muted hover:bg-surface-soft hover:text-ink',
          )}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[12.5px] font-semibold text-accent-fg">
            <User size={12} />
          </span>
          <span className="flex-1 truncate text-[15px]">cooltest</span>
          <Settings size={13} className="text-ink-subtle" />
        </Link>
      </div>
    </aside>
  )
}

/* 状态徽标，给后续详情页 / 列表页用 */
export function StatusBadge({
  status,
}: {
  status: 'running' | 'done' | 'error' | 'pending'
}) {
  if (status === 'running')
    return (
      <span className="inline-flex items-center gap-1 text-[14px] text-ink-muted">
        <Loader2 size={12} className="animate-spin" />
        运行中
      </span>
    )
  if (status === 'done')
    return (
      <span className="inline-flex items-center gap-1 text-[14px] text-success">
        <CheckCircle2 size={12} />
        已完成
      </span>
    )
  if (status === 'error')
    return (
      <span className="inline-flex items-center gap-1 text-[14px] text-danger">
        <AlertCircle size={12} />
        失败
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-[14px] text-ink-subtle">
      <Clock size={12} />
      等待中
    </span>
  )
}
