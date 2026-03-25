import React, { useState, useEffect } from 'react'
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
import OpenRankChart from './OpenRankChart'
import type { RepoResponse } from '../../types'
import { activityAPI } from '../../services/api'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

interface RepoActivityTabsProps {
  repo: RepoResponse | null
  themeVersion?: number
}

type TrendPoint = { date: string; count: number }

interface TrendState {
  loading: boolean
  error: string | null
  data: TrendPoint[] | null
}

const buildChartData = (points: TrendPoint[] | null, label: string, primary: string) => {
  if (!points || points.length === 0) {
    return { labels: [], datasets: [] }
  }
  const labels = points.map(p => p.date)
  const data = points.map(p => p.count)
  return {
    labels,
    datasets: [
      {
        label,
        data,
        borderColor: primary,
        backgroundColor: `${primary}40`,
        tension: 0.4
      }
    ]
  }
}

const RepoActivityTabs: React.FC<RepoActivityTabsProps> = ({ repo, themeVersion = 0 }) => {
  const [activeTab, setActiveTab] = useState<'commits' | 'issues' | 'openrank'>('commits')
  const [commitTrend, setCommitTrend] = useState<TrendState>({ loading: false, error: null, data: null })
  const [issueTrend, setIssueTrend] = useState<TrendState>({ loading: false, error: null, data: null })

  useEffect(() => {
    if (!repo) return
    setActiveTab('commits')
    setCommitTrend({ loading: false, error: null, data: null })
    setIssueTrend({ loading: false, error: null, data: null })
    loadTrend('commits', repo.repo_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo?.repo_id])

  const loadTrend = async (type: 'commits' | 'issues', repoId: string) => {
    if (!repoId) return
    if (type === 'commits') {
      if (commitTrend.data || commitTrend.loading) return
      setCommitTrend(s => ({ ...s, loading: true, error: null }))
      try {
        const res = await activityAPI.getCommitTrend(repoId)
        setCommitTrend({ loading: false, error: null, data: res.points || [] })
      } catch (e: any) {
        setCommitTrend({ loading: false, error: e?.message || '加载失败', data: null })
      }
    } else {
      if (issueTrend.data || issueTrend.loading) return
      setIssueTrend(s => ({ ...s, loading: true, error: null }))
      try {
        const res = await activityAPI.getIssueTrend(repoId)
        setIssueTrend({ loading: false, error: null, data: res.points || [] })
      } catch (e: any) {
        setIssueTrend({ loading: false, error: e?.message || '加载失败', data: null })
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
    const title = activeTab === 'commits' ? 'Commit 趋势图' : 'Issue 趋势图'

    if (state.loading) {
      return (
        <div className="flex h-[200px] items-center justify-center text-text/70">
          加载中...
        </div>
      )
    }

    if (state.error) {
      return (
        <div className="flex h-[200px] flex-col items-center justify-center text-xs text-text/70">
          <div className="mb-2">{title}</div>
          <div>{state.error}</div>
        </div>
      )
    }

    const primary = cssVar('--color-primary') || '#84a98c'
    const text = cssVar('--color-text') || '#222222'
    const bg = cssVar('--color-background') || '#f0f2f5'
    const grid = cssVar('--color-grid') || 'rgba(209, 217, 211, 0.55)'
    const chartData = buildChartData(state.data, label, primary)
    if (!chartData.labels.length) {
      return (
        <div className="flex h-[200px] flex-col items-center justify-center text-text/50">
          <div className="mb-2">{title}</div>
          <div>暂无数据</div>
        </div>
      )
    }

    return (
      <div className="flex h-full w-full flex-col px-2 pb-2">
        <div className="mb-2 shrink-0 text-xs text-text">{title}</div>
        <div className="min-h-0 flex-1 overflow-hidden">
        <Line
          key={themeVersion}
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
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
                  maxRotation: 45,
                  minRotation: 45,
                  font: { size: 10 }
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
            setActiveTab('commits')
            if (repoId) loadTrend('commits', repoId)
          }}
        >
          Commit
        </button>
        <button
          className={`border-b-2 bg-transparent px-3 py-1.5 text-xs ${
            activeTab === 'issues' ? 'border-primary text-primary' : 'border-transparent text-text'
          }`}
          onClick={() => {
            setActiveTab('issues')
            if (repoId) loadTrend('issues', repoId)
          }}
        >
          Issues
        </button>
        <button
          className={`border-b-2 bg-transparent px-3 py-1.5 text-xs ${
            activeTab === 'openrank' ? 'border-primary text-primary' : 'border-transparent text-text'
          }`}
          onClick={() => {
            setActiveTab('openrank')
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

