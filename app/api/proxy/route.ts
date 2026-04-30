import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/proxy',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}

export async function POST(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/proxy/refresh',
    method: 'POST',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}
