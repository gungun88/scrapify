'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Composer } from '@/components/composer/Composer'
import { getConversations } from '@/lib/preferences'
import type { CollectConversation } from '@/lib/types'

export default function HomePage() {
  const [recents, setRecents] = useState<CollectConversation[]>([])

  useEffect(() => {
    setRecents(getConversations().slice(0, 3))
  }, [])

  return (
    <div className="flex min-h-full flex-col">
      <main className="flex flex-1 items-center justify-center px-6 pb-16 pt-20">
        <div className="w-full max-w-[760px]">
          <h1 className="mb-8 text-center text-[30px] font-semibold tracking-tight text-ink">
            告诉我你想采集什么
          </h1>

          <Composer />

          {recents.length > 0 ? (
            <div className="mt-12">
              <div className="mb-3 text-center text-[13.5px] font-medium uppercase tracking-wider text-ink-subtle">
                最近常用
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {recents.map((c) => (
                  <Link
                    key={c.id}
                    href={`/c/${c.id}`}
                    className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-[14.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    <span>{c.mode === 'catalog' ? '🗂' : '📦'}</span>
                    <span className="max-w-[200px] truncate">{c.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
