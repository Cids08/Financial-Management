import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, API_BASE_URL } from '../utils/api'
import { setToken, clearToken, getToken, getClientSessionId } from '../utils/authToken'
import { disconnectEcho } from '../utils/echo'

// Re-exported here so existing imports of `isAuthenticated` from
// '../hooks/useAuth' (e.g. ProtectedRoute) keep working.
export { isAuthenticated } from '../utils/authToken'

export function useAuth() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // In-flight locks for the two-step auth flow. The credential form can
  // double-fire (Enter key + button click, or a fast double click) before
  // the loading state re-renders, and the OTP input's onComplete + the
  // form's onSubmit can both fire. Without these, two /api/login requests
  // would race: TWO codes get emailed and the second response's
  // pendingToken supersedes the first, so the first email's code fails as
  // "incorrect" at the exact moment a fresh code lands  -  which looks
  // exactly like "a new code was sent after I entered a wrong one."
  // A duplicate in-flight call returns immediately and leaves loading to
  // the request that actually owns it.
  const loginInFlightRef = useRef(false)
  const verifyInFlightRef = useRef(false)
  const resendInFlightRef = useRef(false)

  // Two DISTINCT countdowns, deliberately not shared  -  they mean different
  // things and have very different durations:
  //  - retryAfter: the per-IP throttle (throttle:5,1 route middleware).
  //    Resets in ~60s, applies to the address, not the account.
  //  - accountLockedFor: AuthService's account-level lockout after 5 wrong
  //    passwords on ONE account. Lasts 15 minutes and is independent of
  //    the IP throttle's clock  -  they can (and did, in testing) both fire
  //    from the same burst of attempts, which is confusing if shown with
  //    identical wording/countdown. Login.jsx renders these as visually
  //    separate notices so it's obvious they're not the same thing.
  const [retryAfter, setRetryAfter] = useState(0)
  const retryIntervalRef = useRef(null)

  const [accountLockedFor, setAccountLockedFor] = useState(0)
  const lockIntervalRef = useRef(null)

  // Set once login() gets requiresTwoFactor back. Login.jsx switches to
  // the code-entry step when twoFactorPending is truthy. codeExpiresAt is
  // an absolute timestamp the screen counts down to; it's replaced every
  // time a fresh code is issued (login or resend).
  const [twoFactorPending, setTwoFactorPending] = useState(null) // { pendingToken, maskedEmail, codeExpiresAt } | null

  // CompanyProvider is now scoped inside App.jsx to the authenticated
  // layout route (not around the whole router in main.jsx), so it mounts
  // for the first time only once the router reaches /dashboard post-login
  //  -  by which point the token is already set. Its own useEffect fetches
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
    if (loginInFlightRef.current) {
      return { success: false, message: 'Login already in progress.' }
    }
    loginInFlightRef.current = true
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
          // own "you were signed out elsewhere" broadcast  -  see
          // authToken.js and ForcedLogoutListener for the full flow.
          client_session_id: getClientSessionId(),
        }),
        // A 401 here means "invalid credentials," not "session expired"  - 
        // there's no session yet. Let it fall through to the res.ok check
        // below instead of being intercepted as an auth-expiry redirect.
        skipAuthRedirect: true,
      })
      const json = await res.json()

      if (res.status === 423) {
        // Account-level lockout  -  distinct from the 429 IP throttle below.
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
          codeExpiresAt: Date.now() + (json.data.codeExpiresInSeconds ?? 300) * 1000,
        })
        return { success: true, requiresTwoFactor: true }
      }

      setToken(json.data.token)
      if (json.data?.mustChangePassword) {
        window.dispatchEvent(new Event('auth:must-change-password'))
      }
      navigate('/dashboard')
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      loginInFlightRef.current = false
      setLoading(false)
    }
  }, [navigate, startCountdown])

  // Step 2 of a 2FA login: exchange pendingToken + emailed code for a
  // real token. Mirrors AuthController::verifyTwoFactor. client_session_id
  // doesn't need to be sent again here  -  it was already captured and
  // cached against the pendingToken back in step 1's login() call.
  const verifyTwoFactor = useCallback(async (code) => {
    if (!twoFactorPending) return { success: false, message: 'No login in progress.' }
    // OtpInput's onComplete and the form's onSubmit both call this on a
    // 6-digit entry  -  drop the duplicate while one verify is in flight.
    if (verifyInFlightRef.current) {
      return { success: false, message: 'Verification already in progress.' }
    }
    verifyInFlightRef.current = true
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

      if (res.status === 423) {
        // Account-level lockout (reached at step 2 via max 2FA tries).
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
        // If the pending login session has fully expired (backend deleted it from
        // cache), there's no point staying on the 2FA screen  -  the pendingToken
        // is dead and even Resend will fail. Auto-cancel back to the credential
        // form and surface the expiry message there so the user knows to re-login.
        const msg = json.message || 'That code is incorrect or has expired.'
        // Only the pending login session ITSELF expiring sends the user back
        // to the credentials step ("This login has expired. Please sign in
        // again."). An incorrect/expired CODE also returns a message containing
        // "expired" ("That code is incorrect or has expired.") but the session
        // is still alive  -  that must keep the user on the code screen so they
        // can retry or resend instead of being kicked back to step 1.
        if (msg.toLowerCase().includes('sign in again')) {
          setTwoFactorPending(null)
          setError(msg)
          return { success: false, message: msg }
        }
        throw new Error(msg)
      }

      setToken(json.data.token)
      setTwoFactorPending(null)
      if (json.data?.mustChangePassword) {
        window.dispatchEvent(new Event('auth:must-change-password'))
      }
      navigate('/dashboard')
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      verifyInFlightRef.current = false
      setLoading(false)
    }
  }, [twoFactorPending, navigate, startCountdown])

  // Resend the login verification code for the current pending login.
  // Mirrors AuthController::resendTwoFactor.
  const resendTwoFactor = useCallback(async () => {
    if (!twoFactorPending) return { success: false, message: 'No login in progress.' }
    // Stop a fast double-click on Resend from emailing two codes.
    if (resendInFlightRef.current) {
      return { success: false, message: 'A code is already being sent.' }
    }
    resendInFlightRef.current = true

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
        const msg = json.message || 'Could not resend the code.'
        // If the session already expired, auto-cancel back to the credential form.
        // Only the pending login session ITSELF expiring sends the user back
        // to the credentials step ("This login has expired. Please sign in
        // again."). An incorrect/expired CODE also returns a message containing
        // "expired" ("That code is incorrect or has expired.") but the session
        // is still alive  -  that must keep the user on the code screen so they
        // can retry or resend instead of being kicked back to step 1.
        if (msg.toLowerCase().includes('sign in again')) {
          setTwoFactorPending(null)
          setError(msg)
          return { success: false, message: msg }
        }
        throw new Error(msg)
      }

      setTwoFactorPending((p) => ({
        ...p,
        maskedEmail: json.data.maskedEmail,
        codeExpiresAt: Date.now() + (json.data.codeExpiresInSeconds ?? 300) * 1000,
      }))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      resendInFlightRef.current = false
    }
  }, [twoFactorPending])

  // Back out of the code step to re-enter credentials (e.g. wrong account).
  const cancelTwoFactor = useCallback(() => {
    setTwoFactorPending(null)
    setError(null)
  }, [])

  // Log out and return to the sign-in page. Optional `reason` is forwarded
  // to the Login route's state so it can explain WHY the session ended
  // (idle timeout, server expiry, etc.) instead of dumping the user at the
  // form with no context.
  const logout = useCallback((reason) => {
    // Revoke the Sanctum token SERVER-SIDE before wiping it locally, so a
    // leaked/captured token can't keep working for its full TTL. Raw fetch
    // (not apiFetch) with keepalive: this must fire even as the navigation
    // below tears the app down, and a 401 here is expected (we're logging
    // out anyway), so it must not trip the auth:expired redirect.
    const token = getToken()
    if (token) {
      try {
        fetch(`${API_BASE_URL}/api/logout`, {
          method: 'POST',
          keepalive: true,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => { /* best-effort  -  token is cleared regardless */ })
      } catch { /* best-effort */ }
    }
    disconnectEcho()
    clearToken()
    navigate('/', { state: reason ? { authNotice: reason } : undefined })
  }, [navigate])

  return {
    login, logout, loading, error,
    retryAfter,
    accountLockedFor,
    twoFactorPending, verifyTwoFactor, resendTwoFactor, cancelTwoFactor,
  }
}