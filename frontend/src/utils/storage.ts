const STORAGE_PREFIX = 'user_'
const CHAT_MESSAGES_PREFIX = 'chat_messages_'

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
  }
}
