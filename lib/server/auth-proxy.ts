import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'

interface ProxyOptions {
  path: string
  method?: string
  body?: unknown
  search?: string
  raw?: boolean
}

// 受保护的 app/api/* 路由统一走这条：先校验登录态，再带上 X-User-* HMAC 签名转发到 Fastify。
export async function proxyAuthenticated(options: ProxyOptions) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const proxied = await proxyBackendRequest({
    ...options,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
  })

  return proxied ?? getBackendUnavailableResponse()
}
