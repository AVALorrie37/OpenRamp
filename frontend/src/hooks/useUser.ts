import { useState, useEffect, useRef } from 'react'
import { storage, upsertRecentUser } from '../utils/storage'
import { profileAPI } from '../services/api'
import type { UserProfile } from '../types'

function readStoredUsername(): string | null {
  try {
    const u = localStorage.getItem('current_user')
    return u && u.trim().length > 0 ? u.trim() : null
  } catch {
    return null
  }
}

export const useUser = () => {
  const [username, setUsername] = useState<string | null>(readStoredUsername)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const profileModifiedRef = useRef<boolean>(false)

  const loadProfile = async (user: string) => {
    setLoading(true)
    try {
      const data = storage.getUserData(user)
      if (data) {
        setProfile(data)
        profileModifiedRef.current = false
      } else {
        const apiProfile = await profileAPI.get(user)
        const profileWithLanguage = { ...apiProfile, language: apiProfile.language || 'english' }
        setProfile(profileWithLanguage)
        storage.saveUserData(user, profileWithLanguage)
        profileModifiedRef.current = false
      }
    } catch (error) {
      console.error('Load profile error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSessionReady(true)
  }, [])

  useEffect(() => {
    const saved = readStoredUsername()
    if (saved) {
      loadProfile(saved)
    }
  }, [])

  const login = (user: string) => {
    setUsername(user)
    localStorage.setItem('current_user', user)
    upsertRecentUser(user)
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
    profileModifiedRef.current = true
  }

  const resetProfileModified = () => {
    profileModifiedRef.current = false
  }

  const isProfileModified = () => {
    return profileModifiedRef.current
  }

  return {
    username,
    sessionReady,
    profile,
    loading,
    login,
    logout,
    updateProfile,
    isLoggedIn: !!username,
    isProfileModified,
    resetProfileModified
  }
}
