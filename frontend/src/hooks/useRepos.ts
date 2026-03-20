import { useState, useEffect, useCallback } from 'react'
import { reposAPI, matchAPI } from '../services/api'
import { storage, DEFAULT_MATCH_WEIGHTS } from '../utils/storage'
import type { RepoResponse } from '../types'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

function stripMatchFields(repo: RepoResponse): RepoResponse {
  const next = { ...repo }
  delete next.match_score
  delete next.breakdown
  delete next.dynamic_weights
  return next
}

export const useRepos = (username: string | null) => {
  const [repos, setRepos] = useState<RepoResponse[]>([])
  const [reposMeta, setReposMeta] = useState<{ mode: string; source?: string }>({ mode: 'offline' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mergeWithFavorites = useCallback((list: RepoResponse[], uname: string | null): RepoResponse[] => {
    if (!uname) return list
    const favorites = storage.getUserFavorites(uname) || []
    if (!favorites || favorites.length === 0) return list
    const map = new Map<string, RepoResponse>()
    list.forEach((r) => {
      map.set(r.repo_id, { ...r, is_favorited: r.is_favorited === true })
    })
    favorites.forEach((fav: any) => {
      const repoId = fav.repo_id
      if (!repoId) {
        return
      }
      const existing = map.get(repoId)
      const base: RepoResponse = existing || fav
      map.set(repoId, { ...base, ...fav, is_favorited: true })
    })
    return Array.from(map.values()).map((r) => {
      if (r.name && r.name.trim().length > 0) return r
      const full = (r as any).full_name || r.repo_id || ''
      const parts = String(full).split('/')
      const repoName = parts.length === 2 ? parts[1] : (parts[0] || '')
      if (!repoName) return r
      return { ...r, name: repoName }
    })
  }, [])

  const applyMatchScores = useCallback(async (uname: string, list: RepoResponse[]): Promise<RepoResponse[]> => {
    const stored = storage.getUserMatchWeights(uname)
    const weights = stored ?? DEFAULT_MATCH_WEIGHTS
    return Promise.all(
      list.map(async (repo) => {
        const base = stripMatchFields(repo)
        try {
          const match = await matchAPI.calculate(uname, repo.repo_id, weights)
          if (typeof match.match_score !== 'number') {
            return base
          }
          return {
            ...base,
            match_score: match.match_score,
            breakdown: match.breakdown,
            dynamic_weights: match.dynamic_weights
          }
        } catch {
          return base
        }
      })
    )
  }, [])

  const loadPreset = useCallback(async () => {
    if (USE_MOCK) {
      const preset = storage.getPresetRepos()
      if (preset && preset.length > 0) {
        let list = preset as RepoResponse[]
        if (username) {
          list = await applyMatchScores(username, preset.map((r: RepoResponse) => ({ ...r })))
        }
        const finalList = username ? mergeWithFavorites(list, username) : list
        setRepos(finalList)
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      const response = await reposAPI.get({ limit: 10 })
      setReposMeta({ mode: response.mode, source: response.source })
      if (response.repos.length > 0) {
        storage.savePresetRepos(response.repos)
        let list = response.repos
        if (username) {
          list = await applyMatchScores(username, response.repos.map((r) => ({ ...r })))
        }
        const finalList = username ? mergeWithFavorites(list, username) : list
        setRepos(finalList)
      } else {
        setRepos([])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch repos')
      const fallback = storage.getPresetRepos()
      const raw = fallback && fallback.length > 0 ? fallback : []
      let list = raw as RepoResponse[]
      if (username && list.length > 0) {
        list = await applyMatchScores(username, raw.map((r: RepoResponse) => ({ ...r })))
      }
      const finalList = username ? mergeWithFavorites(list, username) : list
      setRepos(finalList)
    } finally {
      setLoading(false)
    }
  }, [username, mergeWithFavorites, applyMatchScores])

  const refreshRepos = useCallback(async (): Promise<RepoResponse[] | undefined> => {
    if (USE_MOCK) {
      if (username) {
        const userRepos = storage.getUserRepos(username)
        if (userRepos && userRepos.length > 0) {
          const mergedBase = mergeWithFavorites(userRepos, username)
          const updated = await applyMatchScores(username, mergedBase)
          storage.saveUserRepos(username, updated)
          setRepos(updated)
          return updated
        }
      }
      await loadPreset()
      return undefined
    }
    if (username) {
      setLoading(true)
      setError(null)
      try {
        let baseList = storage.getUserRepos(username)
        if (!baseList || baseList.length === 0) {
          const preset = storage.getPresetRepos()
          if (preset && preset.length > 0) {
            baseList = preset
          } else {
            await loadPreset()
            setLoading(false)
            return undefined
          }
        }

        const mergedBase = mergeWithFavorites(baseList, username)
        const updated = await applyMatchScores(username, mergedBase)

        storage.saveUserRepos(username, updated)
        setRepos(updated)
        return updated
      } catch (err: any) {
        setError(err.message || 'Failed to fetch repos')
        const userRepos = storage.getUserRepos(username)
        if (userRepos && userRepos.length > 0) {
          const merged = mergeWithFavorites(userRepos, username)
          setRepos(merged)
        } else {
          await loadPreset()
        }
        return undefined
      } finally {
        setLoading(false)
      }
    }
    await loadPreset()
    return undefined
  }, [username, loadPreset, mergeWithFavorites, applyMatchScores])

  useEffect(() => {
    loadPreset()
  }, [loadPreset])

  const fetchRepos = useCallback(
    async (params?: { mode?: string; repo_ids?: string[]; limit?: number }) => {
      setLoading(true)
      setError(null)
      try {
        const response = await reposAPI.get(params || { limit: 10 })
        setReposMeta({ mode: response.mode, source: response.source })
        const list = response.repos || []
        let merged = mergeWithFavorites(list, username)
        if (username && merged.length > 0) {
          merged = await applyMatchScores(username, merged.map((r) => ({ ...r })))
        }
        if (params?.repo_ids && params.repo_ids.length > 0 && username) {
          storage.saveUserRepos(username, merged)
        }
        if (!params?.repo_ids && list.length > 0) {
          const preset = storage.getPresetRepos()
          if (!preset || preset.length === 0) {
            storage.savePresetRepos(list)
          }
        }
        setRepos(merged)
        return merged
      } catch (err: any) {
        setError(err.message || 'Failed to fetch repos')
        console.error('Fetch repos error:', err)
        return undefined
      } finally {
        setLoading(false)
      }
    },
    [username, mergeWithFavorites, applyMatchScores]
  )

  const refreshToPreset = useCallback(() => {
    loadPreset()
  }, [loadPreset])

  const updateRepoMatchScore = useCallback((repoId: string, score: number) => {
    setRepos((prev) => {
      const next = prev.map((r) =>
        r.repo_id === repoId ? { ...r, match_score: score } : r
      )
      if (username) {
        const userRepos = storage.getUserRepos(username) || []
        const nextUserRepos = userRepos.map((r: any) =>
          r.repo_id === repoId ? { ...r, match_score: score } : r
        )
        storage.saveUserRepos(username, nextUserRepos)
      }
      return next
    })
  }, [username])

  const addRepo = useCallback((repo: RepoResponse) => {
    setRepos((prev) => {
      if (prev.some((r) => r.repo_id === repo.repo_id)) {
        return prev.map((r) => r.repo_id === repo.repo_id ? { ...r, ...repo, is_favorited: true } : r)
      }
      const next = [...prev, { ...repo, is_favorited: true }]
      if (username) {
        storage.saveUserRepos(username, next)
      }
      return next
    })
  }, [username])

  const deleteRepo = useCallback((repoId: string) => {
    setRepos((prev) => {
      const next = prev.filter((r) => r.repo_id !== repoId)
      if (username) {
        const userRepos = storage.getUserRepos(username) || []
        const nextUserRepos = userRepos.filter((r: any) => r.repo_id !== repoId)
        storage.saveUserRepos(username, nextUserRepos)
        const favorites = storage.getUserFavorites(username) || []
        const nextFavorites = favorites.filter((r: any) => r.repo_id !== repoId)
        storage.saveUserFavorites(username, nextFavorites)
      }
      return next
    })
  }, [username])

  const toggleFavorite = useCallback((repoId: string) => {
    if (!username) {
      return
    }
    setRepos((prev) => {
      const next = prev.map((r) =>
        r.repo_id === repoId ? { ...r, is_favorited: !r.is_favorited } : r
      )
      const favorites = storage.getUserFavorites(username) || []
      const exists = favorites.some((f: any) => f.repo_id === repoId)
      let nextFavorites: any[]
      if (exists) {
        nextFavorites = favorites.filter((f: any) => f.repo_id !== repoId)
      } else {
        const repo = next.find((r) => r.repo_id === repoId)
        if (!repo) {
          return next
        }
        nextFavorites = [...favorites, { ...repo, is_favorited: true }]
      }
      storage.saveUserFavorites(username, nextFavorites)
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
    toggleFavorite
  }
}
