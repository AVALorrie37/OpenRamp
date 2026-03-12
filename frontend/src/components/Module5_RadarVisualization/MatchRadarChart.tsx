import React, { useState, useEffect, type FC } from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer
} from 'recharts'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { theme } from '../../styles/theme'
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
}

const MatchRadarChart: FC<MatchRadarChartProps> = ({ 
  isOpen, 
  onClose, 
  matchData, 
  embedded = false,
  baseWeights,
  dynamicWeights,
  onBaseWeightsChange
}) => {
  if (!matchData) return null

  const defaultBase = {
    w_skill: 0.5,
    w_activity: 0.3,
    w_demand: 0.2
  }

  const [localWeights, setLocalWeights] = useState(baseWeights || defaultBase)

  useEffect(() => {
    setLocalWeights(baseWeights || defaultBase)
  }, [baseWeights?.w_skill, baseWeights?.w_activity, baseWeights?.w_demand])

  const data = [
    {
      subject: '技能匹配度',
      value: matchData.skill * 100,
      fullMark: 100
    },
    {
      subject: '项目活跃度',
      value: matchData.activity * 100,
      fullMark: 100
    },
    {
      subject: '社区需求热度',
      value: matchData.demand * 100,
      fullMark: 100
    }
  ]

  const effectiveWeights = dynamicWeights || baseWeights || defaultBase

  const applyWeights = (next: { w_skill: number; w_activity: number; w_demand: number }) => {
    if (!onBaseWeightsChange) return
    const sum = next.w_skill + next.w_activity + next.w_demand
    if (sum <= 0) return
    onBaseWeightsChange({
      w_skill: next.w_skill / sum,
      w_activity: next.w_activity / sum,
      w_demand: next.w_demand / sum
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
        applyWeights(next)
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      height: '100%',
      padding: embedded ? '20px' : '40px'
    }}>
      <h2 style={{
        margin: '0 0 20px 0',
        fontSize: '24px',
        color: theme.text,
        fontWeight: 600
      }}>
        {matchData.repoName}
      </h2>
      <div style={{
        marginBottom: '20px',
        fontSize: '18px',
        color: theme.primary,
        fontWeight: 600
      }}>
        匹配总分: {Math.round(matchData.matchScore * 100)}%
      </div>
      <div style={{ width: '100%', height: embedded ? '300px' : '500px' }}>
        <ResponsiveContainer>
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fill: theme.text, fontSize: 14 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: theme.text, fontSize: 12 }}
            />
            <Radar
              name="匹配度"
              dataKey="value"
              stroke={theme.primary}
              fill={theme.primary}
              fillOpacity={0.6}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div style={{
        marginTop: '24px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        fontSize: '13px',
        color: theme.text
      }}>
        <div
          style={{ lineHeight: 3, fontSize: '18px', textAlign: 'center'}}
          dangerouslySetInnerHTML={{ __html: formulaHtml }}
        />
        <div
          style={{ lineHeight: 1.4, fontSize: '12px', textAlign: 'center' }}
          dangerouslySetInnerHTML={{ __html: weightHtml }}
        />

        {onBaseWeightsChange && (
          <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.white,
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                minWidth: '200px',
                maxWidth: '320px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '2px' }}>
                权重调节
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                    style={{ width: '80px', marginLeft: '18px', textAlign: 'right' }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                    style={{ width: '80px', marginLeft: '18px', textAlign: 'right' }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                    style={{ width: '80px', marginLeft: '18px', textAlign: 'right' }}
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
      width="80vw"
      height="80vh"
    >
      {chartContent}
    </Modal>
  )
}

export default MatchRadarChart