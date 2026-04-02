import React from 'react'
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
  themeVersion?: number
  language?: 'chinese' | 'english'
}

const RadarPlaceholder: React.FC<RadarPlaceholderProps> = ({ isActive, matchData, baseWeights, onBaseWeightsChange, themeVersion = 0, language = 'chinese' }) => {
  if (!isActive && !matchData) {
    // 未登录状态
    return (
      <div className="p-10 text-center text-lg text-text/60">
        {language === 'english' ? 'Unlock after confirming skills with AI assistant' : '与AI助手对话确认技能后解锁'}
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
        repoId={matchData.repo_full_name}
        embedded={true}
        themeVersion={themeVersion}
        language={language}
      />
    )
  } else {
    // 已登录但无数据
    return (
      <div className="p-10 text-center text-lg text-text/40">
        {language === 'english' ? 'Click a repository to show match details' : '点击仓库，查看匹配详情'}
      </div>
    )
  }
}

export default RadarPlaceholder