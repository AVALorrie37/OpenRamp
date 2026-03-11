import React, { useState, useEffect, useMemo } from 'react'
import { theme } from '../../styles/theme'
import { manualSearchAPI } from '../../services/api'

interface ManualSearchRepo {
  repo_id: string
  full_name: string
  html_url: string
  description: string
  stargazers_count: number
  owner: {
    login: string
    avatar_url?: string
  }
}

interface ManualSearchModalProps {
  isOpen: boolean
  username?: string | null
  skills?: string[]
  onClose: (favorited: ManualSearchRepo[]) => void
}

const DEFAULT_HOT_KEYWORDS = ['good-first-issue', 'beginner-friendly', 'python', 'javascript', 'typescript']

const ManualSearchModal: React.FC<ManualSearchModalProps> = ({ isOpen, username, skills, onClose }) => {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ManualSearchRepo[]>([])
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set())
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setLoading(false)
      setError(null)
      setResults([])
      setFavoritedIds(new Set())
      setSelectedKeywords([])
    }
  }, [isOpen])

  const hotKeywords = useMemo(() => {
    if (skills && skills.length >= 2) {
      const shuffled = [...skills].sort(() => Math.random() - 0.5)
      const picked = shuffled.slice(0, 5)
      if (picked.length < 5) {
        const fallback = DEFAULT_HOT_KEYWORDS.filter(k => !picked.includes(k))
        return [...picked, ...fallback.slice(0, 5 - picked.length)]
      }
      return picked
    }
    return DEFAULT_HOT_KEYWORDS.slice(0, 5)
  }, [skills])

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await manualSearchAPI.searchGithub(query.trim())
      const repos: ManualSearchRepo[] = (data.items || []).map((item: any) => ({
        repo_id: item.full_name,
        full_name: item.full_name,
        html_url: item.html_url,
        description: item.description || '',
        stargazers_count: item.stargazers_count || 0,
        owner: {
          login: item.owner?.login || '',
          avatar_url: item.owner?.avatar_url
        }
      }))
      setResults(repos)
    } catch (e: any) {
      setError(e?.message || 'Search error')
    } finally {
      setLoading(false)
    }
  }

  const handleKeywordClick = (keyword: string) => {
    setSelectedKeywords(prev => {
      let next: string[]
      if (prev.includes(keyword)) {
        next = prev.filter(k => k !== keyword)
      } else {
        next = [...prev, keyword]
      }
      const queryString = next
        .map(k => k.replace(/\s+/g, '-'))
        .join(' AND ')
      setQuery(queryString)
      return next
    })
  }

  const toggleFavorite = (repoId: string) => {
    setFavoritedIds(prev => {
      const next = new Set(prev)
      if (next.has(repoId)) {
        next.delete(repoId)
      } else {
        next.add(repoId)
      }
      return next
    })
  }

  const handleClose = () => {
    const favorited = results.filter(r => favoritedIds.has(r.repo_id))
    onClose(favorited)
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.35)',
        zIndex: 9000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '90%',
          height: '90%',
          backgroundColor: theme.background,
          borderRadius: '12px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: theme.white
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, marginRight: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '18px' }}>🔍</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch()
                  }
                }}
                placeholder="搜索 GitHub 仓库，如：good-first-issue python"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: theme.primary,
                  color: theme.white,
                  fontSize: '14px',
                  cursor: 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? '搜索中...' : '搜索'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {hotKeywords.map((k) => {
                const active = selectedKeywords.includes(k)
                return (
                  <button
                    key={k}
                    onClick={() => handleKeywordClick(k)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      border: `1px solid ${active ? theme.primary : theme.border}`,
                      backgroundColor: active ? theme.primaryLight : theme.white,
                      color: active ? theme.primary : theme.text,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {k}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px'
          }}
        >
          {error && (
            <div style={{ marginBottom: '12px', color: '#d9534f', fontSize: '13px' }}>
              {error}
            </div>
          )}
          {!loading && results.length === 0 && !error && (
            <div style={{ marginTop: '40px', textAlign: 'center', color: theme.text, opacity: 0.7, fontSize: '14px' }}>
              输入关键词并搜索，结果将展示在这里
            </div>
          )}
          {results.map((repo) => {
            const isFavorited = favoritedIds.has(repo.repo_id)
            return (
              <div
                key={repo.repo_id}
                style={{
                  display: 'flex',
                  padding: '12px 16px',
                  marginBottom: '12px',
                  backgroundColor: theme.white,
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: theme.primary,
                      textDecoration: 'none'
                    }}
                  >
                    {repo.full_name}
                  </a>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: theme.text, opacity: 0.8 }}>
                    ⭐ {repo.stargazers_count} · {repo.owner.login}
                  </div>
                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '13px',
                      color: theme.text,
                      opacity: 0.8,
                      lineHeight: 1.5
                    }}
                  >
                    {repo.description || 'No description'}
                  </div>
                </div>
                <button
                  onClick={() => toggleFavorite(repo.repo_id)}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    color: isFavorited ? theme.accent : theme.border,
                    padding: 0,
                    minWidth: '24px'
                  }}
                  aria-label={isFavorited ? '取消收藏' : '收藏'}
                >
                  {isFavorited ? '♥' : '♡'}
                </button>
              </div>
            )
          })}
          {loading && (
            <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: theme.text }}>
              正在搜索 GitHub 仓库...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManualSearchModal

