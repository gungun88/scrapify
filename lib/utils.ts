import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TaskStatus } from '@/lib/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTaskStatusLabel(status: TaskStatus) {
  switch (status) {
    case 'running':
      return '运行中'
    case 'done':
      return '已完成'
    case 'error':
      return '失败'
    case 'pending':
      return '等待中'
    default:
      return status
  }
}

export function createTaskId() {
  return `task-${Math.random().toString(36).slice(2, 10)}`
}

export function formatDelayLabel(value: string) {
  if (value === '1-3s') {
    return '1-3 秒（随机）'
  }

  if (value === '0.5s') {
    return '0.5 秒'
  }

  if (value === '5s') {
    return '5 秒'
  }

  return value
}

export async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string }
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message
    }
  } catch {}

  return `Request failed with status ${response.status}`
}
