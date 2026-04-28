'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartPoint } from '@/lib/types'

interface TrendChartProps {
  data: ChartPoint[]
}

function formatYAxis(value: number) {
  return `${(value / 1000).toFixed(0)}k`
}

export function TrendChart({ data }: TrendChartProps) {
  const formatTooltipValue = (value: unknown) => {
    const numericValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Array.isArray(value)
            ? Number(value[0] ?? 0)
            : 0
    return [`${numericValue.toLocaleString('en-US')} items`, '采集量'] as [string, string]
  }

  return (
    <div className="h-[300px] px-4 py-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5B47E0" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#5B47E0" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#A09DB8', fontSize: 11 }} />
          <YAxis
            tickFormatter={formatYAxis}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#A09DB8', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: '#5B47E0', strokeDasharray: '4 4' }}
            contentStyle={{
              backgroundColor: '#1A1824',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
            }}
            labelStyle={{ color: '#A09DB8', marginBottom: 4 }}
            formatter={formatTooltipValue}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#5B47E0"
            strokeWidth={3}
            fill="url(#trendFill)"
            dot={{ r: 0 }}
            activeDot={{ r: 4, fill: '#5B47E0', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
