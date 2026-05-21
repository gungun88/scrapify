import { proxyAuthenticated } from '@/lib/server/auth-proxy'

export async function GET(request: Request) {
  return proxyAuthenticated({
    path: '/proxies',
    search: new URL(request.url).search,
  })
}

export async function POST(request: Request) {
  const body = (await request.json()) as unknown

  return proxyAuthenticated({
    path: '/proxies',
    method: 'POST',
    body,
  })
}
