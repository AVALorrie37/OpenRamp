import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { reposAPI, userReposAPI } from '../services/api'
import { storage } from '../utils/storage'
import type { RepoResponse } from '../types'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export const useRepos = (username: string | null, sessionReady = true) => {
  const [repos, setRepos] = useState<RepoResponse[]>([])
  const [reposMeta, setReposMeta] = useState<{ mode: string; source?: string }>({ mode: 'offline' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usernameRef = useRef<string | null>(username)
  const requestIdRef = useRef(0)
  usernameRef.current = username

  const beginRequest = useCallback(() => {
    requestIdRef.current += 1
    return requestIdRef.current
  }, [])

  const isRequestCurrent = useCallback((requestId: number, uname: string | null) => {
    return requestId === requestIdRef.current && usernameRef.current === uname
  }, [])

  const normalizeRepoName = useCallback((repo: RepoResponse): RepoResponse => {
    if (repo.name && repo.name.trim().length > 0) return repo
    const full = (repo as any).full_name || repo.repo_id || ''
    const parts = String(full).split('/')
    const repoName = parts.length === 2 ? parts[1] : (parts[0] || '')
    if (!repoName) return repo
    return { ...repo, name: repoName }
  }, [])

  const loadPreset = useCallback(async () => {
    const uname = username
    const requestId = beginRequest()

    if (uname) {
      setLoading(true)
      setError(null)
      try {
        const res = await userReposAPI.list(uname)
        if (!isRequestCurrent(requestId, uname)) return
        const list = (res.repos || []).map(normalizeRepoName)
        setRepos(list)
        setReposMeta({ mode: 'user_online', source: 'user_repo_store' })
      } catch (err: any) {
        if (!isRequestCurrent(requestId, uname)) return
        setError(err.message || 'Failed to fetch user repos')
        setRepos([])
        setReposMeta({ mode: 'user_online', source: 'user_repo_store' })
      } finally {
        if (isRequestCurrent(requestId, uname)) setLoading(false)
      }
      return
    }

    if (USE_MOCK) {
      const preset = storage.getPresetRepos()
      if (preset && preset.length > 0) {
        setRepos((preset as RepoResponse[]).map(normalizeRepoName))
        setReposMeta({ mode: 'offline', source: 'offline_dataset' })
        setError(null)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    setError(null)
    try {
      const response = await reposAPI.get({ limit: 10 })
      if (!isRequestCurrent(requestId, uname)) return
      setReposMeta({ mode: response.mode, source: response.source })
      if (response.repos.length > 0) {
        storage.savePresetRepos(response.repos)
        setRepos((response.repos as RepoResponse[]).map(normalizeRepoName))
      } else {
        setRepos([])
      }
    } catch (err: any) {
      if (!isRequestCurrent(requestId, uname)) return
      setError(err.message || 'Failed to fetch repos')
      const fallback = storage.getPresetRepos()
      const raw = fallback && fallback.length > 0 ? fallback : []
      setRepos((raw as RepoResponse[]).map(normalizeRepoName))
      setReposMeta({ mode: 'offline', source: 'offline_dataset' })
    } finally {
      if (isRequestCurrent(requestId, uname)) setLoading(false)
    }
  }, [username, beginRequest, isRequestCurrent, normalizeRepoName])

  const refreshRepos = useCallback(async (): Promise<RepoResponse[] | undefined> => {
    const uname = username
    if (uname) {
      setLoading(true)
      setError(null)
      try {
        const res = await userReposAPI.list(uname)
        const list = (res.repos || []).map(normalizeRepoName)
        setRepos(list)
        setReposMeta({ mode: 'user_online', source: 'user_repo_store' })
        return list
      } catch (err: any) {
        setError(err.message || 'Failed to fetch user repos')
        setRepos([])
        setReposMeta({ mode: 'user_online', source: 'user_repo_store' })
        return undefined
      } finally {
        setLoading(false)
      }
    }
    await loadPreset()
    return undefined
  }, [username, loadPreset, normalizeRepoName])

  useLayoutEffect(() => {
    requestIdRef.current += 1
  }, [username])

  useLayoutEffect(() => {
    if (!sessionReady) return
    if (username !== null) return
    const preset = storage.getPresetRepos()
    if (preset && Array.isArray(preset) && preset.length > 0) {
      setRepos(preset as RepoResponse[])
      setReposMeta({ mode: 'offline', source: 'offline_dataset' })
    } else {
      setRepos([])
      setReposMeta({ mode: 'offline' })
    }
    setError(null)
    setLoading(false)
  }, [username, sessionReady])

  useEffect(() => {
    if (!sessionReady) return
    loadPreset()
  }, [sessionReady, loadPreset])

  const fetchRepos = useCallback(
    async (params?: { mode?: string; repo_ids?: string[]; limit?: number }) => {
      const uname = username
      const requestId = beginRequest()
      setLoading(true)
      setError(null)
      try {
        const response = await reposAPI.get(params || { limit: 10 })
        if (!isRequestCurrent(requestId, uname)) return undefined
        const list = (response.repos || []).map(normalizeRepoName)
        if (uname) {
          // Logged-in: persist these as user online repos (not preset/offline).
          await Promise.all(
            list.map(async (r) => {
              try {
                await userReposAPI.upsert(uname, r)
              } catch {}
            })
          )
          const refreshed = await userReposAPI.list(uname)
          const final = (refreshed.repos || []).map(normalizeRepoName)
          if (!isRequestCurrent(requestId, uname)) return undefined
          setReposMeta({ mode: 'user_online', source: 'user_repo_store' })
          setRepos(final)
          return final
        }
        // Not logged in: keep preset behavior.
        setReposMeta({ mode: response.mode, source: response.source })
        if (!params?.repo_ids && list.length > 0) {
          const preset = storage.getPresetRepos()
          if (!preset || preset.length === 0) {
            storage.savePresetRepos(list)
          }
        }
        setRepos(list)
        return list
      } catch (err: any) {
        if (!isRequestCurrent(requestId, uname)) return undefined
        setError(err.message || 'Failed to fetch repos')
        console.error('Fetch repos error:', err)
        return undefined
      } finally {
        if (isRequestCurrent(requestId, uname)) {
          setLoading(false)
        }
      }
    },
    [username, beginRequest, isRequestCurrent, normalizeRepoName]
  )

  const refreshToPreset = useCallback(() => {
    loadPreset()
  }, [loadPreset])

  const updateRepoMatchScore = useCallback((repoId: string, score: number) => {
    setRepos((prev) => {
      const next = prev.map((r) =>
        r.repo_id === repoId ? { ...r, match_score: score } : r
      )
      return next
    })
  }, [username])

  const updateRepoMatchData = useCallback((
    repoId: string,
    match: { match_score: number; breakdown?: RepoResponse['breakdown']; dynamic_weights?: RepoResponse['dynamic_weights'] }
  ) => {
    setRepos((prev) => {
      const next = prev.map((r) =>
        r.repo_id === repoId
          ? {
              ...r,
              match_score: match.match_score,
              breakdown: match.breakdown ?? r.breakdown,
              dynamic_weights: match.dynamic_weights ?? r.dynamic_weights
            }
          : r
      )
      return next
    })
  }, [username])

  const addRepo = useCallback((repo: RepoResponse) => {
    setRepos((prev) => {
      if (prev.some((r) => r.repo_id === repo.repo_id)) {
        return prev.map((r) => r.repo_id === repo.repo_id ? { ...r, ...repo } : r)
      }
      const next = [...prev, { ...repo }]
      return next
    })
    if (username) {
      void userReposAPI.upsert(username, repo).catch(() => {})
    }
  }, [username])

  const deleteRepo = useCallback((repoId: string) => {
    setRepos((prev) => {
      const next = prev.filter((r) => r.repo_id !== repoId)
      return next
    })
    if (username) {
      void userReposAPI.delete(username, repoId).catch(() => {})
    }
  }, [username])

  const toggleFavorite = useCallback((repoId: string) => {
    if (!username) {
      return
    }
    setRepos((prev) => {
      const next = prev.map((r) => {
        if (r.repo_id !== repoId) return r
        const is_favorited = !r.is_favorited
        const updated = { ...r, is_favorited }
        void userReposAPI.upsert(username, updated).catch(() => {})
        return updated
      })
      return next
    })
  }, [username])

  return {
    repos,
    reposMeta,
    loading,
    error,
    fetchRepos,
    refresh: refreshToPreset,
    refreshRepos,
    addRepo,
    deleteRepo,
    updateRepoMatchScore,
    updateRepoMatchData,
    toggleFavorite
  }
}
