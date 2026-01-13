import React from 'react'
import { theme } from '../../styles/theme'

interface RadarPlaceholderProps {
  isActive: boolean
}

const RadarPlaceholder: React.FC<RadarPlaceholderProps> = ({ isActive }) => {
  if (isActive) {
    return null
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: `${theme.overlay}40`,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10
    }}>
      <div style={{
        textAlign: 'center',
        color: theme.text,
        opacity: 0.6,
        fontSize: '16px',
        padding: '40px'
      }}>
        与AI助手对话确认技能后解锁
      </div>
    </div>
  )
}

export default RadarPlaceholder
