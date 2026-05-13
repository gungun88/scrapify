import { proxyAuthenticated } from '@/lib/server/auth-proxy'

interface RouteContext {
  params: {
    id: string
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  return proxyAuthenticated({
    path: `/conversations/${params.id}`,
    method: 'DELETE',
  })
}
