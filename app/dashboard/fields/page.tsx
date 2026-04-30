'use client'

import { useEffect, useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { useFields, useUpdateFields } from '@/hooks/useFields'
import type { FieldConfig } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function FieldsPage() {
  const fieldsQuery = useFields()
  const updateFields = useUpdateFields()
  const [draft, setDraft] = useState<FieldConfig[]>([])

  useEffect(() => {
    setDraft(fieldsQuery.data ?? [])
  }, [fieldsQuery.data])

  const enabledCount = draft.filter((field) => field.enabled).length
  const disabledCount = Math.max(draft.length - enabledCount, 0)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(fieldsQuery.data ?? [])

  const toggleField = (fieldId: string) => {
    setDraft((current) =>
      current.map((field) => (field.id === fieldId ? { ...field, enabled: !field.enabled } : field)),
    )
  }

  return (
    <>
      <Topbar
        title="字段配置"
        subtitle="管理全局采集字段模板。"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft(fieldsQuery.data ?? [])} disabled={!isDirty || fieldsQuery.isLoading || fieldsQuery.isError}>
              重置
            </Button>
            <Button onClick={() => updateFields.mutate(draft)} disabled={!isDirty || updateFields.isPending || fieldsQuery.isLoading || fieldsQuery.isError}>
              {updateFields.isPending ? '保存中...' : '保存模板'}
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {fieldsQuery.isError ? (
          <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">{fieldsQuery.error.message}</div>
        ) : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="启用字段" value={String(enabledCount)} change="默认随任务下发" trend="up" />
          <StatCard label="可选扩展字段" value={String(disabledCount)} change="按需启用" trend="neutral" />
          <StatCard
            label="模板状态"
            value={isDirty ? '未保存' : '已同步'}
            change="字段变更实时影响新建任务"
            trend={isDirty ? 'down' : 'up'}
          />
        </section>

        <Panel title="字段模板网格" headerActions={<span className="text-[11px] font-medium text-text3">点击卡片切换状态</span>}>
          {fieldsQuery.isLoading ? (
            <div className="px-5 py-10 text-center text-sm text-text3">正在加载字段模板...</div>
          ) : draft.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-text3">当前没有可编辑的字段模板。</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {draft.map((field) => (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => toggleField(field.id)}
                  className={cn(
                    'rounded border p-4 text-left transition-colors',
                    field.enabled ? 'border-brand bg-brand-light/50' : 'border-border bg-surface hover:bg-surface2',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text1">{field.label}</div>
                      <div className="mt-1 font-mono text-[11px] text-text3">{field.path}</div>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-[8px] py-[3px] text-[10px] font-semibold',
                        field.enabled ? 'bg-brand text-white' : 'bg-surface2 text-text3',
                      )}
                    >
                      {field.enabled ? '启用中' : '未启用'}
                    </span>
                  </div>
                  <div className="mt-4 inline-flex rounded-[6px] border border-border bg-surface px-[8px] py-[3px] font-mono text-[10px] text-text2">
                    {field.type}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
