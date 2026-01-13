import { useState, useEffect } from 'react'
import { storage } from '../utils/storage'
import { profileAPI } from '../services/api'
import type { UserProfile } from '../types'

export const useUser = () => {
  const [username, setUsername] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('current_user')
    if (saved) {
      setUsername(saved)
      loadProfile(saved)
    }
  }, [])

  const loadProfile = async (user: string) => {
    setLoading(true)
    try {
      const data = storage.getUserData(user)
      if (data) {
        setProfile(data)
      } else {
        const apiProfile = await profileAPI.get(user)
        setProfile(apiProfile)
        storage.saveUserData(user, apiProfile)
      }
    } catch (error) {
      console.error('Load profile error:', error)
    } finally {
      setLoading(false)
    }
  }

  const login = (user: string) => {
    setUsername(user)
    localStorage.setItem('current_user', user)
    loadProfile(user)
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
