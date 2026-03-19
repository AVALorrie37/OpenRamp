import React, { useState } from 'react'
import { storage } from '../../utils/storage'
import type { RepoResponse } from '../../types'

interface SearchResultCardsProps {
  repos: RepoResponse[]
  language?: 'chinese' | 'english'
  username?: string | null
  pageSize?: number
  onFavorite?: (repo: RepoResponse) => void
  onUnfavorite?: (repoId: string) => void
}

const SearchResultCards: React.FC<SearchResultCardsProps> = ({ repos, language = 'chinese', username, pageSize = 3, onFavorite, onUnfavorite }) => {
  const [page, setPage] = useState(0)
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(() => {
    if (!username) return new Set()
    const favs = storage.getUserFavorites(username) || []
    return new Set(favs.map((f: any) => f.repo_id))
  })

  const totalPages = Math.ceil(repos.length / pageSize)
  const pageRepos = repos.slice(page * pageSize, (page + 1) * pageSize)

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
      favs.push({ ...repo, full_name: repo.name, is_favorited: true })
      storage.saveUserFavorites(username, favs)
      onFavorite?.(repo)
    }
    setFavoritedIds(next)
  }

  const repoUrl = (name: string) => `https://github.com/${name}`

  return (
    <div className="mt-2 w-full">
      {pageRepos.map((repo) => {
        const isFav = favoritedIds.has(repo.repo_id)
        return (
          <div key={repo.repo_id} className="mb-2 rounded-md border border-border bg-surface px-3 py-2.5 transition hover:shadow-panel">
            <div className="mb-1 flex items-center justify-between gap-2">
              <a
                href={repoUrl(repo.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-primary no-underline hover:underline"
                title={repo.name}
              >
                {repo.name}
              </a>
              <button
                onClick={() => toggleFavorite(repo)}
                className={`flex-shrink-0 bg-transparent px-1 text-lg ${username ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                title={language === 'chinese' ? (isFav ? '取消收藏' : '收藏') : (isFav ? 'Unfavorite' : 'Favorite')}
                disabled={!username}
              >
                {isFav ? '⭐' : '☆'}
              </button>
            </div>
            {repo.match_score != null && (
              <div className="mb-1 inline-block rounded-full bg-primary px-2 py-0.5 text-xs text-white">
                {language === 'chinese' ? '匹配' : 'Match'} {Math.round(repo.match_score * 100)}%
              </div>
            )}
            {repo.description && (
              <div className="line-clamp-2 text-xs leading-5 text-text/75">
                {repo.description}
              </div>
            )}
          </div>
        )
      })}
      {totalPages > 1 && (
        <div className="mt-1 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className={`bg-transparent px-1.5 py-0.5 text-base ${page === 0 ? 'cursor-not-allowed text-border' : 'cursor-pointer text-primary'}`}
          >
            ◀
          </button>
          <span className="text-xs text-text">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className={`bg-transparent px-1.5 py-0.5 text-base ${page >= totalPages - 1 ? 'cursor-not-allowed text-border' : 'cursor-pointer text-primary'}`}
          >
            ▶
          </button>
        </div>
      )}
    </div>
  )
}

export default SearchResultCards
