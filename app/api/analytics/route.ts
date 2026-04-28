import { NextResponse } from 'next/server'
import { analyticsSnapshot } from '@/lib/mock/analytics'
import { proxyBackendRequest } from '@/lib/server/backend'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/analytics',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return NextResponse.json(analyticsSnapshot)
}
