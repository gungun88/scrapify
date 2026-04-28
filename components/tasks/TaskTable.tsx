'use client'

import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Task } from '@/lib/types'

interface TaskTableProps {
  tasks: Task[]
}

const columns: ColumnDef<Task>[] = [
  {
    accessorKey: 'url',
    header: '站点 URL',
    cell: ({ row }) => (
      <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-text1">
        {row.original.url}
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: '状态',
    cell: ({ row }) => <Badge variant={row.original.status} />,
    filterFn: (row, id, value: string) => (value === 'all' ? true : row.getValue(id) === value),
  },
  {
    accessorKey: 'progress',
    header: '进度',
    cell: ({ row }) => (
      <div className="w-[70px]">
        <ProgressBar value={row.original.progress} variant={row.original.status === 'error' ? 'error' : 'default'} />
      </div>
    ),
  },
  {
    accessorKey: 'itemCount',
    header: '商品数',
    cell: ({ row }) => (
      <div className="w-[52px] text-center text-text2">
        {row.original.status === 'pending' ? '—' : row.original.itemCount.toLocaleString('en-US')}
      </div>
    ),
  },
  {
    accessorKey: 'elapsed',
    header: '耗时',
    cell: ({ row }) => <div className="w-[42px] text-right text-[11px] text-text3">{row.original.elapsed}</div>,
  },
]

export function TaskTable({ tasks }: TaskTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'itemCount', desc: true }])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data: tasks,
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const statusFilter = (table.getColumn('status')?.getFilterValue() as string | undefined) ?? 'all'

  return (
    <div>
      <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-[10px]">
        <select
          value={statusFilter}
          onChange={(event) => table.getColumn('status')?.setFilterValue(event.target.value)}
          className="rounded-sm border border-border2 bg-surface px-[10px] py-1 text-[11px] text-text2 outline-none transition-colors focus:border-brand"
        >
          <option value="all">全部状态</option>
          <option value="running">运行中</option>
          <option value="done">完成</option>
          <option value="pending">等待中</option>
          <option value="error">报错</option>
        </select>

        <button
          type="button"
          onClick={() => table.getColumn('itemCount')?.toggleSorting(table.getState().sorting[0]?.desc ?? false)}
          className="rounded-sm border border-border2 bg-surface px-[10px] py-1 text-[11px] text-text2 transition-colors hover:bg-surface2 hover:text-text1"
        >
          商品数排序
        </button>
      </div>

      <div className="flex bg-surface2 px-4 py-[6px] text-[10px] font-semibold uppercase tracking-[0.04em] text-text3">
        {table.getFlatHeaders().map((header) => (
          <div
            key={header.id}
            className={
              header.id === 'url'
                ? 'flex-1'
                : header.id === 'status'
                  ? 'w-[62px]'
                  : header.id === 'progress'
                    ? 'w-[80px]'
                    : header.id === 'itemCount'
                      ? 'w-[52px] text-center'
                      : 'w-[42px] text-right'
            }
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        ))}
      </div>

      {table.getRowModel().rows.length ? (
        table.getRowModel().rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-[10px] border-b border-border px-4 py-[10px] text-xs transition-colors hover:bg-surface2"
          >
            {row.getVisibleCells().map((cell) => (
              <div
                key={cell.id}
                className={
                  cell.column.id === 'url'
                    ? 'flex-1'
                    : cell.column.id === 'status'
                      ? 'w-[62px]'
                      : cell.column.id === 'progress'
                        ? 'w-[80px]'
                        : cell.column.id === 'itemCount'
                          ? 'w-[52px]'
                          : 'w-[42px]'
                }
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ))}
          </div>
        ))
      ) : (
        <div className="px-5 py-10 text-center text-sm text-text3">当前筛选条件下没有任务</div>
      )}
    </div>
  )
}
