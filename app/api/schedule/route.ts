import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/schedule',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}
