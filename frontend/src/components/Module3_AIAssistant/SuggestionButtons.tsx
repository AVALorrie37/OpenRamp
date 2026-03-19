import React from 'react'

interface SuggestionButtonsProps {
  onSuggestionClick: (suggestion: string) => void
  language?: 'chinese' | 'english'
}

const SuggestionButtons: React.FC<SuggestionButtonsProps> = ({ onSuggestionClick, language = 'chinese' }) => {
  const suggestions = language === 'english'
    ? [
      'Confirm skills',
      'Search matching projects',
      'Update contribution preferences'
    ]
    : [
      '确认技能',
      '搜索匹配项目',
      '更新贡献偏好'
    ]

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => onSuggestionClick(suggestion)}
          className="cursor-pointer rounded-full border border-border bg-background px-3 py-1.5 text-xs text-text transition hover:border-primary hover:bg-primaryLight"
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}

export default SuggestionButtons
