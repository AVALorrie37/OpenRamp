import React from 'react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer
} from 'recharts'
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
}

const MatchRadarChart: React.FC<MatchRadarChartProps> = ({ isOpen, onClose, matchData }) => {
  if (!matchData) return null

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      width="80vw"
      height="80vh"
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        padding: '40px'
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
        <div style={{ width: '100%', height: '500px' }}>
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
          marginTop: '30px',
          display: 'flex',
          gap: '40px',
          fontSize: '14px',
          color: theme.text
        }}>
          <div>
            <span style={{ fontWeight: 600 }}>技能匹配度: </span>
            {Math.round(matchData.skill * 100)}%
          </div>
          <div>
            <span style={{ fontWeight: 600 }}>项目活跃度: </span>
            {Math.round(matchData.activity * 100)}%
          </div>
          <div>
            <span style={{ fontWeight: 600 }}>社区需求热度: </span>
            {Math.round(matchData.demand * 100)}%
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default MatchRadarChart
