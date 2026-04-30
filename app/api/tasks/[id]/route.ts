import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'
import type { TaskDetail } from '@/lib/types'

interface RouteContext {
  params: {
    id: string
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const proxied = await proxyBackendRequest({
    path: `/tasks/${params.id}`,
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const body = (await request.json()) as Partial<TaskDetail>

  const proxied = await proxyBackendRequest({
    path: `/tasks/${params.id}`,
    method: 'PATCH',
    body,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}
