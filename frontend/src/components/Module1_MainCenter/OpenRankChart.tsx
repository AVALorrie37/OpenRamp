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
  onRefreshRepo?: (repo: RepoResponse) => void
}

const OpenRankChart: React.FC<OpenRankChartProps> = ({ repo, onRefreshRepo }) => {
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
          tension: 0.4
        }
      ]
    }
  }, [repo])

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
    <div style={{ 
      padding: '16px',
      height: '100%', 
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
      }}>
      <div style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginBottom: '16px'
      }}>
        <h4 style={{ margin: 0, fontSize: '14px', color: theme.text }}>
          OpenRank活跃度图（近30天）
        </h4>
        {repo && onRefreshRepo && (
          <button
            onClick={() => onRefreshRepo(repo)}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '4px',
              border: `1px solid ${theme.primary}`,
              backgroundColor: theme.white,
              color: theme.primary,
              cursor: 'pointer'
            }}
          >
            刷新
          </button>
        )}
      </div>
      {statusText ? (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
          color: theme.text,
          opacity: 0.5
        }}>
          {statusText}
        </div>
      ) : (
        <Line
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: true,
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
        />
      )}
    </div>
  )
}

export default OpenRankChart
