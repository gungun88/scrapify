import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'

interface RouteContext {
  params: {
    id: string
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const proxied = await proxyBackendRequest({
    path: `/tasks/${params.id}/logs`,
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}
