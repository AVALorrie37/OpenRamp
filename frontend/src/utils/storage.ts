const STORAGE_PREFIX = 'user_'
const CHAT_MESSAGES_PREFIX = 'chat_messages_'
const PRESET_REPOS_KEY = 'preset_repos'
const USER_REPOS_PREFIX = 'user_repos_'

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
    const data = localStorage.getItem(PRESET_REPOS_KEY)
    return data ? JSON.parse(data) : null
  },

  savePresetRepos: (repos: any[]): void => {
    localStorage.setItem(PRESET_REPOS_KEY, JSON.stringify(repos))
  },

  getUserRepos: (username: string): any[] | null => {
    const key = `${USER_REPOS_PREFIX}${username}`
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  },

  saveUserRepos: (username: string, repos: any[]): void => {
    const key = `${USER_REPOS_PREFIX}${username}`
    localStorage.setItem(key, JSON.stringify(repos))
  }
}
