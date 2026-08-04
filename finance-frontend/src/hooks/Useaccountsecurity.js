import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Account security concerns for the Settings page: password change,
 * two-factor authentication, active sessions, recent security activity,
 * and account deactivation.
 *
 * Kept separate from useProfile/useCompany because it's only ever
 * consumed by Settings.jsx — no shared-state need for a Context here,
 * per "only create a new hook when necessary."
 *
 * Backed by:
 *   PUT    /api/settings/password
 *   POST   /api/settings/2fa/initiate
 *   POST   /api/settings/2fa/confirm
 *   DELETE /api/settings/2fa
 *   GET    /api/settings/sessions
 *   DELETE /api/settings/sessions/{id}
 *   DELETE /api/settings/sessions
 *   GET    /api/settings/activity
 *   POST   /api/settings/deactivate
 */
export function useAccountSecurity() {
  /* Password */
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const changePassword = useCallback(async ({ current, next, confirm }) => {
    setPasswordSaving(true)
    setPasswordError('')
    try {
      const res = await apiFetch('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next, confirm }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const message =
          json.errors?.confirm?.[0] || json.errors?.current?.[0] || json.message || 'Failed to update password.'
        throw new Error(message)
      }
      return { success: true }
    } catch (err) {
      setPasswordError(err.message)
      return { success: false, message: err.message }
    } finally {
      setPasswordSaving(false)
    }
  }, [])

  /* Two-factor authentication */
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [twoFABusy, setTwoFABusy] = useState(false)
  const [twoFAError, setTwoFAError] = useState('')

  const initiateTwoFactor = useCallback(async () => {
    setTwoFABusy(true)
    setTwoFAError('')
    try {
      const res = await apiFetch('/api/settings/2fa/initiate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to start 2FA setup.')
      // { secret, qrCodeUrl }
      return { success: true, ...json.data }
    } catch (err) {
      setTwoFAError(err.message)
      return { success: false, message: err.message }
    } finally {
      setTwoFABusy(false)
    }
  }, [])

  const confirmTwoFactor = useCallback(async (code) => {
    setTwoFABusy(true)
    setTwoFAError('')
    try {
      const res = await apiFetch('/api/settings/2fa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.errors?.code?.[0] || json.message || 'Invalid verification code.')
      }
      setTwoFAEnabled(true)
      // { recoveryCodes: [...] } — show these to the user exactly once
      return { success: true, ...json.data }
    } catch (err) {
      setTwoFAError(err.message)
      return { success: false, message: err.message }
    } finally {
      setTwoFABusy(false)
    }
  }, [])

  const disableTwoFactor = useCallback(async () => {
    setTwoFABusy(true)
    setTwoFAError('')
    try {
      const res = await apiFetch('/api/settings/2fa', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to disable 2FA.')
      setTwoFAEnabled(false)
      return { success: true }
    } catch (err) {
      setTwoFAError(err.message)
      return { success: false, message: err.message }
    } finally {
      setTwoFABusy(false)
    }
  }, [])

  /* Active sessions */
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [currentTokenId, setCurrentTokenId] = useState(null)
  const [sessionsError, setSessionsError] = useState('')

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true)
    setSessionsError('')
    try {
      const res = await apiFetch('/api/settings/sessions')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load sessions.')
      setSessions(json.data)
      setCurrentTokenId(json.meta?.currentTokenId ?? null)
    } catch (err) {
      setSessionsError(err.message)
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const revokeSession = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/settings/sessions/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to sign out that device.')
      setSessions((prev) => prev.filter((s) => s.id !== id))
      return { success: true }
    } catch (err) {
      setSessionsError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const revokeOtherSessions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/sessions', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to sign out other sessions.')
      setSessions((prev) => prev.filter((s) => s.id === currentTokenId))
      return { success: true }
    } catch (err) {
      setSessionsError(err.message)
      return { success: false, message: err.message }
    }
  }, [currentTokenId])

  /* Recent security activity */
  const [activityLog, setActivityLog] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true)
    setActivityError('')
    try {
      const res = await apiFetch('/api/settings/activity')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load activity.')
      setActivityLog(json.data)
    } catch (err) {
      setActivityError(err.message)
    } finally {
      setActivityLoading(false)
    }
  }, [])

  /* Deactivate account */
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState('')

  const deactivateAccount = useCallback(async () => {
    setDeactivating(true)
    setDeactivateError('')
    try {
      const res = await apiFetch('/api/settings/deactivate', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to deactivate account.')
      return { success: true }
    } catch (err) {
      setDeactivateError(err.message)
      return { success: false, message: err.message }
    } finally {
      setDeactivating(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    fetchActivity()
  }, [fetchSessions, fetchActivity])

  return {
    // password
    passwordSaving,
    passwordError,
    changePassword,
    // 2FA
    twoFAEnabled,
    twoFABusy,
    twoFAError,
    initiateTwoFactor,
    confirmTwoFactor,
    disableTwoFactor,
    // sessions
    sessions,
    sessionsLoading,
    sessionsError,
    currentTokenId,
    revokeSession,
    revokeOtherSessions,
    refetchSessions: fetchSessions,
    // activity
    activityLog,
    activityLoading,
    activityError,
    refetchActivity: fetchActivity,
    // deactivate
    deactivating,
    deactivateError,
    deactivateAccount,
  }
}