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
    const isQuarterLabel = (s: string) => {
      const t = String(s || '').trim()
      return /^\d{4}\s*Q[1-4]$/i.test(t) || /^\d{4}-Q[1-4]$/i.test(t) || /^\d{4}Q[1-4]$/i.test(t)
    }
    const parseDayOrMonth = (s: string) => {
      const t = String(s || '').trim()
      const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
      if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`
      const m2 = /^(\d{4})-(\d{2})$/.exec(t)
      if (m2) return `${m2[1]}-${m2[2]}-01`
      return null
    }

    entries.forEach(entry => {
      const [date, value] = entry.split(':')
      if (date && value) {
        if (isQuarterLabel(date)) return
        const normalized = parseDayOrMonth(date)
        if (!normalized) return
        const v = parseFloat(value)
        if (!Number.isFinite(v)) return
        labels.push(normalized)
        data.push(v)
      }
    })

    const primary = cssVar('--color-primary') || '#1bb3ad'
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
  const labelsArr = (chartData.labels ?? []) as string[]
  const toYm = (s: string) => {
    const t = String(s || '').trim()
    const m = /^(\d{4})-(\d{2})/.exec(t)
    return m ? `${m[1]}-${m[2]}` : t
  }
  const parseYmd = (s: string) => {
    const [yy, mm, dd] = String(s || '').split('-')
    const y = Number(yy)
    const m = Number(mm)
    const d = Number(dd)
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
    return { y, m, d }
  }
  const first = labelsArr.length ? parseYmd(labelsArr[0]) : null
  const last = labelsArr.length ? parseYmd(labelsArr[labelsArr.length - 1]) : null
  const spanMonths = first && last ? Math.abs((last.y - first.y) * 12 + (last.m - first.m)) : 0
  const showDay = spanMonths <= 3
  const showYear = spanMonths >= 12
  const monthAbbr = (m: number) =>
    (['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const)[
      Math.max(1, Math.min(12, m)) - 1
    ]
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
                  backgroundColor: cssVar('--color-background') || '#f6f8fb',
                  borderColor: cssVar('--color-primary') || '#1bb3ad',
                  borderWidth: 1,
                  titleColor: cssVar('--color-text') || '#0f172a',
                  bodyColor: cssVar('--color-text') || '#0f172a',
                  padding: 12,
                  callbacks: {
                    title: (items: any[]) => {
                      const raw = items?.[0]?.label ?? ''
                      return toYm(String(raw))
                    }
                  }
                }
              },
              scales: {
                x: {
                  grid: {
                    color: cssVar('--color-grid') || 'rgba(15, 23, 42, 0.08)'
                  },
                  ticks: {
                    color: cssVar('--color-text') || '#0f172a',
                    maxRotation: 0,
                    minRotation: 0,
                    autoSkip: false,
                    maxTicksLimit: 6,
                    padding: 6,
                    font: { size: 10 },
                    callback: function (_value: any, index: number, ticks: any[]) {
                      const n = Array.isArray(ticks) ? ticks.length : 0
                      if (n && index === n - 1) return ''
                      const desired = 6
                      const step = n > desired ? Math.ceil(n / desired) : 1
                      if (step > 1 && index % step !== 0) return ''

                      const raw = labelsArr[index] ?? ''
                      const p = parseYmd(raw)
                      if (!p) return raw
                      const dd = String(p.d).padStart(2, '0')
                      if (index === 0 || p.d === 1) {
                        const mon = monthAbbr(p.m)
                        if (!showYear) return mon
                        return [`${p.y}`, mon]
                      }
                      if (!showDay) return ''
                      return dd
                    }
                  }
                },
                y: {
                  beginAtZero: true,
                  grid: {
                    color: cssVar('--color-grid') || 'rgba(15, 23, 42, 0.08)'
                  },
                  ticks: {
                    color: cssVar('--color-text') || '#0f172a'
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
