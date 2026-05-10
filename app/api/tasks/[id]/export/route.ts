import { proxyAuthenticated } from '@/lib/server/auth-proxy'

interface RouteContext {
  params: {
    id: string
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  return proxyAuthenticated({
    path: `/tasks/${params.id}/export`,
    search: new URL(request.url).search,
    raw: true,
  })
}
