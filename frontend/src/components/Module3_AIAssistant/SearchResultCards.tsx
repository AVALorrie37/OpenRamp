import React, { useState } from 'react'
import { theme } from '../../styles/theme'
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
    <div style={{ marginTop: '8px', width: '100%' }}>
      {pageRepos.map((repo) => {
        const isFav = favoritedIds.has(repo.repo_id)
        return (
          <div key={repo.repo_id} style={{
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '8px',
            backgroundColor: theme.white,
            transition: 'box-shadow 0.2s',
          }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <a
                href={repoUrl(repo.name)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: theme.primary,
                  fontWeight: 600,
                  fontSize: '13px',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                title={repo.name}
              >
                {repo.name}
              </a>
              <button
                onClick={() => toggleFavorite(repo)}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: username ? 'pointer' : 'not-allowed',
                  fontSize: '16px',
                  padding: '0 4px',
                  flexShrink: 0,
                  opacity: username ? 1 : 0.4,
                }}
                title={language === 'chinese' ? (isFav ? '取消收藏' : '收藏') : (isFav ? 'Unfavorite' : 'Favorite')}
                disabled={!username}
              >
                {isFav ? '⭐' : '☆'}
              </button>
            </div>
            {repo.match_score != null && (
              <div style={{
                display: 'inline-block',
                fontSize: '11px',
                color: theme.white,
                backgroundColor: theme.primary,
                borderRadius: '10px',
                padding: '1px 8px',
                marginBottom: '4px',
              }}>
                {language === 'chinese' ? '匹配' : 'Match'} {Math.round(repo.match_score * 100)}%
              </div>
            )}
            {repo.description && (
              <div style={{
                fontSize: '12px',
                color: theme.text,
                opacity: 0.75,
                lineHeight: '1.4',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {repo.description}
              </div>
            )}
          </div>
        )
      })}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              border: 'none',
              background: 'none',
              cursor: page === 0 ? 'not-allowed' : 'pointer',
              color: page === 0 ? theme.border : theme.primary,
              fontSize: '14px',
              padding: '2px 6px',
            }}
          >
            ◀
          </button>
          <span style={{ fontSize: '12px', color: theme.text }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{
              border: 'none',
              background: 'none',
              cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
              color: page >= totalPages - 1 ? theme.border : theme.primary,
              fontSize: '14px',
              padding: '2px 6px',
            }}
          >
            ▶
          </button>
        </div>
      )}
    </div>
  )
}

export default SearchResultCards
