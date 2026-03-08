import { useState, useEffect, useCallback } from 'react'
import { reposAPI } from '../services/api'
import { storage } from '../utils/storage'
import type { RepoResponse } from '../types'

export const useRepos = (username: string | null) => {
  const [repos, setRepos] = useState<RepoResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPreset = useCallback(async () => {
    const preset = storage.getPresetRepos()
    if (preset && preset.length > 0) {
      setRepos(preset)
      return
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
      setRepos([])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshRepos = useCallback(async () => {
    if (username) {
      const userRepos = storage.getUserRepos(username)
      if (userRepos && userRepos.length > 0) {
        setRepos(userRepos)
        return
      }
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
      if (params?.repo_ids && params.repo_ids.length > 0 && list.length > 0 && username) {
        storage.saveUserRepos(username, list)
      }
      if (!params?.repo_ids && list.length > 0) {
        const preset = storage.getPresetRepos()
        if (!preset || preset.length === 0) {
          storage.savePresetRepos(list)
        }
      }
      setRepos(list)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch repos')
      console.error('Fetch repos error:', err)
    } finally {
      setLoading(false)
    }
  }, [username])

  const refreshToPreset = useCallback(() => {
    loadPreset()
  }, [loadPreset])

  return {
    repos,
    loading,
    error,
    fetchRepos,
    refresh: refreshToPreset,
    refreshRepos
  }
}
