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
import { theme } from '../../styles/theme'
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
}

type TrendPoint = { date: string; count: number }

interface TrendState {
  loading: boolean
  error: string | null
  data: TrendPoint[] | null
}

const buildChartData = (points: TrendPoint[] | null, label: string) => {
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
        borderColor: theme.primary,
        backgroundColor: `${theme.primary}40`,
        tension: 0.4
      }
    ]
  }
}

const RepoActivityTabs: React.FC<RepoActivityTabsProps> = ({ repo }) => {
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
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
          color: theme.text,
          opacity: 0.5
        }}>
          请选择仓库
        </div>
      )
    }

    if (activeTab === 'openrank') {
      return (
        <OpenRankChart
          repo={repo}
        />
      )
    }

    const state = activeTab === 'commits' ? commitTrend : issueTrend
    const label = activeTab === 'commits' ? '提交次数' : 'Issue 数量'
    const title = activeTab === 'commits' ? 'Commit 趋势图' : 'Issue 趋势图）'

    if (state.loading) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
          color: theme.text,
          opacity: 0.7
        }}>
          加载中...
        </div>
      )
    }

    if (state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
          color: theme.text,
          opacity: 0.7,
          fontSize: '12px'
        }}>
          <div style={{ marginBottom: 8 }}>{title}</div>
          <div>{state.error}</div>
        </div>
      )
    }

    const chartData = buildChartData(state.data, label)
    if (!chartData.labels.length) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '200px',
          color: theme.text,
          opacity: 0.5
        }}>
          <div style={{ marginBottom: 8 }}>{title}</div>
          <div>暂无数据</div>
        </div>
      )
    }

    return (
      <div style={{ padding: '0 8px 8px 8px', width: '100%', height: '100%' }}>
        <div style={{ marginBottom: 8, fontSize: 12, color: theme.text }}>{title}</div>
        <Line
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
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
      </div>
    )
  }

  const repoId = repo?.repo_id || ''

  return (
    <div style={{
      padding: '12px 16px',
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', marginBottom: 12, borderBottom: `1px solid ${theme.border}` }}>
        <button
          style={{
            padding: '6px 12px',
            fontSize: 12,
            border: 'none',
            borderBottom: activeTab === 'commits' ? `2px solid ${theme.primary}` : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'commits' ? theme.primary : theme.text,
            cursor: 'pointer'
          }}
          onClick={() => {
            setActiveTab('commits')
            if (repoId) loadTrend('commits', repoId)
          }}
        >
          Commit
        </button>
        <button
          style={{
            padding: '6px 12px',
            fontSize: 12,
            border: 'none',
            borderBottom: activeTab === 'issues' ? `2px solid ${theme.primary}` : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'issues' ? theme.primary : theme.text,
            cursor: 'pointer'
          }}
          onClick={() => {
            setActiveTab('issues')
            if (repoId) loadTrend('issues', repoId)
          }}
        >
          Issues
        </button>
        <button
          style={{
            padding: '6px 12px',
            fontSize: 12,
            border: 'none',
            borderBottom: activeTab === 'openrank' ? `2px solid ${theme.primary}` : '2px solid transparent',
            backgroundColor: 'transparent',
            color: activeTab === 'openrank' ? theme.primary : theme.text,
            cursor: 'pointer'
          }}
          onClick={() => {
            setActiveTab('openrank')
          }}
        >
          openRank
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {renderBody()}
      </div>
    </div>
  )
}

export default RepoActivityTabs

