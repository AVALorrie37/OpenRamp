import React from 'react'

interface SuggestionButtonsProps {
  onSuggestionClick: (suggestion: string) => void
  language?: 'chinese' | 'english'
}

const SuggestionButtons: React.FC<SuggestionButtonsProps> = ({ onSuggestionClick, language = 'chinese' }) => {
  const suggestions = language === 'english'
    ? [
      'Current skills',
      'Search matching projects',
      'Update my profile'
    ]
    : [
      '当前技能',
      '搜索匹配项目',
      '更新个人信息'
    ]

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          type="button"
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
