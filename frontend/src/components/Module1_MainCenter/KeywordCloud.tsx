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

  const getFontSize = (count: number, maxCount: number) => {
    const minSize = 12
    const maxSize = 24
    return minSize + ((count / maxCount) * (maxSize - minSize))
  }

  const maxCount = keywordData[0]?.count || 1

  return (
    <div style={{
      padding: '20px',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '200px'
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
      )})}
    </div>
  )
}

export default KeywordCloud
