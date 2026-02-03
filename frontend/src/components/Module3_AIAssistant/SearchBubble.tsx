import React from 'react'
import { theme } from '../../styles/theme'
import LoadingSpinner from '../shared/LoadingSpinner'

interface SearchBubbleProps {
  onCancel: () => void
  language?: 'chinese' | 'english'
}

const SearchBubble: React.FC<SearchBubbleProps> = ({ onCancel, language = 'chinese' }) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'flex-start',
      marginBottom: '12px'
    }}>
      <div style={{
        maxWidth: '70%',
        padding: '12px 16px',
        borderRadius: '12px',
        backgroundColor: theme.primaryLight,
        color: theme.text,
        fontSize: '14px',
        lineHeight: '1.5',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <LoadingSpinner />
        <span style={{ flex: 1 }}>
          {language === 'chinese' ? '🔍 正在搜索匹配的开源项目...' : '🔍 Searching for matching open source projects...'}
        </span>
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.text,
            fontSize: '18px',
            padding: '0 4px',
            opacity: 0.7,
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
          title={language === 'chinese' ? '终止搜索' : 'Cancel search'}
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default SearchBubble
