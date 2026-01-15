import React, { useState } from 'react'
import { theme } from '../../styles/theme'
import type { RepoResponse } from '../../types'

interface RepoListProps {
  repos: RepoResponse[]
  onRepoClick: (repo: RepoResponse) => void
}

type SortType = 'match' | 'active' | 'friendly'

const RepoList: React.FC<RepoListProps> = ({ repos, onRepoClick }) => {
  const [sortType, setSortType] = useState<SortType>('match')

  const sortedRepos = [...repos].sort((a, b) => {
    if (sortType === 'match') {
      return b.composite_score - a.composite_score
    } else if (sortType === 'active') {
      return b.active_score - a.active_score
    } else { // friendly
      return b.composite_score - a.composite_score
    }
  })

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px',
        borderBottom: `1px solid ${theme.border}`
      }}>
        <button
          onClick={() => setSortType('match')}
          style={{
            padding: '6px 12px',
            backgroundColor: sortType === 'match' ? theme.primary : theme.background,
            color: sortType === 'match' ? theme.white : theme.text,
            border: `1px solid ${theme.primary}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          匹配总分
        </button>
        <button
          onClick={() => setSortType('active')}
          style={{
            padding: '6px 12px',
            backgroundColor: sortType === 'active' ? theme.primary : theme.background,
            color: sortType === 'active' ? theme.white : theme.text,
            border: `1px solid ${theme.primary}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          活跃度
        </button>
        <button
          onClick={() => setSortType('friendly')}
          style={{
            padding: '6px 12px',
            backgroundColor: sortType === 'friendly' ? theme.primary : theme.background,
            color: sortType === 'friendly' ? theme.white : theme.text,
            border: `1px solid ${theme.primary}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          新手友好度
        </button>
      </div>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px'
      }}>
        {sortedRepos.map((repo) => (
          <div
            key={repo.repo_id}
            onClick={() => onRepoClick(repo)}
            style={{
              padding: '16px',
              marginBottom: '12px',
              backgroundColor: theme.white,
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.primary
              e.currentTarget.style.boxShadow = `0 4px 12px ${theme.primaryLight}40`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.border
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '8px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '16px',
                color: theme.text,
                fontWeight: 600
              }}>
                {repo.name}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{
                  padding: '4px 8px',
                  backgroundColor: theme.success,
                  color: theme.white,
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500
                }}>
                  匹配{Math.round(repo.composite_score * 100)}%
                </span>
                <span style={{
                  padding: '4px 8px',
                  backgroundColor: theme.primaryLight,
                  color: theme.text,
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500
                }}>
                  活跃度{Math.round(repo.active_score * 100)}%
                </span>
                {repo.composite_score > 0.7 && (
                  <span style={{
                    padding: '4px 8px',
                    backgroundColor: theme.accent,
                    color: theme.white,
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 500
                  }}>
                    新手友好
                  </span>
                )}
              </div>
            </div>
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '13px',
              color: theme.text,
              opacity: 0.7,
              lineHeight: '1.5'
            }}>
              {repo.description || 'No description'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RepoList