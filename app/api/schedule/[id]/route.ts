import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'
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

  return getBackendUnavailableResponse()
}
