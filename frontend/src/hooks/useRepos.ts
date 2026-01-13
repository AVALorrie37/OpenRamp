import { useState, useEffect } from 'react'
import { reposAPI } from '../services/api'
import type { RepoResponse } from '../types'

export const useRepos = () => {
  const [repos, setRepos] = useState<RepoResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRepos = async (params?: { mode?: string; repo_ids?: string[]; limit?: number }) => {
    setLoading(true)
    setError(null)
    try {
      const response = await reposAPI.get(params)
      setRepos(response.repos)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch repos')
      console.error('Fetch repos error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRepos({ limit: 10 })
  }, [])

  return {
    repos,
    loading,
    error,
    fetchRepos,
    refresh: () => fetchRepos({ limit: 10 })
  }
}
