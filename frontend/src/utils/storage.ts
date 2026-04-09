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

export const UI_LANGUAGE_STORAGE_KEY = 'openramp_ui_language'
export type UiLanguage = 'chinese' | 'english'

const RECENT_USERS_KEY = 'openramp_recent_users'
const MAX_RECENT_USERS = 10

function _normalizeUsername(u: string): string | null {
  const v = u.trim()
  return v.length > 0 ? v : null
}

export function readRecentUsersFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_USERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string') continue
      const n = _normalizeUsername(item)
      if (!n) continue
      if (!out.includes(n)) out.push(n)
      if (out.length >= MAX_RECENT_USERS) break
    }
    return out
  } catch {
    return []
  }
}

export function writeRecentUsersToStorage(users: string[]): void {
  try {
    const out: string[] = []
    for (const u of users) {
      if (typeof u !== 'string') continue
      const n = _normalizeUsername(u)
      if (!n) continue
      if (!out.includes(n)) out.push(n)
      if (out.length >= MAX_RECENT_USERS) break
    }
    localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(out))
  } catch {
    /* ignore */
  }
}

export function upsertRecentUser(username: string): void {
  const n = _normalizeUsername(username)
  if (!n) return
  const existing = readRecentUsersFromStorage()
  const next = [n, ...existing.filter((u) => u !== n)].slice(0, MAX_RECENT_USERS)
  writeRecentUsersToStorage(next)
}

function _inferUsernamesFromCacheKeys(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue

      if (k.startsWith('user_') && !k.startsWith('user_repos_') && !k.startsWith('user_match_weights_')) {
        const maybe = k.slice('user_'.length)
        const n = _normalizeUsername(maybe)
        if (n && !out.includes(n)) out.push(n)
        continue
      }

      if (k.startsWith('chat_messages_')) {
        const maybe = k.slice('chat_messages_'.length)
        const n = _normalizeUsername(maybe)
        if (n && !out.includes(n)) out.push(n)
        continue
      }

      if (k.startsWith('session_id_')) {
        const maybe = k.slice('session_id_'.length)
        const n = _normalizeUsername(maybe)
        if (n && !out.includes(n)) out.push(n)
        continue
      }

      const reposPrefix = 'user_repos_'
      if (k.startsWith(reposPrefix)) {
        const rest = k.slice(reposPrefix.length)
        const envSuffix = rest.endsWith('_mock') ? '_mock' : rest.endsWith('_live') ? '_live' : ''
        const usernamePart = envSuffix
          ? rest.slice(0, -envSuffix.length)
          : rest.endsWith('_favorites')
            ? rest.slice(0, -'_favorites'.length)
            : rest
        const n = _normalizeUsername(usernamePart)
        if (n && !out.includes(n)) out.push(n)
        continue
      }

      const weightsPrefix = 'user_match_weights_'
      if (k.startsWith(weightsPrefix)) {
        const rest = k.slice(weightsPrefix.length)
        const envSuffix = rest.endsWith('_mock') ? '_mock' : rest.endsWith('_live') ? '_live' : ''
        const usernamePart = envSuffix ? rest.slice(0, -envSuffix.length) : rest
        const n = _normalizeUsername(usernamePart)
        if (n && !out.includes(n)) out.push(n)
        continue
      }

      const manualCachePrefix = 'manual_match_cache_'
      if (k.startsWith(manualCachePrefix)) {
        const rest = k.slice(manualCachePrefix.length)
        const usernamePart = rest.split('_')[0] || ''
        const n = _normalizeUsername(usernamePart)
        if (n && !out.includes(n)) out.push(n)
        continue
      }

      const manualQueuePrefix = 'manual_match_backfill_queue_'
      if (k.startsWith(manualQueuePrefix)) {
        const rest = k.slice(manualQueuePrefix.length)
        const envSuffix = rest.endsWith('_mock') ? '_mock' : rest.endsWith('_live') ? '_live' : ''
        const usernamePart = envSuffix ? rest.slice(0, -envSuffix.length) : rest
        const n = _normalizeUsername(usernamePart)
        if (n && !out.includes(n)) out.push(n)
        continue
      }
    }
  } catch {
    return out
  }
  return out
}

export function readRecentUsersFromCache(): string[] {
  const stored = readRecentUsersFromStorage()
  const inferred = _inferUsernamesFromCacheKeys()
  const out: string[] = []
  for (const u of [...stored, ...inferred]) {
    const n = _normalizeUsername(u)
    if (!n) continue
    if (!out.includes(n)) out.push(n)
    if (out.length >= MAX_RECENT_USERS) break
  }
  return out
}

export function clearAllAccountData(): void {
  try {
    localStorage.removeItem('current_user')
    localStorage.removeItem(RECENT_USERS_KEY)

    const prefixes = [
      'user_',
      'chat_messages_',
      'session_id_',
      'user_repos_',
      'user_match_weights_',
      'manual_match_cache_',
      'manual_match_backfill_queue_'
    ]

    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }

    for (const k of keys) {
      if (prefixes.some((p) => k.startsWith(p))) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    /* ignore */
  }
}

export function clearAccountData(username: string): void {
  const n = _normalizeUsername(username)
  if (!n) return
  try {
    const current = localStorage.getItem('current_user')
    if (current === n) localStorage.removeItem('current_user')

    const nextRecent = readRecentUsersFromStorage().filter((u) => u !== n)
    writeRecentUsersToStorage(nextRecent)

    localStorage.removeItem(`${STORAGE_PREFIX}${n}`)
    localStorage.removeItem(`${CHAT_MESSAGES_PREFIX}${n}`)
    localStorage.removeItem(`session_id_${n}`)
    localStorage.removeItem(_userFavoritesKey(n))

    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }

    for (const k of keys) {
      if (k === `user_repos_${n}_mock` || k === `user_repos_${n}_live`) localStorage.removeItem(k)
      else if (k === `user_match_weights_${n}_mock` || k === `user_match_weights_${n}_live`) localStorage.removeItem(k)
      else if (k === `manual_match_backfill_queue_${n}_mock` || k === `manual_match_backfill_queue_${n}_live`) localStorage.removeItem(k)
      else if (k.startsWith(`manual_match_cache_${n}_`)) localStorage.removeItem(k)
    }
  } catch {
    /* ignore */
  }
}

export function readUiLanguageFromStorage(): UiLanguage {
  try {
    const v = localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)
    if (v === 'chinese' || v === 'english') return v
  } catch {
    /* ignore */
  }
  return 'english'
}

export function writeUiLanguageToStorage(lang: UiLanguage): void {
  try {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, lang)
  } catch {
    /* ignore */
  }
}

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