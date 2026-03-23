import React, { useState, useEffect, useMemo } from 'react'
import { manualSearchAPI, matchAPI } from '../../services/api'
import { Heart, Loader2, Search, Star } from 'lucide-react'
import { DEFAULT_MATCH_WEIGHTS, storage } from '../../utils/storage'
import type { MatchResult } from '../../types'

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
  match_score?: number
  breakdown?: MatchResult['breakdown']
  dynamic_weights?: MatchResult['dynamic_weights']
  matchLoading?: boolean
}

interface ManualSearchModalProps {
  isOpen: boolean
  username?: string | null
  skills?: string[]
  onClose: (favorited: ManualSearchRepo[]) => void
}

const DEFAULT_HOT_KEYWORDS = ['good-first-issue', 'beginner-friendly', 'python', 'javascript', 'typescript']
type SortKey = 'best' | 'gh_stars' | 'gh_updated' | 'skill' | 'activity' | 'demand'
const backfillLocks = new Set<string>()
type ResultSource = 'keyword' | 'multi_round'

const getDefaultPushedDate = () => {
  const now = new Date()
  const d = new Date(now)
  d.setMonth(d.getMonth() - 6)
  const year = d.getFullYear()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const ManualSearchModal: React.FC<ManualSearchModalProps> = ({ isOpen, username, skills, onClose }) => {
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
  const [resultSource, setResultSource] = useState<ResultSource>('keyword')
  const [page, setPage] = useState<number>(1)
  const [totalCount, setTotalCount] = useState<number>(0)
  const perPage = 20
  const profileFingerprint = useMemo(
    () => (skills || []).map((s) => s.toLowerCase().trim()).sort().join('|'),
    [skills]
  )
  const weights = useMemo(() => {
    if (!username) return DEFAULT_MATCH_WEIGHTS
    return storage.getUserMatchWeights(username) || DEFAULT_MATCH_WEIGHTS
  }, [isOpen, username])
  const weightsFingerprint = `${weights.w_skill.toFixed(4)}|${weights.w_activity.toFixed(4)}|${weights.w_demand.toFixed(4)}`

  const getCurrentUser = () => {
    return (username || '').trim()
  }
  const buildCacheKey = (repoId: string) => `${repoId}|${weightsFingerprint}|${profileFingerprint}`

  const applyCachedMatch = (repo: ManualSearchRepo): ManualSearchRepo => {
    const username = getCurrentUser()
    if (!username) return repo
    if (
      typeof repo.match_score === 'number' &&
      typeof repo.breakdown?.skill === 'number' &&
      typeof repo.breakdown?.activity === 'number' &&
      typeof repo.breakdown?.demand === 'number'
    ) return repo
    const cached = storage.getManualMatchScore(username, buildCacheKey(repo.repo_id))
    if (!cached) return repo
    return {
      ...repo,
      match_score: cached.match_score,
      breakdown: cached.breakdown,
      dynamic_weights: cached.dynamic_weights
    }
  }

  const calculateAndCacheRepo = async (repoId: string): Promise<{ match_score: number; breakdown: MatchResult['breakdown']; dynamic_weights?: MatchResult['dynamic_weights'] } | null> => {
    const username = getCurrentUser()
    if (!username) return null
    const cacheKey = buildCacheKey(repoId)
    const cached = storage.getManualMatchScore(username, cacheKey)
    if (cached) {
      return {
        match_score: cached.match_score,
        breakdown: cached.breakdown,
        dynamic_weights: cached.dynamic_weights
      }
    }
    try {
      const match = await matchAPI.calculate(username, repoId, weights)
      if (
        typeof match.match_score !== 'number' ||
        typeof match.breakdown?.skill !== 'number' ||
        typeof match.breakdown?.activity !== 'number' ||
        typeof match.breakdown?.demand !== 'number'
      ) return null
      storage.saveManualMatchScore(username, cacheKey, {
        match_score: match.match_score,
        breakdown: match.breakdown,
        dynamic_weights: match.dynamic_weights,
        updated_at: Date.now()
      })
      return {
        match_score: match.match_score,
        breakdown: match.breakdown,
        dynamic_weights: match.dynamic_weights
      }
    } catch {
      return null
    }
  }

  const processBackfillQueue = async (uname: string) => {
    if (!uname || backfillLocks.has(uname)) return
    backfillLocks.add(uname)
    try {
      const tasks = storage.getManualBackfillQueue(uname)
      for (const task of tasks) {
        const cached = storage.getManualMatchScore(uname, task.cache_key)
        if (cached) {
          storage.removeManualBackfillTask(uname, task.cache_key)
          continue
        }
        try {
          const match = await matchAPI.calculate(uname, task.repo_id, task.weights)
          if (
            typeof match.match_score === 'number' &&
            typeof match.breakdown?.skill === 'number' &&
            typeof match.breakdown?.activity === 'number' &&
            typeof match.breakdown?.demand === 'number'
          ) {
            storage.saveManualMatchScore(uname, task.cache_key, {
              match_score: match.match_score,
              breakdown: match.breakdown,
              dynamic_weights: match.dynamic_weights,
              updated_at: Date.now()
            })
          }
        } catch {
        } finally {
          storage.removeManualBackfillTask(uname, task.cache_key)
        }
      }
    } finally {
      backfillLocks.delete(uname)
    }
  }

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
      setResultSource('keyword')
      setPage(1)
      setTotalCount(0)
    } else if (username) {
      void processBackfillQueue(username)
    }
  }, [isOpen, username])

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
      setResultSource('keyword')
      setResults(repos.map(applyCachedMatch))
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
    const uname = getCurrentUser()
    if (uname) {
      favorited.forEach((repo) => {
        const hasMatch = (
          typeof repo.match_score === 'number' &&
          typeof repo.breakdown?.skill === 'number' &&
          typeof repo.breakdown?.activity === 'number' &&
          typeof repo.breakdown?.demand === 'number'
        )
        if (hasMatch) return
        const cacheKey = buildCacheKey(repo.repo_id)
        storage.upsertManualBackfillTask(uname, {
          repo_id: repo.repo_id,
          cache_key: cacheKey,
          weights,
          profile_fingerprint: profileFingerprint
        })
      })
      void processBackfillQueue(uname)
    }
    onClose(favorited)
  }

  const hasCompleteMatch = (repo: ManualSearchRepo) => (
    typeof repo.match_score === 'number' &&
    typeof repo.breakdown?.skill === 'number' &&
    typeof repo.breakdown?.activity === 'number' &&
    typeof repo.breakdown?.demand === 'number'
  )

  const sortableMatchCount = useMemo(
    () => results.filter((r) => hasCompleteMatch(r)).length,
    [results]
  )
  const canSortByTags = sortableMatchCount >= 2

  const sortedResults = useMemo(() => {
    if (sortKey === 'gh_stars') {
      return [...results].sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    }
    if (sortKey === 'gh_updated') {
      return [...results].sort((a, b) => {
        const ta = a.updated_at ? Date.parse(a.updated_at) : 0
        const tb = b.updated_at ? Date.parse(b.updated_at) : 0
        return tb - ta
      })
    }
    if (sortKey === 'best') {
      if (resultSource === 'keyword') return results
      if (!canSortByTags) return results
      return [...results].sort((a, b) => {
        const av = hasCompleteMatch(a) ? (a.match_score ?? -1) : -1
        const bv = hasCompleteMatch(b) ? (b.match_score ?? -1) : -1
        if (bv !== av) return bv - av
        return (b.stargazers_count || 0) - (a.stargazers_count || 0)
      })
    }
    if (!canSortByTags) return results
    const scoreOf = (r: ManualSearchRepo) => {
      if (!hasCompleteMatch(r)) return -1
      if (sortKey === 'skill') return r.breakdown?.skill ?? -1
      if (sortKey === 'activity') return r.breakdown?.activity ?? -1
      return r.breakdown?.demand ?? -1
    }
    return [...results].sort((a, b) => {
      const va = scoreOf(a)
      const vb = scoreOf(b)
      if (vb !== va) return vb - va
      return (b.stargazers_count || 0) - (a.stargazers_count || 0)
    })
  }, [results, sortKey, canSortByTags, resultSource])

  const totalPages = totalCount > 0 ? Math.min(Math.ceil(totalCount / perPage), 50) : (results.length > 0 ? page : 0)
  const canPrev = page > 1
  const canNext = totalPages > 0 && page < totalPages
  const hasSearchResults = results.length > 0

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
                    const data: any = await manualSearchAPI.autoMultiRoundSearch(keywords, perPage, username || undefined)
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
                      },
                      match_score: item.match_score,
                      breakdown: item.breakdown || item.match_breakdown
                    }))
                    setResultSource('multi_round')
                    setResults(repos.map(applyCachedMatch))
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
                      active ? 'border-primary bg-primary text-white' : 'border-[#9AA6A0] bg-[#EEF2EF]/40 text-text'
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
                onClick={() => hasSearchResults && setSortKey('best')}
                disabled={!hasSearchResults}
                title={!hasSearchResults ? '搜索后解锁排序' : undefined}
                className={`rounded-full border px-2 py-1 text-xs ${
                  !hasSearchResults
                    ? 'cursor-not-allowed border-border bg-background text-text/50'
                    : sortKey === 'best'
                    ? 'border-primary bg-primary text-white'
                    : 'border-primary/40 bg-primaryLight/60 text-text'
                }`}
              >
                综合
              </button>
              <button
                onClick={() => hasSearchResults && setSortKey('gh_stars')}
                disabled={!hasSearchResults}
                title={!hasSearchResults ? '搜索后解锁排序' : undefined}
                className={`rounded-full border px-2 py-1 text-xs ${
                  !hasSearchResults
                    ? 'cursor-not-allowed border-border bg-background text-text/50'
                    : sortKey === 'gh_stars'
                    ? 'border-primary bg-primary text-white'
                    : 'border-primary/40 bg-primaryLight/60 text-text'
                }`}
              >
                按Star
              </button>
              <button
                onClick={() => hasSearchResults && setSortKey('gh_updated')}
                disabled={!hasSearchResults}
                title={!hasSearchResults ? '搜索后解锁排序' : undefined}
                className={`rounded-full border px-2 py-1 text-xs ${
                  !hasSearchResults
                    ? 'cursor-not-allowed border-border bg-background text-text/50'
                    : sortKey === 'gh_updated'
                    ? 'border-primary bg-primary text-white'
                    : 'border-primary/40 bg-primaryLight/60 text-text'
                }`}
              >
                按更新时间
              </button>
              <button
                onClick={() => canSortByTags && setSortKey('skill')}
                disabled={!canSortByTags}
                title={!canSortByTags ? '多轮搜索后解锁排序' : undefined}
                className={`rounded-full border px-2 py-1 text-xs ${
                  !canSortByTags
                    ? 'cursor-not-allowed border-border bg-background text-text/50'
                    : sortKey === 'skill'
                      ? 'border-primary bg-primary text-white'
                      : 'border-primary/40 bg-primaryLight/60 text-text'
                }`}
              >
                技能
              </button>
              <button
                onClick={() => canSortByTags && setSortKey('activity')}
                disabled={!canSortByTags}
                title={!canSortByTags ? '多轮搜索后解锁排序' : undefined}
                className={`rounded-full border px-2 py-1 text-xs ${
                  !canSortByTags
                    ? 'cursor-not-allowed border-border bg-background text-text/50'
                    : sortKey === 'activity'
                      ? 'border-primary bg-primary text-white'
                      : 'border-primary/40 bg-primaryLight/60 text-text'
                }`}
              >
                活跃
              </button>
              <button
                onClick={() => canSortByTags && setSortKey('demand')}
                disabled={!canSortByTags}
                title={!canSortByTags ? '多轮搜索后解锁排序' : undefined}
                className={`rounded-full border px-2 py-1 text-xs ${
                  !canSortByTags
                    ? 'cursor-not-allowed border-border bg-background text-text/50'
                    : sortKey === 'demand'
                      ? 'border-primary bg-primary text-white'
                      : 'border-primary/40 bg-primaryLight/60 text-text'
                }`}
              >
                需求
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
            const hasMatch = typeof repo.match_score === 'number' &&
              typeof repo.breakdown?.skill === 'number' &&
              typeof repo.breakdown?.activity === 'number' &&
              typeof repo.breakdown?.demand === 'number'
            const canManualCalculate = resultSource === 'keyword' && !hasMatch
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
                <div className="flex min-w-[220px] flex-col items-end gap-2 self-start">
                  {hasMatch && (
                    <div className="max-w-[320px] overflow-x-auto">
                      <div className="flex w-max justify-end gap-1 whitespace-nowrap">
                      <span className="rounded bg-primary px-2 py-1 text-xs font-medium text-white">
                        匹配{Math.round((repo.match_score || 0) * 100)}%
                      </span>
                      <span className="rounded bg-primaryLight px-2 py-1 text-xs font-medium text-text">
                        技能{Math.round((repo.breakdown?.skill || 0) * 100)}%
                      </span>
                      <span className="rounded bg-primaryLight px-2 py-1 text-xs font-medium text-text">
                        活跃{Math.round((repo.breakdown?.activity || 0) * 100)}%
                      </span>
                      <span className="rounded bg-primaryLight px-2 py-1 text-xs font-medium text-text">
                        需求{Math.round((repo.breakdown?.demand || 0) * 100)}%
                      </span>
                      </div>
                    </div>
                  )}
                  {canManualCalculate && (
                    <button
                      onClick={async () => {
                        setResults((prev) => prev.map((r) => r.repo_id === repo.repo_id ? { ...r, matchLoading: true } : r))
                        const m = await calculateAndCacheRepo(repo.repo_id)
                        setResults((prev) => prev.map((r) => {
                          if (r.repo_id !== repo.repo_id) return r
                          if (!m) return { ...r, matchLoading: false }
                          return {
                            ...r,
                            matchLoading: false,
                            match_score: m.match_score,
                            breakdown: m.breakdown,
                            dynamic_weights: m.dynamic_weights
                          }
                        }))
                      }}
                      disabled={repo.matchLoading}
                      className="rounded-md border border-primary bg-surface px-2 py-1 text-xs text-primary"
                    >
                      {repo.matchLoading ? <Loader2 size={14} className="animate-spin" /> : '计算匹配'}
                    </button>
                  )}
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

