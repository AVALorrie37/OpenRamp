import React, { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { cssVar } from '../../utils/cssVars'
import type { RepoResponse } from '../../types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

interface OpenRankChartProps {
  repo: RepoResponse | null
  themeVersion?: number
}

const OpenRankChart: React.FC<OpenRankChartProps> = ({ repo, themeVersion = 0 }) => {
  const chartData = useMemo(() => {
    if (!repo?.raw_metrics?.openrank) {
      return {
        labels: [],
        datasets: []
      }
    }

    const openrankStr = repo.raw_metrics.openrank
    const entries = openrankStr.split(',').slice(-30)
    const labels: string[] = []
    const data: number[] = []

    entries.forEach(entry => {
      const [date, value] = entry.split(':')
      if (date && value) {
        labels.push(date)
        data.push(parseFloat(value))
      }
    })

    const primary = cssVar('--color-primary') || '#84a98c'
    return {
      labels,
      datasets: [
        {
          label: '贡献者数量',
          data,
          borderColor: primary,
          backgroundColor: `${primary}40`,
          tension: 0.4
        }
      ]
    }
  }, [repo, themeVersion])

  const hasData = chartData.labels.length > 0
  const rawNote = (repo?.raw_metrics as any)?.note as string | undefined
  const statusText =
    !repo
      ? '暂无数据'
      : rawNote === 'no OpenDigger data'
        ? '暂无 OpenDigger 数据'
        : !hasData
          ? '暂无数据'
          : null

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-4">
      <h4 className="mb-4 mt-0 text-base text-text">
        OpenRank活跃度图（近30天）
      </h4>
      {statusText ? (
        <div className="flex h-[200px] items-center justify-center text-text/50">
          {statusText}
        </div>
      ) : (
        <div className="min-h-0 w-full flex-1 overflow-hidden">
          <Line
            key={themeVersion}
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  backgroundColor: cssVar('--color-background') || '#f0f2f5',
                  borderColor: cssVar('--color-primary') || '#84a98c',
                  borderWidth: 1,
                  titleColor: cssVar('--color-text') || '#222222',
                  bodyColor: cssVar('--color-text') || '#222222',
                  padding: 12
                }
              },
              scales: {
                x: {
                  grid: {
                    color: cssVar('--color-grid') || 'rgba(209, 217, 211, 0.55)'
                  },
                  ticks: {
                    color: cssVar('--color-text') || '#222222',
                    maxRotation: 45,
                    minRotation: 45,
                    font: { size: 10 }
                  }
                },
                y: {
                  beginAtZero: true,
                  grid: {
                    color: cssVar('--color-grid') || 'rgba(209, 217, 211, 0.55)'
                  },
                  ticks: {
                    color: cssVar('--color-text') || '#222222'
                  }
                }
              }
            }}
          />
        </div>
      )}
    </div>
  )
}

export default OpenRankChart
