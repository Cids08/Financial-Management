import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/api'
import { setToken, clearToken } from '../utils/authToken'

// Re-exported here so existing imports of `isAuthenticated` from
// '../hooks/useAuth' (e.g. ProtectedRoute) keep working.
export { isAuthenticated } from '../utils/authToken'

export function useAuth() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const login = useCallback(async ({ email, password, remember }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
        // A 401 here means "invalid credentials," not "session expired" —
        // there's no session yet. Let it fall through to the res.ok check
        // below instead of being intercepted as an auth-expiry redirect.
        skipAuthRedirect: true,
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Invalid email or password.')
      }

      setToken(json.data.token)
      navigate('/dashboard')
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const logout = useCallback(() => {
    clearToken()
    navigate('/')
  }, [navigate])

  return { login, logout, loading, error }
}