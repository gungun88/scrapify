import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import localFont from 'next/font/local'
import { Providers } from '@/app/providers'
import { AppShell } from '@/components/layout/AppShell'
import './globals.css'

const inter = localFont({
  src: './fonts/inter.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
  fallback: ['Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
})

const dmSans = localFont({
  src: './fonts/dm-sans.woff2',
  variable: '--font-display',
  display: 'swap',
  weight: '100 1000',
  fallback: ['Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
})

const jetbrainsMono = localFont({
  src: './fonts/jetbrains-mono.woff2',
  variable: '--font-mono',
  display: 'swap',
  weight: '100 800',
  fallback: ['SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace'],
})

export const metadata: Metadata = {
  title: 'Scrapify',
  description: '极简独立站采集工作台',
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
