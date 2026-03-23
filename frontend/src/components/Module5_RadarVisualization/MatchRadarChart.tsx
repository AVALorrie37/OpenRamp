import React, { useState, useEffect, type FC } from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer
} from 'recharts'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cssVar } from '../../utils/cssVars'
import Modal from '../shared/Modal'

interface MatchRadarChartProps {
  isOpen: boolean
  onClose: () => void
  matchData: {
    skill: number
    activity: number
    demand: number
    repoName: string
    matchScore: number
  } | null
  embedded?: boolean
  baseWeights?: {
    w_skill: number
    w_activity: number
    w_demand: number
  }
  dynamicWeights?: {
    w_skill: number
    w_activity: number
    w_demand: number
    c_data: number
  }
  onBaseWeightsChange?: (next: { w_skill: number; w_activity: number; w_demand: number }) => void
  themeVersion?: number
  language?: 'chinese' | 'english'
}

const MatchRadarChart: FC<MatchRadarChartProps> = ({ 
  isOpen, 
  onClose, 
  matchData, 
  embedded = false,
  baseWeights,
  dynamicWeights,
  onBaseWeightsChange,
  themeVersion = 0,
  language = 'chinese'
}) => {
  if (!matchData) return null
  const primary = cssVar('--color-primary') || '#7FB069'
  const text = cssVar('--color-text') || '#2C3E2D'
  const grid = cssVar('--color-grid') || 'rgba(209, 217, 211, 0.55)'

  const defaultBase = {
    w_skill: 0.5,
    w_activity: 0.3,
    w_demand: 0.2
  }

  const [localWeights, setLocalWeights] = useState(baseWeights || defaultBase)

  useEffect(() => {
    setLocalWeights(baseWeights || defaultBase)
  }, [baseWeights?.w_skill, baseWeights?.w_activity, baseWeights?.w_demand])

  const labels = language === 'english'
    ? {
        skillMatch: 'Skill Match',
        projectActivity: 'Project Activity',
        communityDemand: 'Community Demand',
        overallMatch: 'Overall Match',
        matchDegree: 'Match',
        weightAdjust: 'Weight Adjustment'
      }
    : {
        skillMatch: '技能匹配度',
        projectActivity: '项目活跃度',
        communityDemand: '社区需求热度',
        overallMatch: '匹配总分',
        matchDegree: '匹配度',
        weightAdjust: '权重调节'
      }

  const data = [
    {
      subject: labels.skillMatch,
      value: matchData.skill * 100,
      fullMark: 100
    },
    {
      subject: labels.projectActivity,
      value: matchData.activity * 100,
      fullMark: 100
    },
    {
      subject: labels.communityDemand,
      value: matchData.demand * 100,
      fullMark: 100
    }
  ]

  const effectiveWeights = dynamicWeights || baseWeights || defaultBase

  const applyWeights = (next: { w_skill: number; w_activity: number; w_demand: number }) => {
    if (!onBaseWeightsChange) return
    const rounded = {
      w_skill: Math.round(next.w_skill * 10) / 10,
      w_activity: Math.round(next.w_activity * 10) / 10,
      w_demand: Math.round(next.w_demand * 10) / 10
    }
    const sum = rounded.w_skill + rounded.w_activity + rounded.w_demand
    if (sum <= 0) return
    onBaseWeightsChange({
      w_skill: rounded.w_skill / sum,
      w_activity: rounded.w_activity / sum,
      w_demand: rounded.w_demand / sum
    })
  }

  const handleInputChange = (key: 'w_skill' | 'w_activity' | 'w_demand', raw: string) => {
    const value = parseFloat(raw)
    if (Number.isNaN(value)) {
      setLocalWeights(prev => ({ ...prev, [key]: 0 }))
      return
    }
    const clamped = Math.min(1, Math.max(0, value))
    setLocalWeights(prev => ({ ...prev, [key]: clamped }))
  }

  const handleInputKeyDown = (key: 'w_skill' | 'w_activity' | 'w_demand', e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyWeights(localWeights)
    } else if (e.key === 'Escape') {
      setLocalWeights(defaultBase)
      applyWeights(defaultBase)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const delta = e.key === 'ArrowUp' ? 0.1 : -0.1
      setLocalWeights(prev => {
        const next = {
          ...prev,
          [key]: Math.min(1, Math.max(0, parseFloat((prev[key] + delta).toFixed(1))))
        }
        return next
      })
    }
  }

  const formulaHtml = katex.renderToString(
    "\\mathrm{MatchScore} = w_1' \\cdot S_{\\mathrm{skill}} + w_2' \\cdot S_{\\mathrm{activity}} + w_3' \\cdot S_{\\mathrm{demand}}",
    { displayMode: false, throwOnError: false }
  )

  const weightHtml = katex.renderToString(
    `\\begin{aligned}
    w_1' &= ${Math.round(effectiveWeights.w_skill * 100) / 100} \\quad
    w_2' &= ${Math.round(effectiveWeights.w_activity * 100) / 100}  \\quad
    w_3' &= ${Math.round(effectiveWeights.w_demand * 100) / 100} \\quad
    ${dynamicWeights ? `C_{\\mathrm{data}} &= ${Math.round(dynamicWeights.c_data * 100)}\\%` : ''}
    \\end{aligned}`,
    { displayMode: false, throwOnError: false }
  )

  const chartContent = (
    <div className={`flex h-full flex-col items-center ${embedded ? 'p-5' : 'p-10'}`}>
      <h2 className="mb-5 mt-0 text-3xl font-semibold text-text">
        {matchData.repoName}
      </h2>
      <div className="mb-4 text-xl font-semibold text-primary">
        {labels.overallMatch}: {Math.round(matchData.matchScore * 100)}%
      </div>
      <div className={`w-full ${embedded ? 'h-[200px]' : 'h-[300px]'}`} key={themeVersion}>
        <ResponsiveContainer>
          <RadarChart data={data}
          cx="52%"
          cy="60%"
          outerRadius="90%"
          innerRadius="20%"
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>

            <PolarGrid stroke={grid} />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: text, fontSize: 14}}
            />
            <Radar
              name={labels.matchDegree}
              dataKey="value"
              stroke={primary}
              fill={primary}
              fillOpacity={0.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 w-full flex flex-col gap-3 text-xs text-text">
        <div
          className="text-center text-base leading-8"
          dangerouslySetInnerHTML={{ __html: formulaHtml }}
        />
        <div
          className="text-center text-xs leading-5"
          dangerouslySetInnerHTML={{ __html: weightHtml }}
        />

        {onBaseWeightsChange && (
          <div className="mt-3 flex justify-center">
            <div className="flex min-w-[200px] max-w-[320px] flex-col gap-2.5 rounded-lg border border-border bg-surface p-4 shadow-panel">
              <div className="mb-0.5 text-sm font-semibold">
                {labels.weightAdjust}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center justify-between">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: katex.renderToString("w_{\\mathrm{skill}}", {
                        displayMode: false,
                        throwOnError: false
                      })
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={localWeights.w_skill.toFixed(1)}
                    onChange={(e) => handleInputChange('w_skill', e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown('w_skill', e)}
                    className="ml-4 w-20 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: katex.renderToString("w_{\\mathrm{activity}}", {
                        displayMode: false,
                        throwOnError: false
                      })
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={localWeights.w_activity.toFixed(1)}
                    onChange={(e) => handleInputChange('w_activity', e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown('w_activity', e)}
                    className="ml-4 w-20 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
                  />
                </label>
                <label className="flex items-center justify-between">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: katex.renderToString("w_{\\mathrm{demand}}", {
                        displayMode: false,
                        throwOnError: false
                      })
                    }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={localWeights.w_demand.toFixed(1)}
                    onChange={(e) => handleInputChange('w_demand', e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown('w_demand', e)}
                    className="ml-4 w-20 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
                  />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return chartContent
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="h-[80vh] w-[80vw]"
    >
      {chartContent}
    </Modal>
  )
}

export default MatchRadarChart