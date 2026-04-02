import React, { useEffect, useMemo, useState } from 'react'
import { storage } from '../../utils/storage'
import type { RepoResponse } from '../../types'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'

interface SearchResultCardsProps {
  repos: RepoResponse[]
  language?: 'chinese' | 'english'
  username?: string | null
  pageSize?: number
  onFavorite?: (repo: RepoResponse) => void
  onUnfavorite?: (repoId: string) => void
  searchCompleted?: boolean
}

type SortMode = 'time' | 'match' | 'skill' | 'activity' | 'demand'
const REPO_ID_FOR_URL = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const SearchResultCards: React.FC<SearchResultCardsProps> = ({
  repos,
  language = 'chinese',
  username,
  pageSize = 3,
  onFavorite,
  onUnfavorite,
  searchCompleted = false
}) => {
  const [page, setPage] = useState(0)
  const [sortMode, setSortMode] = useState<SortMode>('time')
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(() => {
    if (!username) return new Set()
    const favs = storage.getUserFavorites(username) || []
    return new Set(favs.map((f: any) => f.repo_id))
  })

  useEffect(() => {
    if (!username) {
      setFavoritedIds(new Set())
      return
    }
    const favs = storage.getUserFavorites(username) || []
    setFavoritedIds(new Set(favs.map((f: any) => f.repo_id)))
  }, [username, repos])

  useEffect(() => {
    setPage(0)
  }, [sortMode])

  const sortedRepos = useMemo(() => {
    if (sortMode === 'time') return repos
    const next = [...repos]
    next.sort((a, b) => {
      if (sortMode === 'match') return (b.match_score ?? -1) - (a.match_score ?? -1)
      if (sortMode === 'skill') return (b.breakdown?.skill ?? -1) - (a.breakdown?.skill ?? -1)
      if (sortMode === 'activity') return (b.breakdown?.activity ?? -1) - (a.breakdown?.activity ?? -1)
      return (b.breakdown?.demand ?? -1) - (a.breakdown?.demand ?? -1)
    })
    return next
  }, [repos, sortMode])

  const totalPages = Math.ceil(sortedRepos.length / pageSize)
  const pageRepos = sortedRepos.slice(page * pageSize, (page + 1) * pageSize)

  const toggleFavorite = (repo: RepoResponse) => {
    if (!username) return
    const next = new Set(favoritedIds)
    if (next.has(repo.repo_id)) {
      next.delete(repo.repo_id)
      const favs = (storage.getUserFavorites(username) || []).filter((f: any) => f.repo_id !== repo.repo_id)
      storage.saveUserFavorites(username, favs)
      onUnfavorite?.(repo.repo_id)
    } else {
      next.add(repo.repo_id)
      const favs = storage.getUserFavorites(username) || []
      if (!favs.some((f: any) => f.repo_id === repo.repo_id)) {
        favs.push({ ...repo, full_name: repo.name, is_favorited: true })
      }
      storage.saveUserFavorites(username, favs)
      onFavorite?.(repo)
    }
    setFavoritedIds(next)
  }

  const repoUrl = (repo: RepoResponse) =>
    REPO_ID_FOR_URL.test(repo.repo_id)
      ? `https://github.com/${repo.repo_id}`
      : `https://github.com/${repo.name}`
  const pct = (v?: number) => `${Math.round(Math.max(0, (v ?? 0)) * 100)}%`

  return (
    <div className="mt-2 w-full">
      {searchCompleted && repos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          <button data-selection-excluded onClick={() => setSortMode('match')} className={`rounded px-2 py-0.5 text-xs ${sortMode === 'match' ? 'bg-primary text-white' : 'bg-surface text-text border border-border'}`}>
            {language === 'chinese' ? '综合' : 'Composite'}
          </button>
          <button data-selection-excluded onClick={() => setSortMode('skill')} className={`rounded px-2 py-0.5 text-xs ${sortMode === 'skill' ? 'bg-primary text-white' : 'bg-surface text-text border border-border'}`}>
            {language === 'chinese' ? '技能' : 'Skill'}
          </button>
          <button data-selection-excluded onClick={() => setSortMode('activity')} className={`rounded px-2 py-0.5 text-xs ${sortMode === 'activity' ? 'bg-primary text-white' : 'bg-surface text-text border border-border'}`}>
            {language === 'chinese' ? '活跃' : 'Activity'}
          </button>
          <button data-selection-excluded onClick={() => setSortMode('demand')} className={`rounded px-2 py-0.5 text-xs ${sortMode === 'demand' ? 'bg-primary text-white' : 'bg-surface text-text border border-border'}`}>
            {language === 'chinese' ? '需求' : 'Demand'}
          </button>
        </div>
      )}
      {pageRepos.map((repo) => {
        const isFav = favoritedIds.has(repo.repo_id)
        return (
          <div key={repo.repo_id} className="mb-2 rounded-md border border-border bg-surface px-3 py-2.5 transition hover:shadow-panel">
            <div className="mb-1 flex items-center justify-between gap-2">
              <a
                data-selection-excluded
                href={repoUrl(repo)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-primary no-underline hover:underline"
                title={repo.name}
              >
                {repo.name}
              </a>
              <button
                data-selection-excluded
                onClick={() => toggleFavorite(repo)}
                className={`flex-shrink-0 bg-transparent px-1 text-lg ${username ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                title={language === 'chinese' ? (isFav ? '取消收藏' : '收藏') : (isFav ? 'Unfavorite' : 'Favorite')}
                disabled={!username}
              >
                <span
                  className={
                    isFav ? 'text-[var(--icon-star-favorited)]' : 'text-[var(--icon-star-idle)]'
                  }
                  aria-hidden="true"
                >
                  <Star size={16} fill={isFav ? 'currentColor' : 'none'} />
                </span>
              </button>
            </div>
            <div className="mb-1 flex flex-wrap gap-1">
              {repo.match_score != null && (
                <div className="inline-block rounded px-1.5 py-0.5 text-[11px] font-medium text-[var(--emphasis-fill-text)] bg-[var(--emphasis-fill-bg)]">
                  {language === 'chinese' ? '匹配' : 'Match'} {pct(repo.match_score)}
                </div>
              )}
              {repo.breakdown?.skill != null && (
                <div className="inline-block rounded-full bg-surface px-2 py-0.5 text-xs text-text border border-border">
                  {language === 'chinese' ? '技能' : 'Skill'} {pct(repo.breakdown.skill)}
                </div>
              )}
              {repo.breakdown?.activity != null && (
                <div className="inline-block rounded-full bg-surface px-2 py-0.5 text-xs text-text border border-border">
                  {language === 'chinese' ? '活跃' : 'Activity'} {pct(repo.breakdown.activity)}
                </div>
              )}
              {repo.breakdown?.demand != null && (
                <div className="inline-block rounded-full bg-surface px-2 py-0.5 text-xs text-text border border-border">
                  {language === 'chinese' ? '需求' : 'Demand'} {pct(repo.breakdown.demand)}
                </div>
              )}
            </div>
            {repo.description && (
              <div data-chat-selectable className="line-clamp-2 text-xs leading-5 text-text/75">
                {repo.description}
              </div>
            )}
          </div>
        )
      })}
      {totalPages > 1 && (
        <div className="mt-1 flex items-center justify-center gap-2">
          <button
            data-selection-excluded
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className={`inline-flex items-center justify-center bg-transparent px-1.5 py-0.5 ${page === 0 ? 'cursor-not-allowed text-border' : 'cursor-pointer text-primary'}`}
            aria-label="Previous page"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs text-text">
            {page + 1} / {totalPages}
          </span>
          <button
            data-selection-excluded
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className={`inline-flex items-center justify-center bg-transparent px-1.5 py-0.5 ${page >= totalPages - 1 ? 'cursor-not-allowed text-border' : 'cursor-pointer text-primary'}`}
            aria-label="Next page"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

export default SearchResultCards
