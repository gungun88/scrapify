import { proxyAuthenticated } from '@/lib/server/auth-proxy'

export async function POST() {
  return proxyAuthenticated({
    path: '/proxies/refresh',
    method: 'POST',
  })
}
