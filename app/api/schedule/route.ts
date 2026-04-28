import { NextResponse } from 'next/server'
import { listScheduleJobs } from '@/lib/mock/schedule'
import { proxyBackendRequest } from '@/lib/server/backend'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/schedule',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return NextResponse.json(listScheduleJobs())
}
