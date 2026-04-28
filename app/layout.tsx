import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/app/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Scrapify',
  description: 'Shopify standalone site scraping task center',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
