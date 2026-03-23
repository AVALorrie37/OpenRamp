// frontend/src/utils/storage.ts

const STORAGE_PREFIX = 'user_'
const CHAT_MESSAGES_PREFIX = 'chat_messages_'
const _reposSuffix = () => (import.meta.env.VITE_USE_MOCK === 'true' ? '_mock' : '_live')
const _presetReposKey = () => `preset_repos${_reposSuffix()}`
const _userReposKey = (username: string) => `user_repos_${username}${_reposSuffix()}`

// 收藏仓库的 key 去掉环境后缀，线上/本地共用
const _userFavoritesKey = (username: string) => `user_repos_${username}_favorites`

const _userMatchWeightsKey = (username: string) => `user_match_weights_${username}${_reposSuffix()}`
const _manualMatchCacheKey = (username: string, cacheKey: string) => `manual_match_cache_${username}_${cacheKey}${_reposSuffix()}`
const _manualBackfillQueueKey = (username: string) => `manual_match_backfill_queue_${username}${_reposSuffix()}`

export type StoredMatchWeights = { w_skill: number; w_activity: number; w_demand: number }
export type StoredMatchBreakdown = { skill: number; activity: number; demand: number }
export type StoredDynamicWeights = { w_skill: number; w_activity: number; w_demand: number; c_data: number }
export type StoredManualMatch = {
  match_score: number
  breakdown: StoredMatchBreakdown
  dynamic_weights?: StoredDynamicWeights
  updated_at: number
}
export type StoredManualBackfillTask = {
  repo_id: string
  cache_key: string
  weights: StoredMatchWeights
  profile_fingerprint: string
}

export const DEFAULT_MATCH_WEIGHTS: StoredMatchWeights = {
  w_skill: 0.5,
  w_activity: 0.3,
  w_demand: 0.2
}

export const storage = {
  getUserData: (username: string): any => {
    const key = `${STORAGE_PREFIX}${username}`
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  },

  saveUserData: (username: string, data: any): void => {
    const key = `${STORAGE_PREFIX}${username}`
    localStorage.setItem(key, JSON.stringify(data))
  },

  clearUserData: (username: string): void => {
    const key = `${STORAGE_PREFIX}${username}`
    localStorage.removeItem(key)
  },

  getChatMessages: (username: string): any[] => {
    const key = `${CHAT_MESSAGES_PREFIX}${username}`
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : []
  },

  saveChatMessages: (username: string, messages: any[]): void => {
    const key = `${CHAT_MESSAGES_PREFIX}${username}`
    localStorage.setItem(key, JSON.stringify(messages))
  },

  clearChatMessages: (username: string): void => {
    const key = `${CHAT_MESSAGES_PREFIX}${username}`
    localStorage.removeItem(key)
  },

  getSessionId: (username: string): string | null => {
    const key = `session_id_${username}`
    return localStorage.getItem(key)
  },

  saveSessionId: (username: string, sessionId: string): void => {
    const key = `session_id_${username}`
    localStorage.setItem(key, sessionId)
  },

  clearSessionId: (username: string): void => {
    const key = `session_id_${username}`
    localStorage.removeItem(key)
  },

  getPresetRepos: (): any[] | null => {
    const data = localStorage.getItem(_presetReposKey())
    return data ? JSON.parse(data) : null
  },

  savePresetRepos: (repos: any[]): void => {
    localStorage.setItem(_presetReposKey(), JSON.stringify(repos))
  },

  getUserRepos: (username: string): any[] | null => {
    const data = localStorage.getItem(_userReposKey(username))
    return data ? JSON.parse(data) : null
  },

  saveUserRepos: (username: string, repos: any[]): void => {
    localStorage.setItem(_userReposKey(username), JSON.stringify(repos))
  },

  getUserFavorites: (username: string): any[] | null => {
    const data = localStorage.getItem(_userFavoritesKey(username))
    return data ? JSON.parse(data) : null
  },

  saveUserFavorites: (username: string, repos: any[]): void => {
    localStorage.setItem(_userFavoritesKey(username), JSON.stringify(repos))
  },

  getUserMatchWeights: (username: string): StoredMatchWeights | null => {
    const data = localStorage.getItem(_userMatchWeightsKey(username))
    if (!data) return null
    try {
      const w = JSON.parse(data) as StoredMatchWeights
      if (
        typeof w?.w_skill === 'number' &&
        typeof w?.w_activity === 'number' &&
        typeof w?.w_demand === 'number'
      ) {
        return w
      }
    } catch {
      /* ignore */
    }
    return null
  },

  saveUserMatchWeights: (username: string, weights: StoredMatchWeights): void => {
    localStorage.setItem(_userMatchWeightsKey(username), JSON.stringify(weights))
  },

  getManualMatchScore: (username: string, cacheKey: string): StoredManualMatch | null => {
    const data = localStorage.getItem(_manualMatchCacheKey(username, cacheKey))
    if (!data) return null
    try {
      const parsed = JSON.parse(data) as StoredManualMatch
      if (
        typeof parsed?.match_score === 'number' &&
        typeof parsed?.breakdown?.skill === 'number' &&
        typeof parsed?.breakdown?.activity === 'number' &&
        typeof parsed?.breakdown?.demand === 'number'
      ) {
        return parsed
      }
    } catch {
      /* ignore */
    }
    return null
  },

  saveManualMatchScore: (username: string, cacheKey: string, match: StoredManualMatch): void => {
    localStorage.setItem(_manualMatchCacheKey(username, cacheKey), JSON.stringify(match))
  },

  getManualBackfillQueue: (username: string): StoredManualBackfillTask[] => {
    const data = localStorage.getItem(_manualBackfillQueueKey(username))
    if (!data) return []
    try {
      const parsed = JSON.parse(data) as StoredManualBackfillTask[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  },

  saveManualBackfillQueue: (username: string, tasks: StoredManualBackfillTask[]): void => {
    localStorage.setItem(_manualBackfillQueueKey(username), JSON.stringify(tasks))
  },

  upsertManualBackfillTask: (username: string, task: StoredManualBackfillTask): void => {
    const tasks = storage.getManualBackfillQueue(username)
    const idx = tasks.findIndex((t) => t.cache_key === task.cache_key)
    if (idx >= 0) tasks[idx] = task
    else tasks.push(task)
    storage.saveManualBackfillQueue(username, tasks)
  },

  removeManualBackfillTask: (username: string, cacheKey: string): void => {
    const tasks = storage.getManualBackfillQueue(username)
    storage.saveManualBackfillQueue(
      username,
      tasks.filter((t) => t.cache_key !== cacheKey)
    )
  }
}