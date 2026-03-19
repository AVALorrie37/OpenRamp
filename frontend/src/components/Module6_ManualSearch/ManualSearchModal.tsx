import React, { useState, useEffect, useMemo } from 'react'
import { manualSearchAPI } from '../../services/api'
import { Heart, Search, Star } from 'lucide-react'

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
  const [autoLoading, setAutoLoading] = useState(false)
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
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/35"
      onClick={handleClose}
    >
      <div
        className="relative flex h-[90%] w-[90%] flex-col overflow-hidden rounded-lg bg-background shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b border-border bg-surface px-6 py-4"
        >
          <div className="mr-4 flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex text-primary" aria-hidden="true">
                <Search size={18} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch()
                  }
                }}
                placeholder="搜索 GitHub 仓库，如：good-first-issue python"
                className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-none focus:border-primary"
              />
              <button
                onClick={() => void handleSearch()}
                disabled={loading || autoLoading}
                className="rounded-md bg-primary px-4 py-2 text-base text-white transition disabled:cursor-default disabled:opacity-70"
              >
                {loading ? '搜索中...' : '搜索'}
              </button>
              <button
                onClick={async () => {
                  const selected = selectedKeywords.length > 0 ? selectedKeywords : hotKeywords
                  const keywords = selected.map(k => k.replace(/\s+/g, '-'))
                  if (!keywords || keywords.length === 0) return
                  setAutoLoading(true)
                  setError(null)
                  try {
                    const data: any = await manualSearchAPI.autoMultiRoundSearch(keywords, perPage)
                    const repos: ManualSearchRepo[] = ((data as any).repos || []).map((item: any) => ({
                      repo_id: item.repo_id || item.full_name,
                      full_name: item.full_name || item.repo_id,
                      html_url: item.html_url || `https://github.com/${item.repo_id}`,
                      description: item.description || '',
                      stargazers_count: item.stargazers_count || 0,
                      updated_at: item.updated_at,
                      owner: {
                        login: item.owner?.login || (item.repo_id ? (item.repo_id.split('/')[0] || '') : ''),
                        avatar_url: item.owner?.avatar_url
                      }
                    }))
                    setResults(repos)
                    setTotalCount(repos.length)
                  } catch (e: any) {
                    setError(e?.message || 'Multi-round search error')
                  } finally {
                    setAutoLoading(false)
                  }
                }}
                disabled={loading || autoLoading}
                className={`rounded-md px-4 py-2 text-base text-white transition disabled:cursor-default disabled:opacity-70 ${
                  autoLoading ? 'bg-primaryLight' : 'bg-primary'
                }`}
              >
                {autoLoading ? '多轮搜索中...' : '一键多轮搜索'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text/80">推荐:</span>
              {hotKeywords.map((k) => {
                const active = selectedKeywords.includes(k)
                return (
                  <button
                    key={k}
                    onClick={() => handleKeywordClick(k)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      active ? 'border-primary bg-primaryLight text-primary' : 'border-border bg-surface text-text'
                    }`}
                  >
                    {k}
                  </button>
                )
              })}
              <div className="ml-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-text">
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) => setArchived(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <span>archived:{archived ? 'true' : 'false'}</span>
                </label>
                <label className="flex items-center gap-1 text-xs text-text">
                  <input
                    type="checkbox"
                    checked={usePushedFilter}
                    onChange={(e) => setUsePushedFilter(e.target.checked)}
                    className="cursor-pointer"
                  />
                  <span>pushed:&gt;</span>
                  <input
                    type="date"
                    value={pushedDate}
                    onChange={(e) => setPushedDate(e.target.value)}
                    disabled={!usePushedFilter}
                    className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-text"
                  />
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text/80">排序:</span>
              <button
                onClick={() => setSortKey('best')}
                className={`rounded-full border px-2 py-1 text-xs ${
                  sortKey === 'best' ? 'border-primary bg-primaryLight text-primary' : 'border-border bg-surface text-text'
                }`}
              >
                综合
              </button>
              <button
                onClick={() => setSortKey('stars')}
                className={`rounded-full border px-2 py-1 text-xs ${
                  sortKey === 'stars' ? 'border-primary bg-primaryLight text-primary' : 'border-border bg-surface text-text'
                }`}
              >
                按Star
              </button>
              <button
                onClick={() => setSortKey('updated')}
                className={`rounded-full border px-2 py-1 text-xs ${
                  sortKey === 'updated' ? 'border-primary bg-primaryLight text-primary' : 'border-border bg-surface text-text'
                }`}
              >
                按更新时间
              </button>
            </div>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          {error && (
            <div className="mb-3 text-sm text-error">
              {error}
            </div>
          )}
          {!loading && results.length === 0 && !error && (
            <div className="mt-10 text-center text-base text-text/70">
              输入关键词并搜索，结果将展示在这里
            </div>
          )}
          {sortedResults.map((repo) => {
            const isFavorited = favoritedIds.has(repo.repo_id)
            return (
              <div
                key={repo.repo_id}
                className="mb-3 flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={repo.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-base font-semibold text-primary no-underline"
                  >
                    {repo.full_name}
                  </a>
                  <div className="mt-1 text-xs text-text/80">
                    <span className="inline-flex items-center gap-1">
                      <Star size={14} />
                      <span>{repo.stargazers_count}</span>
                    </span>
                    <span> · {repo.owner.login}</span>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-text/80">
                    {repo.description || 'No description'}
                  </div>
                </div>
                <button
                  onClick={() => toggleFavorite(repo.repo_id)}
                  className={`min-w-6 bg-transparent p-0 text-2xl ${isFavorited ? 'text-accent' : 'text-border'}`}
                  aria-label={isFavorited ? '取消收藏' : '收藏'}
                >
                  <Heart size={18} fill={isFavorited ? 'currentColor' : 'none'} />
                </button>
              </div>
            )
          })}
          {loading && (
            <div className="mt-6 text-center text-base text-text">
              正在搜索 GitHub 仓库...
            </div>
          )}
          {!loading && totalPages > 0 && (
            <div
              className="mt-3 flex items-center justify-center gap-3 text-xs text-text"
            >
              <button
                onClick={handlePrevPage}
                disabled={!canPrev}
                className={`rounded-md border border-border px-2 py-1 ${canPrev ? 'bg-surface' : 'bg-background opacity-50'}`}
              >
                上一页
              </button>
              <span>
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={handleNextPage}
                disabled={!canNext}
                className={`rounded-md border border-border px-2 py-1 ${canNext ? 'bg-surface' : 'bg-background opacity-50'}`}
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

