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
import { theme } from '../../styles/theme'
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
}

const OpenRankChart: React.FC<OpenRankChartProps> = ({ repo }) => {
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

    return {
      labels,
      datasets: [
        {
          label: '贡献者数量',
          data,
          borderColor: theme.primary,
          backgroundColor: `${theme.primary}40`,
          tension: 0.4,
          fill: true
        }
      ]
    }
  }, [repo])

  if (!repo || !chartData.labels.length) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        color: theme.text,
        opacity: 0.5
      }}>
        暂无数据
      </div>
    )
  }

  return (
    <div style={{ padding: '16px' }}>
      <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', color: theme.text }}>
        OpenRank活跃度图（近30天）
      </h4>
      <Line
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: theme.white,
              borderColor: theme.primary,
              borderWidth: 1,
              titleColor: theme.text,
              bodyColor: theme.text,
              padding: 12
            }
          },
          scales: {
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 45,
                font: { size: 10 }
              }
            },
            y: {
              beginAtZero: true
            }
          }
        }}
        height={200}
      />
    </div>
  )
}

export default OpenRankChart
