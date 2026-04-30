import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/monitor',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}

export async function POST(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/monitor/refresh',
    method: 'POST',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}
