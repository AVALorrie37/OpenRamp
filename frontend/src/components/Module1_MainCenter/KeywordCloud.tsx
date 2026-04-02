import React, { useMemo } from 'react'
import { extractKeywords, KEYWORD_CLOUD_STOP_WORDS } from '../../utils/formatters'
import type { RepoResponse } from '../../types'

interface KeywordCloudProps {
  repos: RepoResponse[]
  selectedRepo: RepoResponse | null
  onKeywordClick: (keyword: string) => void
  activeKeywords: string[]
  skipDescriptionKeywordFallback?: boolean
  onSingleRepoLabelClick?: (repo: RepoResponse) => void
  language?: 'chinese' | 'english'
}
// frontend/src/components/Module1_MainCenter/KeywordCloud.tsx
const KeywordCloud: React.FC<KeywordCloudProps> = ({
  repos,
  selectedRepo,
  onKeywordClick,
  activeKeywords,
  skipDescriptionKeywordFallback = false,
  onSingleRepoLabelClick,
  language = 'chinese'
}) => {
  const keywordData = useMemo(() => {
    const allKeywords: string[] = []
    const sourceRepos = selectedRepo ? [selectedRepo] : repos
    sourceRepos.forEach(repo => {
      const fromBackend = repo.keywords && repo.keywords.length > 0 ? repo.keywords : []
      if (fromBackend.length > 0) {
        allKeywords.push(
          ...fromBackend.filter(k => !KEYWORD_CLOUD_STOP_WORDS.has(k.toLowerCase()))
        )
      } else if (repo.description && !skipDescriptionKeywordFallback) {
        allKeywords.push(...extractKeywords(repo.description))
      }
    })

    const keywordCounts = allKeywords.reduce((acc, keyword) => {
      acc[keyword] = (acc[keyword] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word, count]) => ({ word, count }))
  }, [repos, selectedRepo, skipDescriptionKeywordFallback])

  const isSingleRepo = !!selectedRepo
  const modeLabel = isSingleRepo
    ? (selectedRepo?.name || (language === 'english' ? 'Single Repo' : '单个仓库'))
    : (language === 'english' ? 'All Repos' : '所有仓库')

  const getFontSize = (count: number, maxCount: number) => {
    const minSize = 11
    const maxSize = 17
    return minSize + ((count / maxCount) * (maxSize - minSize))
  }

  const maxCount = keywordData[0]?.count || 1

  return (
    <div className="glass-content-shadow flex h-full flex-col px-3 pb-4 pt-2">
      <div className="mb-2 flex justify-end">
        <span
          className={`max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-t-md border border-[var(--tab-selected-border)] bg-[var(--tab-selected-bg)] px-3 py-1.5 text-xs font-medium text-[var(--tab-selected-text)] transition ${
            isSingleRepo && selectedRepo ? 'cursor-pointer hover:brightness-[0.99]' : ''
          }`}
          role={isSingleRepo && selectedRepo ? 'link' : undefined}
          tabIndex={isSingleRepo && selectedRepo ? 0 : undefined}
          onClick={(e) => {
            if (!isSingleRepo || !selectedRepo || !onSingleRepoLabelClick) return
            e.stopPropagation()
            onSingleRepoLabelClick(selectedRepo)
          }}
          onKeyDown={(e) => {
            if (!isSingleRepo || !selectedRepo || !onSingleRepoLabelClick) return
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            e.stopPropagation()
            onSingleRepoLabelClick(selectedRepo)
          }}
        >
          {modeLabel}
        </span>
      </div>
      <div
        className={`flex min-h-0 flex-1 flex-wrap items-start overflow-y-auto ${isSingleRepo ? 'justify-start gap-1.5' : 'justify-center gap-2.5'}`}
      >
        {keywordData.map(({ word, count }) => {
          const isActive = activeKeywords.includes(word)
          const sizeClass = (() => {
            const s = getFontSize(count, maxCount)
            if (s >= 16) return 'text-lg'
            if (s >= 14) return 'text-base'
            if (s >= 12) return 'text-sm'
            return 'text-xs'
          })()
          const weightClass = count > maxCount * 0.5 ? 'font-semibold' : 'font-medium'
          return (
            <span
              key={word}
              className={`cursor-pointer rounded-md px-2.5 py-1 transition [transition-property:transform,box-shadow,border-color,background-color] ${sizeClass} ${weightClass} ${
                isActive
                  ? 'relative z-0 border [border-color:var(--glass-frame-outer)] bg-primary text-[var(--color-surface)] shadow-[0_2px_6px_-1px_rgba(0,0,0,0.55),0_8px_22px_-8px_rgba(0,0,0,0.45),0_0_16px_-4px_var(--glass-frame-outer)] backdrop-blur-sm [text-shadow:0_0_10px_color-mix(in_srgb,var(--glass-frame-inner)_50%,transparent)] hover:-translate-y-px hover:[border-color:color-mix(in_srgb,var(--color-text)_20%,var(--glass-border))] hover:shadow-[0_3px_10px_-2px_rgba(0,0,0,0.5),0_12px_28px_-10px_rgba(0,0,0,0.38),0_0_20px_-4px_var(--glass-frame-outer)]'
                  : 'border [border-color:var(--glass-frame-outer)] bg-surface/58 text-primary shadow-[var(--glass-stack-shadow),inset_0_0_0_1px_var(--glass-frame-inner)] backdrop-blur-sm [text-shadow:0_0_8px_color-mix(in_srgb,var(--glass-frame-inner)_40%,transparent)] hover:-translate-y-px hover:[border-color:color-mix(in_srgb,var(--color-text)_20%,var(--glass-border))] hover:bg-surface/64 hover:shadow-[0_3px_8px_-2px_rgba(0,0,0,0.4),0_10px_24px_-10px_rgba(0,0,0,0.28),0_0_16px_-4px_var(--glass-frame-outer),inset_0_0_0_1px_var(--glass-frame-inner)] hover:[text-shadow:0_0_10px_color-mix(in_srgb,var(--glass-frame-inner)_50%,transparent)]'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onKeywordClick(word)
              }}
            >
              {word}
            </span>
          )
        })}
      </div>
    </div>
  )
}
export default KeywordCloud
