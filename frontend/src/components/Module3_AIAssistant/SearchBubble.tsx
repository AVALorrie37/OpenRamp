import React from 'react'
import LoadingSpinner from '../shared/LoadingSpinner'

interface SearchBubbleProps {
  onCancel: () => void
  language?: 'chinese' | 'english'
  progressSeconds?: number | null
  searchStage?: string | null
}

const SearchBubble: React.FC<SearchBubbleProps> = ({ onCancel, language = 'chinese', progressSeconds = null, searchStage = null }) => {
  const progressText = searchStage
    ? `🔍 ${searchStage}`
    : progressSeconds != null
      ? (language === 'chinese' ? `正在搜索... ${progressSeconds}s` : `Searching... ${progressSeconds}s`)
      : (language === 'chinese' ? '🔍 正在搜索匹配的开源项目...' : '🔍 Searching for matching open source projects...')
  return (
    <div className="mb-3 flex justify-start">
      <div className="flex max-w-[70%] items-center gap-3 rounded-lg bg-primaryLight px-4 py-3 text-base leading-6 text-text">
        <LoadingSpinner />
        <span className="flex-1">
          {progressText}
        </span>
        <button
          onClick={onCancel}
          className="px-1 text-xl text-text/70 transition hover:text-text"
          title={language === 'chinese' ? '终止搜索' : 'Cancel search'}
        >
          ×
        </button>
      </div>
    </div>
  )
}

export default SearchBubble
