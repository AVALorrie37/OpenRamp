import React from 'react'
import { theme } from '../../styles/theme'

interface SuggestionButtonsProps {
  onSuggestionClick: (suggestion: string) => void
}

const SuggestionButtons: React.FC<SuggestionButtonsProps> = ({ onSuggestionClick }) => {
  const suggestions = [
    '确认技能',
    '搜索匹配项目',
    '更新贡献偏好'
  ]

  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      marginTop: '12px'
    }}>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSuggestionClick(suggestion)}
          style={{
            padding: '6px 12px',
            backgroundColor: theme.background,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: '16px',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.primaryLight
            e.currentTarget.style.borderColor = theme.primary
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = theme.background
            e.currentTarget.style.borderColor = theme.border
          }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}

export default SuggestionButtons
