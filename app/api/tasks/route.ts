import { proxyAuthenticated } from '@/lib/server/auth-proxy'
import type { NewTaskForm } from '@/lib/types'

export async function GET(request: Request) {
  return proxyAuthenticated({
    path: '/tasks',
    search: new URL(request.url).search,
  })
}

export async function POST(request: Request) {
  const body = (await request.json()) as NewTaskForm

  return proxyAuthenticated({
    path: '/tasks',
    method: 'POST',
    body,
  })
}
