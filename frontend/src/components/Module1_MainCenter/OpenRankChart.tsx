import React, { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
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
  Filler,
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

    const primary = cssVar('--color-primary') || '#829c83'
    return {
      labels,
      datasets: [
        {
          label: '贡献者数量',
          data,
          borderColor: primary,
          backgroundColor: (ctx: any) => {
            const chart = ctx?.chart
            const area = chart?.chartArea
            if (!area) return `${primary}33`
            const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
            g.addColorStop(0, `${primary}88`)
            g.addColorStop(0.7, `${primary}66`)
            g.addColorStop(1, `${primary}00`)
            return g
          },
          fill: true,
          borderWidth: 1.5,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 3,
          pointHitRadius: 10,
          pointBackgroundColor: primary,
          pointHoverBackgroundColor: primary,
          pointBorderWidth: 0,
          pointHoverBorderWidth: 0
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
              interaction: { mode: 'index', intersect: false },
              hover: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  display: false
                },
                tooltip: {
                  backgroundColor: cssVar('--color-background') || '#f8f9f8',
                  borderColor: cssVar('--color-primary') || '#829c83',
                  borderWidth: 1,
                  titleColor: cssVar('--color-text') || '#1c1f1e',
                  bodyColor: cssVar('--color-text') || '#1c1f1e',
                  padding: 12
                }
              },
              scales: {
                x: {
                  grid: {
                    color: cssVar('--color-grid') || 'rgba(209, 217, 211, 0.55)'
                  },
                  ticks: {
                    color: cssVar('--color-text') || '#1c1f1e',
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
                    color: cssVar('--color-text') || '#1c1f1e'
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
