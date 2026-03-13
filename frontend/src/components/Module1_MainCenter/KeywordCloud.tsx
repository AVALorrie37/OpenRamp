import React, { useMemo } from 'react'
import { theme } from '../../styles/theme'
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
    <div style={{
      padding: '8px 12px 16px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '8px'
      }}>
        <span style={{
          fontSize: '11px',
          padding: '4px 10px',
          borderRadius: '999px',
          border: `1px solid ${theme.primaryLight}`,
          backgroundColor: theme.white,
          color:  theme.text,
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden'
        }}>
          {modeLabel}
        </span>
      </div>
      <div style={{
        flex: 1,
        display: 'flex',
        flexWrap: 'wrap',
        gap: isSingleRepo ? '6px' : '10px',
        justifyContent: isSingleRepo ? 'flex-start' : 'center',
        alignItems: 'flex-start',
        minHeight: '160px'
      }}>
        {keywordData.map(({ word, count }) => {
          const isActive = activeKeywords.includes(word)
          return (
            <span
              key={word}
              style={{
                fontSize: `${getFontSize(count, maxCount)}px`,
                color: isActive ? theme.white : theme.primary,
                fontWeight: count > maxCount * 0.5 ? 600 : 400,
                padding: '4px 8px',
                backgroundColor: isActive ? theme.primary : theme.primaryLight + '40',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
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
