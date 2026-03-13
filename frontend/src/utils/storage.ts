// frontend/src/utils/storage.ts

const STORAGE_PREFIX = 'user_'
const CHAT_MESSAGES_PREFIX = 'chat_messages_'
const _reposSuffix = () => (import.meta.env.VITE_USE_MOCK === 'true' ? '_mock' : '_live')
const _presetReposKey = () => `preset_repos${_reposSuffix()}`
const _userReposKey = (username: string) => `user_repos_${username}${_reposSuffix()}`

// 收藏仓库的 key 去掉环境后缀，线上/本地共用
const _userFavoritesKey = (username: string) => `user_repos_${username}_favorites`

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
  }
}