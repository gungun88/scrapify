import { getBackendUnavailableResponse, proxyBackendRequest } from '@/lib/server/backend'
import type { NewTaskForm } from '@/lib/types'

export async function GET(request: Request) {
  const proxied = await proxyBackendRequest({
    path: '/tasks',
    search: new URL(request.url).search,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}

export async function POST(request: Request) {
  const body = (await request.json()) as NewTaskForm

  const proxied = await proxyBackendRequest({
    path: '/tasks',
    method: 'POST',
    body,
  })

  if (proxied) {
    return proxied
  }

  return getBackendUnavailableResponse()
}
