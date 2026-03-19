import React, { useState, useEffect } from 'react'
import type { RepoResponse } from '../../types'
import { Search, Star } from 'lucide-react'

interface RepoListProps {
  repos: RepoResponse[]
  onRepoClick: (repo: RepoResponse) => void
  onOpenManualSearch?: () => void
  highlightedRepoIds?: string[]
  onBackgroundClick?: () => void
  canUseMatchSort?: boolean
  onDeleteRepo?: (repoId: string) => void
  onDescriptionRefresh?: (repo: RepoResponse) => void
}

type SortType = 'match' | 'active' | 'friendly'

const RepoList: React.FC<RepoListProps> = ({ repos, onRepoClick, onOpenManualSearch, highlightedRepoIds, onBackgroundClick, canUseMatchSort, onDeleteRepo, onDescriptionRefresh }) => {
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex gap-2">
          {canUseMatch && (
            <button
              onClick={() => setSortType('match')}
              className={`rounded-md border border-primary px-3 py-1.5 text-xs transition ${
                sortType === 'match' ? 'bg-primary text-white' : 'bg-background text-text hover:bg-primary/10'
              }`}
            >
              匹配总分
            </button>
          )}
          <button
            onClick={() => setSortType('active')}
            className={`rounded-md border border-primary px-3 py-1.5 text-xs transition ${
              sortType === 'active' ? 'bg-primary text-white' : 'bg-background text-text hover:bg-primary/10'
            }`}
          >
            活跃度
          </button>
          <button
            onClick={() => setSortType('friendly')}
            className={`rounded-md border border-primary px-3 py-1.5 text-xs transition ${
              sortType === 'friendly' ? 'bg-primary text-white' : 'bg-background text-text hover:bg-primary/10'
            }`}
          >
            新手友好度
          </button>
        </div>
        {onOpenManualSearch && (
          <button
            onClick={onOpenManualSearch}
            className="ml-auto flex items-center gap-1 rounded-full border border-primary bg-surface px-2.5 py-1.5 text-xs text-primary transition hover:bg-primary/10"
            aria-label="Search"
          >
            <Search size={16} />
          </button>
        )}
      </div>
      <div
        className="flex-1 overflow-y-auto p-3 pb-8"
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
            className={`mb-3 cursor-pointer rounded-md border-2 bg-surface p-4 transition hover:border-primary hover:shadow-panel ${
              isHighlighted ? 'border-primary ring-2 ring-primaryLight/60' : 'border-border'
            }`}
          >
            <div className="mb-2 flex items-start justify-between">
              <h3 className="m-0 text-lg font-semibold text-text">
                {repo.name}
                {repo.is_favorited && (
                  <span className="ml-1.5 inline-flex align-middle text-accent" aria-label="Favorited" title="Favorited">
                    <Star size={14} fill="currentColor" />
                  </span>
                )}
              </h3>
              <div className="flex gap-2">
                {canUseMatch && (
                  <span className="rounded px-2 py-1 text-xs font-medium text-white bg-primary">
                    匹配{Math.round(getPrimaryScore(repo) * 100)}%
                  </span>
                )}
                <span className="rounded bg-primaryLight px-2 py-1 text-xs font-medium text-text">
                  活跃度{Math.round(repo.active_score * 100)}%
                </span>
                {canUseMatch && getPrimaryScore(repo) > 0.7 && (
                  <span className="rounded bg-accent px-2 py-1 text-xs font-medium text-white">
                    新手友好
                  </span>
                )}
              </div>
            </div>
            {deleteTargetId === repo.repo_id && onDeleteRepo && (
              <div
                className="mt-2 flex items-center justify-between rounded-md bg-primaryLight p-2 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <span>删除这个仓库？</span>
                <div className="flex gap-2">
                  <button
                    className="rounded border border-error bg-error px-2 py-1 text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteRepo(repo.repo_id)
                      setDeleteTargetId(null)
                    }}
                  >
                    删除
                  </button>
                  <button
                    className="rounded border border-border bg-surface px-2 py-1 text-text"
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
            <p
              className={`mt-2 text-sm leading-5 text-text/70 ${
                !repo.description ? 'cursor-pointer underline decoration-dotted' : ''
              }`}
              onClick={(e) => {
                if (!repo.description && onDescriptionRefresh) {
                  e.stopPropagation()
                  onDescriptionRefresh(repo)
                }
              }}
            >
              {repo.description && repo.description.includes('暂无 OpenDigger 数据（使用 GitHub 指标兜底）')
                ? 'No description'
                : (repo.description || 'No description')}
            </p>
          </div>
        )})}
      </div>
    </div>
  )
}

export default RepoList