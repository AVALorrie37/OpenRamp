import React from 'react'
import { theme } from '../../styles/theme'

interface AIButtonProps {
  onClick: () => void
  language?: 'chinese' | 'english'
}

const AIButton: React.FC<AIButtonProps> = ({ onClick, language = 'chinese' }) => {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'fixed',
        bottom: '60px',
        right: '30px',
        width: '90px',
        height: '90px',
        borderRadius: '50%',
        backgroundColor: theme.primary,
        color: theme.white,
        border: 'none',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        zIndex: 999,
        transition: 'all 0.2s',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.primaryDark
        e.currentTarget.style.transform = 'scale(1.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = theme.primary
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {language === 'english' ? 'AI Assistant' : 'AI助手'}
    </button>
  )
}

export default AIButton
