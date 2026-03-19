import React, { useMemo } from 'react'
import { extractKeywords } from '../../utils/formatters'
import type { RepoResponse } from '../../types'

interface KeywordCloudProps {
  repos: RepoResponse[]
  selectedRepo: RepoResponse | null
  onKeywordClick: (keyword: string) => void
  activeKeywords: string[]
}
// frontend/src/components/Module1_MainCenter/KeywordCloud.tsx
const KeywordCloud: React.FC<KeywordCloudProps> = ({ repos, selectedRepo, onKeywordClick, activeKeywords }) => {
  const keywordData = useMemo(() => {
    const allKeywords: string[] = []
    const sourceRepos = selectedRepo ? [selectedRepo] : repos
    sourceRepos.forEach(repo => {
      const fromBackend = repo.keywords && repo.keywords.length > 0 ? repo.keywords : []
      if (fromBackend.length > 0) {
        allKeywords.push(...fromBackend)
      } else if (repo.description) {
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
  }, [repos, selectedRepo])

  const isSingleRepo = !!selectedRepo
  const modeLabel = isSingleRepo ? (selectedRepo?.name || '单个仓库') : '所有仓库'

  const getFontSize = (count: number, maxCount: number) => {
    const minSize = 12
    const maxSize = 24
    return minSize + ((count / maxCount) * (maxSize - minSize))
  }

  const maxCount = keywordData[0]?.count || 1

  return (
    <div className="flex h-full flex-col px-3 pb-4 pt-2">
      <div className="mb-2 flex justify-end">
        <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-primaryLight bg-surface px-2.5 py-1 text-xs text-text">
          {modeLabel}
        </span>
      </div>
      <div className={`flex min-h-[160px] flex-1 flex-wrap items-start ${isSingleRepo ? 'justify-start gap-1.5' : 'justify-center gap-2.5'}`}>
        {keywordData.map(({ word, count }) => {
          const isActive = activeKeywords.includes(word)
          const sizeClass = (() => {
            const s = getFontSize(count, maxCount)
            if (s >= 21) return 'text-xl'
            if (s >= 18) return 'text-lg'
            if (s >= 15) return 'text-base'
            if (s >= 13) return 'text-sm'
            return 'text-xs'
          })()
          const weightClass = count > maxCount * 0.5 ? 'font-semibold' : 'font-normal'
          return (
            <span
              key={word}
              className={`cursor-pointer rounded px-2 py-1 transition ${sizeClass} ${weightClass} ${
                isActive ? 'bg-primary text-white' : 'bg-surface2 text-primary hover:bg-primaryLight/60'
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
