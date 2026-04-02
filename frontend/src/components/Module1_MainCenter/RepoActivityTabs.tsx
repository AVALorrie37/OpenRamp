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
  language?: 'chinese' | 'english'
}

type TrendPoint = { date: string; count: number }

interface TrendState {
  loading: boolean
  error: string | null
  data: TrendPoint[] | null
}

interface PendingFallbackState {
  repoId: string
  cacheDate: string
  points: TrendPoint[]
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

const RepoActivityTabs: React.FC<RepoActivityTabsProps> = ({ repo, themeVersion = 0, onOpenRankRefresh, language = 'chinese' }) => {
  const [activeTab, setActiveTab] = useState<ActivityTab>('commits')
  const [commitTrend, setCommitTrend] = useState<TrendState>({ loading: false, error: null, data: null })
  const [issueTrend, setIssueTrend] = useState<TrendState>({ loading: false, error: null, data: null })
  const [pendingCommitFallback, setPendingCommitFallback] = useState<PendingFallbackState | null>(null)
  const [pendingIssueFallback, setPendingIssueFallback] = useState<PendingFallbackState | null>(null)

  const trendCacheRef = useRef<{
    commits: Record<string, TrendPoint[]>
    issues: Record<string, TrendPoint[]>
  }>({ commits: {}, issues: {} })

  const isNetworkError = (e: any) => {
    const msg = String(e?.message || e || '')
    return (
      msg === 'NETWORK_UNAVAILABLE' ||
      msg.includes('NETWORK_UNAVAILABLE') ||
      msg.includes('GITHUB_COMMIT_TREND_NETWORK_ERROR') ||
      msg.includes('GITHUB_ISSUE_TREND_NETWORK_ERROR')
    )
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
        if (pendingCommitFallback?.repoId === repoId) setPendingCommitFallback(null)
        setCommitTrend({ loading: false, error: null, data: pts })
      } catch (e: any) {
        if (isNetworkError(e)) {
          try {
            const fallback = await activityAPI.getCommitTrendCachedFallback(repoId)
            const cachedPts = (fallback.points || []) as TrendPoint[]
            setPendingCommitFallback({
              repoId,
              cacheDate: fallback.cache_date,
              points: cachedPts
            })
            setCommitTrend({ loading: false, error: null, data: null })
          } catch {
            setCommitTrend({ loading: false, error: '网络错误，请稍后重试', data: null })
          }
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
        if (pendingIssueFallback?.repoId === repoId) setPendingIssueFallback(null)
        setIssueTrend({ loading: false, error: null, data: pts })
      } catch (e: any) {
        if (isNetworkError(e)) {
          try {
            const fallback = await activityAPI.getIssueTrendCachedFallback(repoId, 30)
            const cachedPts = (fallback.points || []) as TrendPoint[]
            setPendingIssueFallback({
              repoId,
              cacheDate: fallback.cache_date,
              points: cachedPts
            })
            setIssueTrend({ loading: false, error: null, data: null })
          } catch {
            setIssueTrend({ loading: false, error: '网络错误，请稍后重试', data: null })
          }
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
          {language === 'english' ? 'Click a repository' : '请选择仓库'}
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
    const pendingFallback =
      activeTab === 'commits'
        ? pendingCommitFallback && pendingCommitFallback.repoId === repo.repo_id
          ? pendingCommitFallback
          : null
        : pendingIssueFallback && pendingIssueFallback.repoId === repo.repo_id
          ? pendingIssueFallback
          : null

    if (state.error) {
      return (
        <div className="flex h-[200px] items-center justify-center text-xs text-text/70">
          <div>{state.error}</div>
        </div>
      )
    }

    if (pendingFallback) {
      return (
        <div className="relative flex h-full w-full flex-col px-2 pb-2">
          <div className="min-h-0 flex-1 overflow-hidden" />
          <div className="absolute inset-0 flex items-center justify-center bg-surface/40 backdrop-blur-sm">
            <div className="max-w-[320px] rounded-md border border-border bg-surface/70 px-3 py-3 text-center text-xs text-text/80">
              <div className="mb-3">当前网络不可用，检测到 {pendingFallback.cacheDate} 的缓存数据。</div>
              <div className="flex items-center justify-center gap-2">
                <button
                  className="rounded border border-primary bg-primary px-2.5 py-1 text-xs text-white"
                  onClick={() => {
                    if (activeTab === 'commits') {
                      trendCacheRef.current.commits[repo.repo_id] = pendingFallback.points
                      setPendingCommitFallback(null)
                      setCommitTrend({ loading: false, error: null, data: pendingFallback.points })
                    } else {
                      trendCacheRef.current.issues[repo.repo_id] = pendingFallback.points
                      setPendingIssueFallback(null)
                      setIssueTrend({ loading: false, error: null, data: pendingFallback.points })
                    }
                  }}
                >
                  加载缓存
                </button>
                <button
                  className="rounded border border-border bg-transparent px-2.5 py-1 text-xs text-text/80"
                  onClick={() => {
                    if (activeTab === 'commits') {
                      setPendingCommitFallback(null)
                      setCommitTrend({ loading: false, error: '网络错误，请稍后重试', data: null })
                    } else {
                      setPendingIssueFallback(null)
                      setIssueTrend({ loading: false, error: '网络错误，请稍后重试', data: null })
                    }
                  }}
                >
                  暂不加载
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    const primary = cssVar('--color-primary') || '#1bb3ad'
    const text = cssVar('--color-text') || '#0f172a'
    const bg = cssVar('--color-background') || '#f6f8fb'
    const grid = cssVar('--color-grid') || 'rgba(15, 23, 42, 0.08)'
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
  const refreshHint = language === 'english' ? 'Refresh' : '刷新'

  return (
    <div className="glass-content-shadow flex h-full w-full flex-col p-3">
      <div className="mb-3 flex items-center gap-2">
        <button
          className={`rounded-t-md border border-[var(--tab-selected-border)] px-3 py-1.5 text-xs transition ${
            activeTab === 'commits'
              ? 'bg-[var(--tab-selected-bg)] font-medium text-[var(--tab-selected-text)] hover:brightness-[0.99]'
              : 'bg-[var(--tab-unselected-bg)] font-medium text-[var(--tab-unselected-text)] hover:bg-[var(--tab-unselected-hover-bg)]'
          }`}
          onClick={() => {
            setTab('commits')
            if (repoId) void loadTrend('commits', repoId)
          }}
        >
          Commits
        </button>
        <button
          className={`rounded-t-md border border-[var(--tab-selected-border)] px-3 py-1.5 text-xs transition ${
            activeTab === 'issues'
              ? 'bg-[var(--tab-selected-bg)] font-medium text-[var(--tab-selected-text)] hover:brightness-[0.99]'
              : 'bg-[var(--tab-unselected-bg)] font-medium text-[var(--tab-unselected-text)] hover:bg-[var(--tab-unselected-hover-bg)]'
          }`}
          onClick={() => {
            setTab('issues')
            if (repoId) void loadTrend('issues', repoId)
          }}
        >
          Issues
        </button>
        <button
          className={`rounded-t-md border border-[var(--tab-selected-border)] px-3 py-1.5 text-xs transition ${
            activeTab === 'openrank'
              ? 'bg-[var(--tab-selected-bg)] font-medium text-[var(--tab-selected-text)] hover:brightness-[0.99]'
              : 'bg-[var(--tab-unselected-bg)] font-medium text-[var(--tab-unselected-text)] hover:bg-[var(--tab-unselected-hover-bg)]'
          }`}
          onClick={() => {
            setTab('openrank')
            if (repoId && onOpenRankRefresh) onOpenRankRefresh(repoId)
          }}
        >
          openRank
        </button>
        <button
          className="ml-auto flex items-center gap-1 rounded-full border border-primary bg-transparent px-2.5 py-1.5 text-xs text-primary transition"
          onClick={() => {
            if (!repoId) return
            if (activeTab === 'commits') {
              void loadTrend('commits', repoId, { force: true })
            } else if (activeTab === 'issues') {
              void loadTrend('issues', repoId, { force: true })
            } else if (onOpenRankRefresh) {
              onOpenRankRefresh(repoId)
            }
          }}
          aria-label={refreshHint}
          title={refreshHint}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M21.71,10.29a1,1,0,0,0-1.42,0L19,11.59V7a3,3,0,0,0-3-3H6A1,1,0,0,0,6,6H16a1,1,0,0,1,1,1v4.59l-1.29-1.3a1,1,0,0,0-1.42,1.42l3,3a1,1,0,0,0,1.42,0l3-3A1,1,0,0,0,21.71,10.29Z" />
            <path d="M18,18H8a1,1,0,0,1-1-1V12.41l1.29,1.3a1,1,0,0,0,1.42,0,1,1,0,0,0,0-1.42l-3-3a1,1,0,0,0-1.42,0l-3,3a1,1,0,0,0,1.42,1.42L5,12.41V17a3,3,0,0,0,3,3H18a1,1,0,0,0,0-2Z" opacity="0.7" />
          </svg>
        </button>
      </div>
      <div className="flex flex-1 items-stretch justify-center overflow-hidden">
        {renderBody()}
      </div>
    </div>
  )
}

export default RepoActivityTabs

