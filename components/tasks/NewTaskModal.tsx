'use client'

import { X } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useCreateTask } from '@/hooks/useCreateTask'
import { cn, formatDelayLabel } from '@/lib/utils'
import { taskModalFields } from '@/lib/mock/tasks'
import { useUIStore } from '@/lib/store/uiStore'
import type { NewTaskForm } from '@/lib/types'

const initialForm: NewTaskForm = {
  url: '',
  mode: 'full',
  region: 'auto',
  fields: taskModalFields.filter((field) => field.defaultChecked).map((field) => field.id),
  concurrency: 3,
  delay: '1-3s',
}

export function NewTaskModal() {
  const isOpen = useUIStore((state) => state.isNewTaskModalOpen)
  const closeModal = useUIStore((state) => state.closeNewTaskModal)
  const createTask = useCreateTask()

  const [form, setForm] = useState<NewTaskForm>(initialForm)
  const [error, setError] = useState('')
  const selectedFieldCount = useMemo(() => form.fields.length, [form.fields.length])

  if (!isOpen) {
    return null
  }

  const toggleField = (fieldId: string) => {
    setForm((current) => {
      const exists = current.fields.includes(fieldId)

      return {
        ...current,
        fields: exists ? current.fields.filter((id) => id !== fieldId) : [...current.fields, fieldId],
      }
    })
  }

  const handleClose = () => {
    closeModal()
    setError('')
    setForm(initialForm)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form.url.trim()) {
      setError('请输入目标 URL')
      return
    }

    if (form.fields.length === 0) {
      setError('至少选择一个采集字段')
      return
    }

    try {
      await createTask.mutateAsync({
        ...form,
        url: form.url.trim(),
      })
      handleClose()
    } catch {
      setError('创建任务失败，请稍后重试')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(10,8,20,0.45)] px-4"
      onClick={handleClose}
    >
      <div
        className="surface-ring max-h-[80vh] w-full max-w-[520px] overflow-y-auto rounded-[14px] bg-surface shadow-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center border-b border-border px-5 pb-[14px] pt-[18px]">
          <div className="flex-1 text-[15px] font-semibold text-text1">新建采集任务</div>
          <button
            type="button"
            aria-label="关闭"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-border bg-surface text-text2 transition-colors hover:bg-surface2 hover:text-text1"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-[14px] px-5 py-[18px]">
            <div className="flex flex-col gap-[6px]">
              <label className="text-xs font-semibold text-text2">目标 URL</label>
              <input
                type="text"
                value={form.url}
                onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                placeholder="https://example.myshopify.com/collections/all"
                className="rounded-sm border border-border2 bg-surface px-3 py-2 text-[13px] text-text1 outline-none transition-colors placeholder:text-text3 focus:border-brand"
              />
              {error ? <span className="text-[11px] text-red-text">{error}</span> : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-[6px]">
                <label className="text-xs font-semibold text-text2">采集模式</label>
                <select
                  value={form.mode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      mode: event.target.value as NewTaskForm['mode'],
                    }))
                  }
                  className="cursor-pointer rounded-sm border border-border2 bg-surface px-3 py-2 text-[13px] text-text1 outline-none focus:border-brand"
                >
                  <option value="full">全量采集</option>
                  <option value="incremental">增量更新</option>
                  <option value="price-only">仅价格变化</option>
                </select>
              </div>

              <div className="flex flex-col gap-[6px]">
                <label className="text-xs font-semibold text-text2">代理区域</label>
                <select
                  value={form.region}
                  onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))}
                  className="cursor-pointer rounded-sm border border-border2 bg-surface px-3 py-2 text-[13px] text-text1 outline-none focus:border-brand"
                >
                  <option value="auto">自动选择</option>
                  <option value="us">美国</option>
                  <option value="uk">英国</option>
                  <option value="de">德国</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-[6px]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-text2">采集字段</label>
                <span className="text-[11px] text-text3">已选 {selectedFieldCount} 项</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {taskModalFields.map((field) => {
                  const active = form.fields.includes(field.id)

                  return (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => toggleField(field.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-sm border px-[10px] py-2 text-left text-xs transition-colors',
                        active
                          ? 'border-brand bg-brand-light text-brand'
                          : 'border-border bg-surface text-text2 hover:bg-surface2',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-[13px] w-[13px] items-center justify-center rounded-[4px] border text-[10px]',
                          active ? 'border-brand bg-brand text-white' : 'border-border2 bg-surface',
                        )}
                      >
                        {active ? '✓' : ''}
                      </span>
                      {field.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-[6px]">
                <label className="text-xs font-semibold text-text2">并发数</label>
                <select
                  value={String(form.concurrency)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      concurrency: Number(event.target.value),
                    }))
                  }
                  className="cursor-pointer rounded-sm border border-border2 bg-surface px-3 py-2 text-[13px] text-text1 outline-none focus:border-brand"
                >
                  <option value="3">3（推荐）</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                </select>
              </div>

              <div className="flex flex-col gap-[6px]">
                <label className="text-xs font-semibold text-text2">请求延迟</label>
                <select
                  value={form.delay}
                  onChange={(event) => setForm((current) => ({ ...current, delay: event.target.value }))}
                  className="cursor-pointer rounded-sm border border-border2 bg-surface px-3 py-2 text-[13px] text-text1 outline-none focus:border-brand"
                >
                  <option value="1-3s">{formatDelayLabel('1-3s')}</option>
                  <option value="0.5s">{formatDelayLabel('0.5s')}</option>
                  <option value="5s">{formatDelayLabel('5s')}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 pb-[18px] pt-[14px]">
            <Button type="button" variant="outline" onClick={handleClose}>
              取消
            </Button>
            <Button type="submit" disabled={createTask.isPending} className={cn(createTask.isPending && 'cursor-not-allowed opacity-70')}>
              {createTask.isPending ? '创建中...' : '立即开始采集'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
