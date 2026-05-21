import { proxyAuthenticated } from '@/lib/server/auth-proxy'

interface RouteContext {
  params: {
    id: string
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  return proxyAuthenticated({
    path: `/proxies/${params.id}`,
    method: 'DELETE',
  })
}
