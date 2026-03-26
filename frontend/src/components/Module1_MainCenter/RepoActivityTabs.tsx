import React, { useRef, useState, useEffect } from 'react'
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
import OpenRankChart from './OpenRankChart'
import type { RepoResponse } from '../../types'
import { activityAPI } from '../../services/api'

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

interface RepoActivityTabsProps {
  repo: RepoResponse | null
  themeVersion?: number
  onOpenRankRefresh?: (repoId: string) => void
}

type TrendPoint = { date: string; count: number }

interface TrendState {
  loading: boolean
  error: string | null
  data: TrendPoint[] | null
}

type ActivityTab = 'commits' | 'issues' | 'openrank'

const _lastTabKey = 'openramp_repo_activity_last_tab'

const readLastTab = (): ActivityTab | null => {
  try {
    const raw = window.localStorage.getItem(_lastTabKey)
    if (raw === 'commits' || raw === 'issues' || raw === 'openrank') return raw
    return null
  } catch {
    return null
  }
}

const writeLastTab = (tab: ActivityTab) => {
  try {
    window.localStorage.setItem(_lastTabKey, tab)
  } catch {
  }
}

const _isoDate = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const buildCommitFallbackPoints = (weeks: number = 12): TrendPoint[] => {
  const now = new Date()
  const points: TrendPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i * 7)
    points.push({ date: _isoDate(d), count: 0 })
  }
  return points
}

const buildChartData = (points: TrendPoint[] | null, label: string, primary: string) => {
  const safePoints = points ?? []
  const labels = safePoints.map(p => p.date)
  const data = safePoints.map(p => p.count)
  return {
    labels,
    datasets: [
      {
        label,
        data,
        borderColor: primary,
        backgroundColor: (ctx: any) => {
          const chart = ctx?.chart
          const area = chart?.chartArea
          if (!area) return `${primary}33`
          const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
          g.addColorStop(0, `${primary}66`)
          g.addColorStop(0.6, `${primary}2e`)
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
}

const RepoActivityTabs: React.FC<RepoActivityTabsProps> = ({ repo, themeVersion = 0, onOpenRankRefresh }) => {
  const [activeTab, setActiveTab] = useState<ActivityTab>('commits')
  const [commitTrend, setCommitTrend] = useState<TrendState>({ loading: false, error: null, data: null })
  const [issueTrend, setIssueTrend] = useState<TrendState>({ loading: false, error: null, data: null })

  const trendCacheRef = useRef<{
    commits: Record<string, TrendPoint[]>
    issues: Record<string, TrendPoint[]>
  }>({ commits: {}, issues: {} })

  const isNetworkError = (e: any) => {
    const msg = String(e?.message || e || '')
    return msg === 'NETWORK_UNAVAILABLE' || msg.includes('NETWORK_UNAVAILABLE')
  }

  const setTab = (tab: ActivityTab) => {
    setActiveTab(tab)
    writeLastTab(tab)
  }

  useEffect(() => {
    if (!repo) return
    const repoId = repo.repo_id
    const last = readLastTab()
    const initial: ActivityTab = last ?? 'commits'
    setTab(initial)

    const cachedCommits = trendCacheRef.current.commits[repoId]
    const cachedIssues = trendCacheRef.current.issues[repoId]
    setCommitTrend({ loading: false, error: null, data: cachedCommits ?? null })
    setIssueTrend({ loading: false, error: null, data: cachedIssues ?? null })

    if (!last || last === 'commits') {
      void loadTrend('commits', repoId, { force: true })
    } else if (last === 'issues') {
      void loadTrend('issues', repoId, { force: true })
    } else {
      if (repoId && onOpenRankRefresh) onOpenRankRefresh(repoId)
    }
  }, [repo?.repo_id])

  const loadTrend = async (
    type: 'commits' | 'issues',
    repoId: string,
    opts?: { force?: boolean }
  ) => {
    if (!repoId) return
    if (type === 'commits') {
      if (!opts?.force) {
        const cached = trendCacheRef.current.commits[repoId]
        if (cached) {
          setCommitTrend({ loading: false, error: null, data: cached })
          return
        }
      }
      setCommitTrend(s => ({ ...s, loading: true, error: null }))
      try {
        const res = await activityAPI.getCommitTrend(repoId)
        const pts = (res.points || []) as TrendPoint[]
        trendCacheRef.current.commits[repoId] = pts
        setCommitTrend({ loading: false, error: null, data: pts })
      } catch (e: any) {
        if (isNetworkError(e)) {
          setCommitTrend({ loading: false, error: '网络错误，请稍后重试', data: null })
        } else {
          const pts: TrendPoint[] = []
          trendCacheRef.current.commits[repoId] = pts
          setCommitTrend({ loading: false, error: null, data: pts })
        }
      }
    } else {
      if (!opts?.force) {
        const cached = trendCacheRef.current.issues[repoId]
        if (cached) {
          setIssueTrend({ loading: false, error: null, data: cached })
          return
        }
      }
      setIssueTrend(s => ({ ...s, loading: true, error: null }))
      try {
        const res = await activityAPI.getIssueTrend(repoId)
        const pts = (res.points || []) as TrendPoint[]
        trendCacheRef.current.issues[repoId] = pts
        setIssueTrend({ loading: false, error: null, data: pts })
      } catch (e: any) {
        if (isNetworkError(e)) {
          setIssueTrend({ loading: false, error: '网络错误，请稍后重试', data: null })
        } else {
          const pts: TrendPoint[] = []
          trendCacheRef.current.issues[repoId] = pts
          setIssueTrend({ loading: false, error: null, data: pts })
        }
      }
    }
  }

  const renderBody = () => {
    if (!repo) {
      return (
        <div className="flex h-[200px] items-center justify-center text-text/50">
          请选择仓库
        </div>
      )
    }

    if (activeTab === 'openrank') {
      return (
        <OpenRankChart key={themeVersion} repo={repo} themeVersion={themeVersion} />
      )
    }

    const state = activeTab === 'commits' ? commitTrend : issueTrend
    const label = activeTab === 'commits' ? '提交次数' : 'Issue 数量'

    if (state.error) {
      return (
        <div className="flex h-[200px] items-center justify-center text-xs text-text/70">
          <div>{state.error}</div>
        </div>
      )
    }

    const primary = cssVar('--color-primary') || '#829c83'
    const text = cssVar('--color-text') || '#1c1f1e'
    const bg = cssVar('--color-background') || '#f8f9f8'
    const grid = cssVar('--color-grid') || 'rgba(209, 217, 211, 0.55)'
    const points =
      activeTab === 'commits' && (state.data == null || state.data.length === 0)
        ? buildCommitFallbackPoints(12)
        : (state.data ?? [])
    const chartData = buildChartData(points, label, primary)
    const labelsArr = (chartData.labels ?? []) as string[]
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
    const spanMonths =
      first && last ? Math.abs((last.y - first.y) * 12 + (last.m - first.m)) : 0
    const showDay = spanMonths <= 3
    const showYear = spanMonths >= 12
    const monthAbbr = (m: number) =>
      (['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const)[
        Math.max(1, Math.min(12, m)) - 1
      ]

    return (
      <div className="relative flex h-full w-full flex-col px-2 pb-2">
        <div className="min-h-0 flex-1 overflow-hidden">
        <Line
          key={themeVersion}
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            hover: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: bg,
                borderColor: primary,
                borderWidth: 1,
                titleColor: text,
                bodyColor: text,
                padding: 12
              }
            },
            scales: {
              x: {
                grid: {
                  color: grid
                },
                ticks: {
                  color: text,
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
                  color: grid
                },
                ticks: {
                  color: text
                }
              }
            }
          }}
        />
        </div>
        {state.loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/40 backdrop-blur-sm">
            <div className="rounded-md border border-border bg-surface/70 px-3 py-1.5 text-xs text-text/80">
              加载中...
            </div>
          </div>
        )}
      </div>
    )
  }

  const repoId = repo?.repo_id || ''

  return (
    <div className="flex h-full w-full flex-col p-3">
      <div className="mb-3 flex border-b border-border">
        <button
          className={`border-b-2 bg-transparent px-3 py-1.5 text-xs ${
            activeTab === 'commits' ? 'border-primary text-primary' : 'border-transparent text-text'
          }`}
          onClick={() => {
            setTab('commits')
            if (repoId) void loadTrend('commits', repoId)
          }}
        >
          Commit
        </button>
        <button
          className={`border-b-2 bg-transparent px-3 py-1.5 text-xs ${
            activeTab === 'issues' ? 'border-primary text-primary' : 'border-transparent text-text'
          }`}
          onClick={() => {
            setTab('issues')
            if (repoId) void loadTrend('issues', repoId)
          }}
        >
          Issues
        </button>
        <button
          className={`border-b-2 bg-transparent px-3 py-1.5 text-xs ${
            activeTab === 'openrank' ? 'border-primary text-primary' : 'border-transparent text-text'
          }`}
          onClick={() => {
            setTab('openrank')
            if (repoId && onOpenRankRefresh) onOpenRankRefresh(repoId)
          }}
        >
          openRank
        </button>
      </div>
      <div className="flex flex-1 items-stretch justify-center overflow-hidden">
        {renderBody()}
      </div>
    </div>
  )
}

export default RepoActivityTabs

