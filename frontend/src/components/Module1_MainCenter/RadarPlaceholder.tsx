import React from 'react'
import { theme } from '../../styles/theme'
import MatchRadarChart from '../Module5_RadarVisualization/MatchRadarChart'

interface RadarPlaceholderProps {
  isActive: boolean
  matchData?: any
  baseWeights?: {
    w_skill: number
    w_activity: number
    w_demand: number
  }
  onBaseWeightsChange?: (next: { w_skill: number; w_activity: number; w_demand: number }) => void
}

const RadarPlaceholder: React.FC<RadarPlaceholderProps> = ({ isActive, matchData, baseWeights, onBaseWeightsChange }) => {
  if (!isActive && !matchData) {
    // 未登录状态
    return (
      <div style={{
        textAlign: 'center',
        color: theme.text,
        opacity: 0.6,
        fontSize: '16px',
        padding: '40px'
      }}>
        与AI助手对话确认技能后解锁
      </div>
    )
  } else if (matchData) {
    // 有匹配数据，显示内嵌雷达图
    return (
      <MatchRadarChart
        isOpen={true}
        onClose={() => {}}
        matchData={{
          skill: matchData.breakdown.skill,
          activity: matchData.breakdown.activity,
          demand: matchData.breakdown.demand,
          repoName: matchData.repo_name || '',
          matchScore: matchData.match_score
        }}
        baseWeights={baseWeights}
        dynamicWeights={matchData.dynamic_weights}
        onBaseWeightsChange={onBaseWeightsChange}
        embedded={true}  // 启用内嵌模式
      />
    )
  } else {
    // 已登录但无数据
    return (
      <div style={{
        textAlign: 'center',
        color: theme.text,
        opacity: 0.4,
        fontSize: '14px',
        padding: '40px'
      }}>
        点击仓库查看匹配详情
      </div>
    )
  }
}

export default RadarPlaceholder