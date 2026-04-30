import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'
import type { FieldConfig } from '@/lib/types'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/fields',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}

export async function PUT(request: Request) {
  const body = (await request.json()) as FieldConfig[]

  const proxied = await proxyBackendRequest({
    path: '/fields',
    method: 'PUT',
    body,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}
