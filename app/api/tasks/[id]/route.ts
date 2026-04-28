import { NextResponse } from 'next/server'
import { patchTask } from '@/lib/mock/taskRuntime'
import { proxyBackendRequest } from '@/lib/server/backend'
import type { Task } from '@/lib/types'

interface RouteContext {
  params: {
    id: string
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const body = (await request.json()) as Partial<Task>

  const proxied = await proxyBackendRequest({
    path: `/tasks/${params.id}`,
    method: 'PATCH',
    body,
  })

  if (proxied) {
    return proxied
  }

  const task = patchTask(params.id, body)

  if (!task) {
    return NextResponse.json({ message: 'Task not found' }, { status: 404 })
  }

  return NextResponse.json(task)
}
