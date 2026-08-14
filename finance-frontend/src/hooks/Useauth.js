import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/api'
import { setToken, clearToken } from '../utils/authToken'
import { useCompany } from '../context/CompanyContext'

// Re-exported here so existing imports of `isAuthenticated` from
// '../hooks/useAuth' (e.g. ProtectedRoute) keep working.
export { isAuthenticated } from '../utils/authToken'

export function useAuth() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // CompanyProvider wraps <BrowserRouter> in main.jsx (above the whole
  // router), so it fetches exactly once — at the very first page load,
  // which is always the unauthenticated Login screen. That first fetch
  // always 401s (GET /api/settings requires auth), leaving `company` at
  // its default ("FMS", no logo) — and because a client-side navigate()
  // never unmounts a provider sitting above the router, it never gets a
  // second chance to fetch correctly. Only a hard refresh fixed it before,
  // since that's the only thing that remounts main.jsx from scratch.
  // Explicitly refetching right after a successful login closes that gap
  // without needing to move the provider or add a page reload.
  const { refetch: refetchCompany } = useCompany()

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
      refetchCompany() // now runs with a valid token in place — see note above
      navigate('/dashboard')
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [navigate, refetchCompany])

  const logout = useCallback(() => {
    clearToken()
    navigate('/')
  }, [navigate])

  return { login, logout, loading, error }
}