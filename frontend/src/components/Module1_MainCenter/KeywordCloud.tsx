import React, { useMemo } from 'react'
import { theme } from '../../styles/theme'
import { extractKeywords } from '../../utils/formatters'
import type { RepoResponse } from '../../types'

interface KeywordCloudProps {
  repos: RepoResponse[]
}

const KeywordCloud: React.FC<KeywordCloudProps> = ({ repos }) => {
  const keywordData = useMemo(() => {
    const allKeywords: string[] = []
    repos.forEach(repo => {
      if (repo.description) {
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
  }, [repos])

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
      {keywordData.map(({ word, count }) => (
        <span
          key={word}
          style={{
            fontSize: `${getFontSize(count, maxCount)}px`,
            color: theme.primary,
            fontWeight: count > maxCount * 0.5 ? 600 : 400,
            padding: '4px 8px',
            backgroundColor: theme.primaryLight + '40',
            borderRadius: '4px'
          }}
        >
          {word}
        </span>
      ))}
    </div>
  )
}

export default KeywordCloud
