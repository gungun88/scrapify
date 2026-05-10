'use client'

import Link from 'next/link'
import Image from 'next/image'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, LogOut } from 'lucide-react'
import { Composer } from '@/components/composer/Composer'
import {
  ConversationCard,
  aggregateElapsed,
  inferConversationStatus,
} from '@/components/conversation/ConversationCard'
import { useTasks } from '@/hooks/useTasks'
import { getConversations } from '@/lib/preferences'
import type { CollectConversation, Task } from '@/lib/types'

const RECENT_LIMIT = 3

export default function HomePage() {
  const [conversations, setConversations] = useState<CollectConversation[]>([])
  const tasksQuery = useTasks()

  useEffect(() => {
    setConversations(getConversations())
  }, [])

  const taskById = useMemo(() => {
    const m = new Map<string, Task>()
    for (const t of tasksQuery.data ?? []) m.set(t.id, t)
    return m
  }, [tasksQuery.data])

  const enriched = useMemo(
    () =>
      conversations.slice(0, RECENT_LIMIT).map((conv) => {
        const tasks = conv.taskIds.map((id) => taskById.get(id)).filter(Boolean) as Task[]
        const status = inferConversationStatus(tasks, conv.taskIds.length)
        const totalItems = tasks
          .filter((t) => t.status === 'done')
          .reduce((s, t) => s + t.itemCount, 0)
        return { conv, status, totalItems, elapsedText: aggregateElapsed(tasks), tasks }
      }),
    [conversations, taskById],
  )

  const hasMore = conversations.length > RECENT_LIMIT

  return (
    // 首页接管整个内容区，套上 .scrapify-dark 后内部组件经由 CSS 变量自动反转配色
    <div className="scrapify-dark relative isolate flex min-h-full flex-col overflow-hidden bg-bg">
      {/* 点阵背景：上半屏密、下半屏被光弧覆盖 */}
      <div
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center_top,black_40%,transparent_78%)]"
      />

      {/* 底部弧形地平线 + 多层漂浮光斑 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="aurora-arc animate" />
        <span className="aurora-blob violet animate-a left-[-8%] top-[48%] h-[560px] w-[560px]" />
        <span className="aurora-blob azure animate-b right-[-6%] top-[52%] h-[520px] w-[520px]" />
        <span className="aurora-blob magenta animate-c left-[38%] top-[78%] h-[420px] w-[420px]" />
      </div>

      {/* 横向蓝紫色光带：穿过 Hero 中下部 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="hero-light-band animate" />
      </div>

      {/* 径向暗角：边缘收拢，提升中心可读性 */}
      <div aria-hidden="true" className="hero-vignette" />

      {/* 顶部导航：裸露在背景之上，1440px 容器居中，水平 padding 响应式 */}
      <header className="relative z-10 mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between gap-4 px-[clamp(16px,5vw,96px)]">
        <Link href="/" className="flex select-none items-center gap-2 outline-0" aria-label="Scrapify 首页">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[14px] font-bold text-[#050608]">
            S
          </span>
          <span className="font-display text-[20px] font-semibold tracking-tight text-ink">
            Scrapify
          </span>
          <span className="ml-1 rounded-pill border border-white/15 px-2 py-[2px] text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
            Beta
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <UserMenu />
        </div>
      </header>

      {/* Hero 主区 */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-24 pt-10">
        <div className="w-full max-w-[920px]">
          <div className="mb-12 text-center">
            <h1 className="font-display text-[64px] leading-[1.05] tracking-tight text-ink md:text-[80px]">
              用 AI 速度
              <br />
              采集独立站
            </h1>
            <p className="mx-auto mt-6 max-w-[560px] text-[17px] leading-7 text-ink-muted">
              粘贴任意商品或目录链接，让结构化数据立刻出现在你面前
            </p>
          </div>

          <Composer />

          {/* 最近采集：紧贴 Composer 下方，最多 3 条卡片，超过显示"更多" */}
          {enriched.length > 0 ? (
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[12.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                  最近采集 · {conversations.length}
                </div>
                {hasMore ? (
                  <Link
                    href="/records"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
                  >
                    更多
                    <ArrowRight size={13} />
                  </Link>
                ) : null}
              </div>
              <div className="space-y-2">
                {enriched.map((item) => (
                  <ConversationCard
                    key={item.conv.id}
                    conv={item.conv}
                    status={item.status}
                    totalItems={item.totalItems}
                    elapsedText={item.elapsedText}
                    tasks={item.tasks}
                    href="/records"
                    compact
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function UserMenu() {
  const { data: session, status } = useSession()

  if (status !== 'authenticated' || !session?.user) {
    return (
      <Link
        href="/login"
        className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-[#050608] transition-opacity hover:opacity-[0.88]"
      >
        登录
      </Link>
    )
  }

  const name = session.user.name ?? '我'
  const image = session.user.image ?? null
  const initial = name.slice(0, 1).toUpperCase()

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/me"
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
        title={session.user.email ?? undefined}
      >
        {image ? (
          <Image src={image} alt={name} width={22} height={22} className="rounded-full" />
        ) : (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#050608]">
            {initial}
          </span>
        )}
        <span className="max-w-[100px] truncate font-medium text-ink">{name}</span>
      </Link>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: '/login' })}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-muted transition-colors hover:bg-white/10 hover:text-ink"
        title="登出"
        aria-label="登出"
      >
        <LogOut size={14} />
      </button>
    </div>
  )
}
