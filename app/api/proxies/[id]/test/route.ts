import { proxyAuthenticated } from '@/lib/server/auth-proxy'

interface RouteContext {
  params: {
    id: string
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  return proxyAuthenticated({
    path: `/proxies/${params.id}/test`,
    method: 'POST',
  })
}
