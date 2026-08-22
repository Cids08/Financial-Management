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

  // Set once login() gets requiresTwoFactor back. Login.jsx switches to
  // the code-entry step when twoFactorPending is truthy.
  const [twoFactorPending, setTwoFactorPending] = useState(null) // { pendingToken, maskedEmail } | null

  // CompanyProvider is now scoped inside App.jsx to the authenticated
  // layout route (not above BrowserRouter in main.jsx), so it mounts for
  // the first time only once the router reaches /dashboard post-login —
  // by which point the token is already set. Its own useEffect fetches
  // company settings on that mount, so there's nothing left for login()
  // to trigger here.

  const login = useCallback(async ({ email, password, remember, website, form_rendered_at }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember, website, form_rendered_at }),
        skipAuthRedirect: true,
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Invalid email or password.')
      }

      if (json.data.requiresTwoFactor) {
        setTwoFactorPending({
          pendingToken: json.data.pendingToken,
          maskedEmail: json.data.maskedEmail,
        })
        return { success: true, requiresTwoFactor: true }
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

  // Step 2 of a 2FA login: exchange pendingToken + emailed code for a
  // real token. Mirrors AuthController::verifyTwoFactor.
  const verifyTwoFactor = useCallback(async (code) => {
    if (!twoFactorPending) return { success: false, message: 'No login in progress.' }

    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/login/verify-two-factor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingToken: twoFactorPending.pendingToken, code }),
        skipAuthRedirect: true,
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'That code is incorrect or has expired.')
      }

      setToken(json.data.token)
      setTwoFactorPending(null)
      navigate('/dashboard')
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [twoFactorPending, navigate])

  // Resend the login verification code for the current pending login.
  // Mirrors AuthController::resendTwoFactor.
  const resendTwoFactor = useCallback(async () => {
    if (!twoFactorPending) return { success: false, message: 'No login in progress.' }

    setError(null)
    try {
      const res = await apiFetch('/api/login/resend-two-factor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingToken: twoFactorPending.pendingToken }),
        skipAuthRedirect: true,
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Could not resend the code.')
      }

      setTwoFactorPending((p) => ({ ...p, maskedEmail: json.data.maskedEmail }))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [twoFactorPending])

  // Back out of the code step to re-enter credentials (e.g. wrong account).
  const cancelTwoFactor = useCallback(() => {
    setTwoFactorPending(null)
    setError(null)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    navigate('/')
  }, [navigate])

  return {
    login, logout, loading, error,
    twoFactorPending, verifyTwoFactor, resendTwoFactor, cancelTwoFactor,
  }
}