import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../utils/api'
import { setToken, clearToken, getClientSessionId } from '../utils/authToken'
import { disconnectEcho } from '../utils/echo'

// Re-exported here so existing imports of `isAuthenticated` from
// '../hooks/useAuth' (e.g. ProtectedRoute) keep working.
export { isAuthenticated } from '../utils/authToken'

export function useAuth() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Two DISTINCT countdowns, deliberately not shared — they mean different
  // things and have very different durations:
  //  - retryAfter: the per-IP throttle (throttle:5,1 route middleware).
  //    Resets in ~60s, applies to the address, not the account.
  //  - accountLockedFor: AuthService's account-level lockout after 5 wrong
  //    passwords on ONE account. Lasts 15 minutes and is independent of
  //    the IP throttle's clock — they can (and did, in testing) both fire
  //    from the same burst of attempts, which is confusing if shown with
  //    identical wording/countdown. Login.jsx renders these as visually
  //    separate notices so it's obvious they're not the same thing.
  const [retryAfter, setRetryAfter] = useState(0)
  const retryIntervalRef = useRef(null)

  const [accountLockedFor, setAccountLockedFor] = useState(0)
  const lockIntervalRef = useRef(null)

  // Set once login() gets requiresTwoFactor back. Login.jsx switches to
  // the code-entry step when twoFactorPending is truthy.
  const [twoFactorPending, setTwoFactorPending] = useState(null) // { pendingToken, maskedEmail } | null

  // CompanyProvider is now scoped inside App.jsx to the authenticated
  // layout route (not around the whole router in main.jsx), so it mounts
  // for the first time only once the router reaches /dashboard post-login
  // — by which point the token is already set. Its own useEffect fetches
  // company settings on that mount, so there's nothing left for login()
  // to trigger here.

  useEffect(() => {
    return () => {
      clearInterval(retryIntervalRef.current)
      clearInterval(lockIntervalRef.current)
    }
  }, [])

  const startCountdown = useCallback((seconds, setter, intervalRef) => {
    clearInterval(intervalRef.current)
    setter(seconds)

    intervalRef.current = setInterval(() => {
      setter((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const login = useCallback(async ({ email, password, remember, website, form_rendered_at }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          remember,
          website,
          form_rendered_at,
          // Identifies this tab so this device can be excluded from its
          // own "you were signed out elsewhere" broadcast — see
          // authToken.js and ForcedLogoutListener for the full flow.
          client_session_id: getClientSessionId(),
        }),
        // A 401 here means "invalid credentials," not "session expired" —
        // there's no session yet. Let it fall through to the res.ok check
        // below instead of being intercepted as an auth-expiry redirect.
        skipAuthRedirect: true,
      })
      const json = await res.json()

      if (res.status === 423) {
        // Account-level lockout — distinct from the 429 IP throttle below.
        const seconds = json.data?.retryAfter ?? 900
        startCountdown(seconds, setAccountLockedFor, lockIntervalRef)
        throw new Error(json.message || 'Too many failed attempts. Your account is temporarily locked.')
      }

      if (res.status === 429) {
        const seconds = json.data?.retryAfter ?? 60
        startCountdown(seconds, setRetryAfter, retryIntervalRef)
        throw new Error(json.message || `Too many attempts. Please try again in ${seconds} seconds.`)
      }

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
  }, [navigate, startCountdown])

  // Step 2 of a 2FA login: exchange pendingToken + emailed code for a
  // real token. Mirrors AuthController::verifyTwoFactor. client_session_id
  // doesn't need to be sent again here — it was already captured and
  // cached against the pendingToken back in step 1's login() call.
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

      if (res.status === 429) {
        const seconds = json.data?.retryAfter ?? 60
        startCountdown(seconds, setRetryAfter, retryIntervalRef)
        throw new Error(json.message || `Too many attempts. Please try again in ${seconds} seconds.`)
      }

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
  }, [twoFactorPending, navigate, startCountdown])

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
    disconnectEcho()
    clearToken()
    navigate('/')
  }, [navigate])

  return {
    login, logout, loading, error,
    retryAfter,
    accountLockedFor,
    twoFactorPending, verifyTwoFactor, resendTwoFactor, cancelTwoFactor,
  }
}