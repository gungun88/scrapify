'use client'

import { Line, LineChart, ResponsiveContainer } from 'recharts'

interface SparkLineProps {
  data: number[]
  color: string
  height?: number
}

export function SparkLine({ data, color, height = 40 }: SparkLineProps) {
  const chartData = data.map((value, index) => ({ index, value }))

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
