import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../utils/api'

const ProfileContext = createContext(null)

/**
 * Wrap DashboardLayout (or App) with this once. Every consumer of
 * useProfile() then shares the exact same fetch and state — so
 * uploading a new avatar from the Profile page, for example, is
 * immediately reflected in the Header too, with no separate re-fetch
 * and no risk of the two views drifting out of sync.
 */
export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/profile')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load profile.')
      setProfile(json.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const updateProfile = useCallback(async (fields) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to update profile.')
      }
      setProfile(json.data)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const uploadAvatar = useCallback(async (file) => {
    setError(null)
    const formData = new FormData()
    formData.append('avatar', file)
    try {
      const res = await apiFetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to upload photo.')
      }
      setProfile(json.data)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const removeAvatar = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch('/api/profile/avatar', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to remove photo.')
      }
      setProfile(json.data)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const value = {
    profile,
    loading,
    saving,
    error,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    refetch: fetchProfile,
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfileContext() {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    throw new Error('useProfileContext must be used within a <ProfileProvider>')
  }
  return ctx
}