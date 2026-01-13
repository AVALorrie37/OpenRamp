import React from 'react'
import { theme } from '../../styles/theme'

interface TechStackCloudProps {
  languages: string[]
  onTagClick: (lang: string) => void
}

const TechStackCloud: React.FC<TechStackCloudProps> = ({ languages, onTagClick }) => {
  const languageCounts = languages.reduce((acc, lang) => {
    acc[lang] = (acc[lang] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sortedLanguages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([lang]) => lang)

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '12px',
      padding: '20px',
      justifyContent: 'center'
    }}>
      {sortedLanguages.map((lang) => (
        <button
          key={lang}
          onClick={() => onTagClick(lang)}
          style={{
            padding: '8px 16px',
            backgroundColor: theme.primaryLight,
            color: theme.text,
            border: `1px solid ${theme.primary}`,
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s',
            fontWeight: 500
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.2)'
            e.currentTarget.style.backgroundColor = theme.primary
            e.currentTarget.style.color = theme.white
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.backgroundColor = theme.primaryLight
            e.currentTarget.style.color = theme.text
          }}
        >
          {lang}
        </button>
      ))}
    </div>
  )
}

export default TechStackCloud
