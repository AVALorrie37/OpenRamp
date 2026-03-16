import React, { useState, useEffect } from 'react'
import { theme } from '../../styles/theme'
import type { RepoResponse } from '../../types'

interface RepoListProps {
  repos: RepoResponse[]
  onRepoClick: (repo: RepoResponse) => void
  onOpenManualSearch?: () => void
  highlightedRepoIds?: string[]
  onBackgroundClick?: () => void
  canUseMatchSort?: boolean
  onDeleteRepo?: (repoId: string) => void
}

type SortType = 'match' | 'active' | 'friendly'

const RepoList: React.FC<RepoListProps> = ({ repos, onRepoClick, onOpenManualSearch, highlightedRepoIds, onBackgroundClick, canUseMatchSort, onDeleteRepo }) => {
  const [sortType, setSortType] = useState<SortType>('match')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const hasMatchScore = repos.some(r => typeof r.match_score === 'number')
  const canUseMatch = !!canUseMatchSort && hasMatchScore

  useEffect(() => {
    if (!canUseMatch && sortType === 'match') {
      setSortType('active')
    }
  }, [canUseMatch, sortType])

  const getPrimaryScore = (repo: RepoResponse) => {
    if (canUseMatch && typeof repo.match_score === 'number') {
      return repo.match_score
    }
    return repo.composite_score
  }

  const sortedRepos = [...repos].sort((a, b) => {
    if (sortType === 'match') {
      if (!canUseMatch) {
        return b.active_score - a.active_score
      }
      return getPrimaryScore(b) - getPrimaryScore(a)
    } else if (sortType === 'active') {
      return b.active_score - a.active_score
    } else { // friendly
      return getPrimaryScore(b) - getPrimaryScore(a)
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
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px',
        borderBottom: `1px solid ${theme.border}`
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canUseMatch && (
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
          )}
          <button
            onClick={() => setSortType('active')}
            style={{
              padding: '6px 12px',
              backgroundColor: sortType === 'active' ? theme.primary : theme.background,
              color: sortType === 'active' ? theme.white : theme.text,
              border: `1px solid ${theme.primary}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
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
        {onOpenManualSearch && (
          <button
            onClick={onOpenManualSearch}
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              borderRadius: '999px',
              border: `1px solid ${theme.primary}`,
              backgroundColor: theme.white,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: theme.primary
            }}
          >
            <span>🔍</span>
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px'
        }}
        onClick={onBackgroundClick}
      >
        {sortedRepos.map((repo: RepoResponse) => {
          const isHighlighted = highlightedRepoIds?.includes(repo.repo_id)
          return (
          <div
            key={repo.repo_id}
            onClick={(e) => {
              e.stopPropagation()
              onRepoClick(repo)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDeleteTargetId(repo.repo_id)
            }}
            style={{
              padding: '16px',
              marginBottom: '12px',
              backgroundColor: theme.white,
              borderRadius: '8px',
              border: `2px solid ${isHighlighted ? theme.primary : theme.border}`,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: isHighlighted ? `0 0 0 2px ${theme.primaryLight}` : 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.primary
              e.currentTarget.style.boxShadow = `0 4px 12px ${theme.primaryLight}40`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isHighlighted ? theme.primary : theme.border
              e.currentTarget.style.boxShadow = isHighlighted ? `0 0 0 2px ${theme.primaryLight}` : 'none'
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
                {repo.is_favorited && (
                  <span style={{ marginLeft: '6px', fontSize: '14px' }}>⭐</span>
                )}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {canUseMatch && (
                  <span style={{
                    padding: '4px 8px',
                    backgroundColor: theme.primary,
                    color: theme.white,
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 500
                  }}>
                    匹配{Math.round(getPrimaryScore(repo) * 100)}%
                  </span>
                )}
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
                {canUseMatch && getPrimaryScore(repo) > 0.7 && (
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
            {deleteTargetId === repo.repo_id && onDeleteRepo && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: theme.primaryLight,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '12px'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <span>删除这个仓库？</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: `1px solid ${theme.error}`,
                      backgroundColor: theme.error,
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteRepo(repo.repo_id)
                      setDeleteTargetId(null)
                    }}
                  >
                    删除
                  </button>
                  <button
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.white,
                      color: theme.text,
                      cursor: 'pointer'
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTargetId(null)
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
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
        )})}
      </div>
    </div>
  )
}

export default RepoList