import { useState, useEffect, useCallback } from 'react'
import { reposAPI, searchAPI } from '../services/api'
import { storage } from '../utils/storage'
import type { RepoResponse } from '../types'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export const useRepos = (username: string | null) => {
  const [repos, setRepos] = useState<RepoResponse[]>([])
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
    return Array.from(map.values())
  }, [])

  const loadPreset = useCallback(async () => {
    if (USE_MOCK) {
      const preset = storage.getPresetRepos()
      if (preset && preset.length > 0) {
        setRepos(preset)
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      const response = await reposAPI.get({ limit: 10 })
      if (response.repos.length > 0) {
        storage.savePresetRepos(response.repos)
        setRepos(response.repos)
      } else {
        setRepos([])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch repos')
      const fallback = storage.getPresetRepos()
      setRepos(fallback && fallback.length > 0 ? fallback : [])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshRepos = useCallback(async () => {
    if (USE_MOCK) {
      if (username) {
        const userRepos = storage.getUserRepos(username)
        if (userRepos && userRepos.length > 0) {
          setRepos(userRepos)
          return
        }
      }
      await loadPreset()
      return
    }
    if (username) {
      setLoading(true)
      setError(null)
      try {
        const response = await searchAPI.search(username, 10)
        const list = response.repos || []
        const merged = mergeWithFavorites(list, username)
        if (merged.length > 0) {
          storage.saveUserRepos(username, merged)
          setRepos(merged)
        } else {
          const userRepos = storage.getUserRepos(username)
          if (userRepos && userRepos.length > 0) {
            setRepos(mergeWithFavorites(userRepos, username))
          } else {
            await loadPreset()
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch repos')
        const userRepos = storage.getUserRepos(username)
        if (userRepos && userRepos.length > 0) {
          setRepos(mergeWithFavorites(userRepos, username))
        } else {
          await loadPreset()
        }
      } finally {
        setLoading(false)
      }
      return
    }
    await loadPreset()
  }, [username, loadPreset])

  useEffect(() => {
    refreshRepos()
  }, [refreshRepos])

  const fetchRepos = useCallback(async (params?: { mode?: string; repo_ids?: string[]; limit?: number }) => {
    setLoading(true)
    setError(null)
    try {
      const response = await reposAPI.get(params || { limit: 10 })
      const list = response.repos || []
      const merged = mergeWithFavorites(list, username)
      if (params?.repo_ids && params.repo_ids.length > 0 && merged.length > 0 && username) {
        storage.saveUserRepos(username, merged)
      }
      if (!params?.repo_ids && list.length > 0) {
        const preset = storage.getPresetRepos()
        if (!preset || preset.length === 0) {
          storage.savePresetRepos(list)
        }
      }
      setRepos(merged)
      if (username && merged.length > 0) {
        const favorites = merged.filter(r => r.is_favorited)
        if (favorites.length > 0) {
          storage.saveUserFavorites(username, favorites)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch repos')
      console.error('Fetch repos error:', err)
    } finally {
      setLoading(false)
    }
  }, [username, mergeWithFavorites])

  const refreshToPreset = useCallback(() => {
    loadPreset()
  }, [loadPreset])

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

  return {
    repos,
    loading,
    error,
    fetchRepos,
    refresh: refreshToPreset,
    refreshRepos,
    deleteRepo
  }
}
