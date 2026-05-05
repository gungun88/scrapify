import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/app/providers'
import { AppShell } from '@/components/layout/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'Scrapify',
  description: '极简独立站采集工作台',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
