'use client'

import { useEffect } from 'react'
import { NewTaskModal } from '@/components/tasks/NewTaskModal'
import { TaskTable } from '@/components/tasks/TaskTable'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { CheckItem } from '@/components/ui/CheckItem'
import { MiniBarChart } from '@/components/ui/MiniBarChart'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import { useFields } from '@/hooks/useFields'
import { useTasks } from '@/hooks/useTasks'
import { fieldConfigSeed } from '@/lib/mock/fields'
import { categoryDistribution, taskStats } from '@/lib/mock/tasks'
import { useTaskStore } from '@/lib/store/taskStore'
import { useUIStore } from '@/lib/store/uiStore'

/**
 * Task center page for monitoring scraper jobs, field presets, and category mix.
 */
export default function TasksPage() {
  const openModal = useUIStore((state) => state.openNewTaskModal)
  const tasks = useTaskStore((state) => state.tasks)
  const setTasks = useTaskStore((state) => state.setTasks)
  const { data } = useTasks()
  const { data: fields = fieldConfigSeed } = useFields()

  useEffect(() => {
    if (data) {
      setTasks(data)
    }
  }, [data, setTasks])

  return (
    <>
      <Topbar
        title="任务中心"
        subtitle="管理与追踪所有采集任务"
        actions={
          <div className="flex gap-2">
            <Button variant="outline">导出数据</Button>
            <Button onClick={openModal}>新建任务</Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard {...taskStats[0]} />
          <StatCard {...taskStats[1]} value={String(tasks.filter((task) => task.status === 'running').length)} />
          <StatCard {...taskStats[2]} />
          <StatCard {...taskStats[3]} />
        </section>

        <Panel
          title="采集任务列表"
          headerActions={
            <span className="text-[11px] font-medium text-text3">支持状态筛选与商品数排序</span>
          }
        >
          <TaskTable tasks={tasks} />
        </Panel>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Panel title="采集字段配置" headerActions={<button className="text-xs font-medium text-brand">编辑字段</button>}>
            <div>
              {fields.slice(0, 6).map((field) => (
                <CheckItem key={field.id} field={field} />
              ))}
            </div>
          </Panel>

          <Panel title="分类采集分布" headerActions={<button className="text-xs font-medium text-brand">查看全部</button>}>
            <MiniBarChart items={categoryDistribution} />
          </Panel>
        </section>
      </div>

      <NewTaskModal />
    </>
  )
}
