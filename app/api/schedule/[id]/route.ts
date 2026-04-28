import { NextResponse } from 'next/server'
import { patchScheduleJob } from '@/lib/mock/schedule'
import { proxyBackendRequest } from '@/lib/server/backend'
import type { ScheduleJob } from '@/lib/types'

interface RouteContext {
  params: {
    id: string
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const body = (await request.json()) as Partial<ScheduleJob>

  const proxied = await proxyBackendRequest({
    path: `/schedule/${params.id}`,
    method: 'PATCH',
    body,
  })

  if (proxied) {
    return proxied
  }

  const job = patchScheduleJob(params.id, body)

  if (!job) {
    return NextResponse.json({ message: 'Schedule not found' }, { status: 404 })
  }

  return NextResponse.json(job)
}
