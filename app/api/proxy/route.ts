import { NextResponse } from 'next/server'
import { proxyItems } from '@/lib/mock/proxy'
import { proxyBackendRequest } from '@/lib/server/backend'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/proxy',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return NextResponse.json(proxyItems)
}
