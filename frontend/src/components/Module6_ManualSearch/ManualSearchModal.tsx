import React, { useState, useEffect, useMemo } from 'react'
import { theme } from '../../styles/theme'
import { manualSearchAPI } from '../../services/api'

interface ManualSearchRepo {
  repo_id: string
  full_name: string
  html_url: string
  description: string
  stargazers_count: number
  updated_at?: string
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
type SortKey = 'best' | 'stars' | 'updated'

const getDefaultPushedDate = () => {
  const now = new Date()
  const d = new Date(now)
  d.setMonth(d.getMonth() - 6)
  const year = d.getFullYear()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const ManualSearchModal: React.FC<ManualSearchModalProps> = ({ isOpen, skills, onClose }) => {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ManualSearchRepo[]>([])
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set())
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [archived, setArchived] = useState<boolean>(false)
  const [usePushedFilter, setUsePushedFilter] = useState<boolean>(true)
  const [pushedDate, setPushedDate] = useState<string>(getDefaultPushedDate)
  const [sortKey, setSortKey] = useState<SortKey>('best')
  const [page, setPage] = useState<number>(1)
  const [totalCount, setTotalCount] = useState<number>(0)
  const perPage = 20

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setLoading(false)
      setError(null)
      setResults([])
      setFavoritedIds(new Set())
      setSelectedKeywords([])
      setArchived(false)
      setUsePushedFilter(true)
      setPushedDate(getDefaultPushedDate())
      setSortKey('best')
      setPage(1)
      setTotalCount(0)
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

  const buildSearchQuery = () => {
    const parts: string[] = []
    if (query.trim()) {
      parts.push(query.trim())
    }
    parts.push(`archived:${archived ? 'true' : 'false'}`)
    if (usePushedFilter && pushedDate.trim()) {
      parts.push(`pushed:>${pushedDate.trim()}`)
    }
    return parts.join(' ')
  }

  const handleSearch = async (targetPage?: number) => {
    const finalQuery = buildSearchQuery()
    if (!finalQuery.trim()) return
    const nextPage = targetPage ?? 1
    if (!targetPage) {
      setPage(1)
    } else {
      setPage(nextPage)
    }
    setLoading(true)
    setError(null)
    try {
      const data: any = await manualSearchAPI.searchGithub(finalQuery, perPage, nextPage)
      setTotalCount(typeof (data as any).total_count === 'number' ? (data as any).total_count : 0)
      const repos: ManualSearchRepo[] = ((data as any).items || []).map((item: any) => ({
        repo_id: item.full_name,
        full_name: item.full_name,
        html_url: item.html_url,
        description: item.description || '',
        stargazers_count: item.stargazers_count || 0,
        updated_at: item.updated_at,
        owner: {
          login: item.owner?.login || '',
          avatar_url: item.owner?.avatar_url
        }
      }))
      setResults(repos)
      try {
        window.localStorage.setItem(
          'manual_search_last_results',
          JSON.stringify({
            query: finalQuery,
            items: repos
          })
        )
      } catch {
      }
    } catch (e: any) {
      let fallbackUsed = false
      try {
        const cachedRaw = window.localStorage.getItem('manual_search_last_results')
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as { query: string; items: ManualSearchRepo[] }
          if (cached.items && cached.items.length > 0) {
            setResults(cached.items)
            setTotalCount(cached.items.length)
            fallbackUsed = true
          }
        }
      } catch {
      }
      if (!fallbackUsed) {
        setError(e?.message || 'Search error')
      } else {
        setError('当前网络不可用，已展示最近一次搜索结果（离线缓存）。')
      }
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

  const sortedResults = useMemo(() => {
    if (sortKey === 'stars') {
      return [...results].sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    }
    if (sortKey === 'updated') {
      return [...results].sort((a, b) => {
        const ta = a.updated_at ? Date.parse(a.updated_at) : 0
        const tb = b.updated_at ? Date.parse(b.updated_at) : 0
        return tb - ta
      })
    }
    return results
  }, [results, sortKey])

  const totalPages = totalCount > 0 ? Math.min(Math.ceil(totalCount / perPage), 50) : (results.length > 0 ? page : 0)
  const canPrev = page > 1
  const canNext = totalPages > 0 && page < totalPages

  const handlePrevPage = () => {
    if (canPrev) {
      void handleSearch(page - 1)
    }
  }

  const handleNextPage = () => {
    if (canNext) {
      void handleSearch(page + 1)
    }
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
                onClick={() => void handleSearch()}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: theme.text, opacity: 0.8 }}>推荐:</span>
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
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '8px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: theme.text }}>
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) => setArchived(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>archived:{archived ? 'true' : 'false'}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: theme.text }}>
                  <input
                    type="checkbox"
                    checked={usePushedFilter}
                    onChange={(e) => setUsePushedFilter(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>pushed:&gt;</span>
                  <input
                    type="date"
                    value={pushedDate}
                    onChange={(e) => setPushedDate(e.target.value)}
                    disabled={!usePushedFilter}
                    style={{
                      padding: '4px 6px',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border}`,
                      fontSize: '12px'
                    }}
                  />
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: theme.text, opacity: 0.8 }}>排序:</span>
              <button
                onClick={() => setSortKey('best')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '999px',
                  border: `1px solid ${sortKey === 'best' ? theme.primary : theme.border}`,
                  backgroundColor: sortKey === 'best' ? theme.primaryLight : theme.white,
                  fontSize: '12px',
                  cursor: 'pointer',
                  color: sortKey === 'best' ? theme.primary : theme.text
                }}
              >
                综合
              </button>
              <button
                onClick={() => setSortKey('stars')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '999px',
                  border: `1px solid ${sortKey === 'stars' ? theme.primary : theme.border}`,
                  backgroundColor: sortKey === 'stars' ? theme.primaryLight : theme.white,
                  fontSize: '12px',
                  cursor: 'pointer',
                  color: sortKey === 'stars' ? theme.primary : theme.text
                }}
              >
                按Star
              </button>
              <button
                onClick={() => setSortKey('updated')}
                style={{
                  padding: '4px 8px',
                  borderRadius: '999px',
                  border: `1px solid ${sortKey === 'updated' ? theme.primary : theme.border}`,
                  backgroundColor: sortKey === 'updated' ? theme.primaryLight : theme.white,
                  fontSize: '12px',
                  cursor: 'pointer',
                  color: sortKey === 'updated' ? theme.primary : theme.text
                }}
              >
                按更新时间
              </button>
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
          {sortedResults.map((repo) => {
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
          {!loading && totalPages > 0 && (
            <div
              style={{
                marginTop: '12px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                fontSize: '12px',
                color: theme.text
              }}
            >
              <button
                onClick={handlePrevPage}
                disabled={!canPrev}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: canPrev ? theme.white : theme.background,
                  cursor: canPrev ? 'pointer' : 'default',
                  opacity: canPrev ? 1 : 0.5
                }}
              >
                上一页
              </button>
              <span>
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={handleNextPage}
                disabled={!canNext}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: canNext ? theme.white : theme.background,
                  cursor: canNext ? 'pointer' : 'default',
                  opacity: canNext ? 1 : 0.5
                }}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManualSearchModal

