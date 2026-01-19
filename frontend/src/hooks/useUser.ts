import { useState, useEffect } from 'react'
import { storage } from '../utils/storage'
import { profileAPI } from '../services/api'
import type { UserProfile } from '../types'

export const useUser = () => {
  const [username, setUsername] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const loadProfile = async (user: string, language?: 'chinese' | 'english') => {
    setLoading(true)
    try {
      const data = storage.getUserData(user)
      if (data) {
        setProfile(data)
        // 如果传入了language且profile中没有，则更新
        if (language && !data.language) {
          updateProfile({ language })
        }
      } else {
        const apiProfile = await profileAPI.get(user)
        const profileWithLanguage = { ...apiProfile, language: language || apiProfile.language || 'chinese' }
        setProfile(profileWithLanguage)
        storage.saveUserData(user, profileWithLanguage)
      }
    } catch (error) {
      console.error('Load profile error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem('current_user')
    if (saved) {
      setUsername(saved)
      loadProfile(saved)
    }
  }, [])

  const login = (user: string, language: 'chinese' | 'english' = 'chinese') => {
    setUsername(user)
    localStorage.setItem('current_user', user)
    loadProfile(user, language)
  }

  const logout = () => {
    setUsername(null)
    setProfile(null)
    localStorage.removeItem('current_user')
  }

  const updateProfile = (newProfile: Partial<UserProfile>) => {
    if (!username) return
    const updated = { ...profile, ...newProfile } as UserProfile
    setProfile(updated)
    storage.saveUserData(username, updated)
  }

  return {
    username,
    profile,
    loading,
    login,
    logout,
    updateProfile,
    isLoggedIn: !!username
  }
}
