'use client'

import { useEffect, useState } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { NewTaskModal } from '@/components/tasks/NewTaskModal'
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel'
import { TaskTable } from '@/components/tasks/TaskTable'
import { Button } from '@/components/ui/Button'
import { CheckItem } from '@/components/ui/CheckItem'
import { MiniBarChart } from '@/components/ui/MiniBarChart'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { useFields } from '@/hooks/useFields'
import { useTasks } from '@/hooks/useTasks'
import { downloadTaskResultExport } from '@/lib/taskExport'
import { useTaskStore } from '@/lib/store/taskStore'
import { useUIStore } from '@/lib/store/uiStore'
import { getTaskCenterMetrics } from '@/lib/taskCenterMetrics'

/**
 * Task center page for monitoring scraper jobs, field presets, and category mix.
 */
export default function TasksPage() {
  const openModal = useUIStore((state) => state.openNewTaskModal)
  const openTaskDetail = useUIStore((state) => state.openTaskDetail)
  const closeTaskDetail = useUIStore((state) => state.closeTaskDetail)
  const selectedTaskId = useUIStore((state) => state.selectedTaskId)
  const tasks = useTaskStore((state) => state.tasks)
  const setTasks = useTaskStore((state) => state.setTasks)
  const tasksQuery = useTasks()
  const fieldsQuery = useFields()
  const [exportError, setExportError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const { stats, categoryDistribution } = getTaskCenterMetrics(tasks)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null

  useEffect(() => {
    if (tasksQuery.data) {
      setTasks(tasksQuery.data)
    }
  }, [setTasks, tasksQuery.data])

  useEffect(() => {
    if (selectedTaskId && !selectedTask) {
      closeTaskDetail()
    }
  }, [closeTaskDetail, selectedTask, selectedTaskId])

  useEffect(() => {
    setExportError(null)
  }, [selectedTaskId])

  async function handleExportSelectedTask() {
    if (!selectedTaskId) {
      return
    }

    setIsExporting(true)
    setExportError(null)

    try {
      await downloadTaskResultExport(selectedTaskId, 'csv')
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出任务结果失败。')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <>
      <Topbar
        title="任务中心"
        subtitle="管理、跟踪和排查所有采集任务"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportSelectedTask} disabled={!selectedTaskId || isExporting}>
              {isExporting ? '导出中...' : '导出结果'}
            </Button>
            <Button onClick={openModal}>新建任务</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        {exportError ? (
          <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">{exportError}</div>
        ) : null}

        {tasksQuery.isError ? (
          <div className="rounded border border-red/20 bg-red-bg px-4 py-3 text-sm text-red-text">{tasksQuery.error.message}</div>
        ) : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </section>

        <Panel title="采集任务列表" headerActions={<span className="text-[11px] font-medium text-text3">支持状态筛选、排序与详情查看</span>}>
          {tasksQuery.isLoading && tasks.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-text3">正在加载采集任务...</div>
          ) : (
            <TaskTable tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={(task) => openTaskDetail(task.id)} />
          )}
        </Panel>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="采集字段配置" headerActions={<button className="text-xs font-medium text-brand">编辑字段</button>}>
            {fieldsQuery.isLoading ? (
              <div className="px-5 py-10 text-center text-sm text-text3">正在加载字段模板...</div>
            ) : fieldsQuery.isError ? (
              <div className="px-5 py-10 text-center text-sm text-red-text">{fieldsQuery.error.message}</div>
            ) : fieldsQuery.data?.length ? (
              <div>
                {fieldsQuery.data.slice(0, 6).map((field) => (
                  <CheckItem key={field.id} field={field} />
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center text-sm text-text3">当前没有可展示的字段模板。</div>
            )}
          </Panel>

          <Panel title="任务分类分布" headerActions={<button className="text-xs font-medium text-brand">查看全部</button>}>
            <MiniBarChart items={categoryDistribution} />
          </Panel>
        </section>
      </div>

      <TaskDetailPanel task={selectedTask} onClose={closeTaskDetail} />
      <NewTaskModal />
    </>
  )
}
