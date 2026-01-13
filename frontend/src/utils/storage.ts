const STORAGE_PREFIX = 'user_'

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
  }
}
