import { NextResponse } from 'next/server'
import { monitorItems } from '@/lib/mock/monitor'
import { proxyBackendRequest } from '@/lib/server/backend'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/monitor',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return NextResponse.json(monitorItems)
}
