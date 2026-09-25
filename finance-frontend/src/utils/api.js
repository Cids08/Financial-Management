import { getToken, clearToken } from './authToken'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function isOnLoginPage() {
  return window.location.pathname === '/' || window.location.pathname === '/login'
}

function notifyAuthExpired() {
  window.dispatchEvent(new Event('auth:expired'))
}

export async function apiFetch(path, options = {}) {
  const { skipAuthRedirect = false, timeoutMs, ...fetchOptions } = options
  const token = getToken()
  const isFormData = fetchOptions.body instanceof FormData

  const headers = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  }

  // Optional hard timeout so a stalled/oversized request (e.g. an upload
  // the hosting layer silently swallows) can never leave a UI spinner
  // spinning forever. Aborts and surfaces as an AbortError the caller can
  // translate into a user-facing message.
  let abortTimer
  let signal = fetchOptions.signal
  if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
    const controller = new AbortController()
    abortTimer = setTimeout(() => controller.abort(), timeoutMs)
    signal =
      signal && typeof AbortSignal?.any === 'function'
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal
  }

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      ...(signal ? { signal } : {}),
    })
  } finally {
    clearTimeout(abortTimer)
  }

  if (response.status === 401 && !skipAuthRedirect) {
    // Only clear the token if it's the SAME one this request used. Each
    // tab shares localStorage, so if another tab logged in as a different
    // user, the token under this key is no longer ours  -  wiping it here
    // would sign that freshly-logged-in tab right back out.
    if (getToken() === token) {
      clearToken()
    }

    if (!isOnLoginPage()) {
      notifyAuthExpired()
    }

    throw new Error('Session expired. Please log in again.')
  }

  // Backend flags accounts that must change their password before doing
  // anything else (EnsurePasswordChanged middleware). Broadcasts the same
  // way as auth:expired  -  MustChangePasswordListener (mounted in App.jsx)
  // picks this up and shows a blocking, non-dismissible modal.
  if (response.status === 423) {
    try {
      const clone = response.clone()
      const json = await clone.json()
      if (json?.data?.mustChangePassword) {
        window.dispatchEvent(new Event('auth:must-change-password'))
      }
    } catch {
      // Body wasn't JSON or already consumed  -  fall through.
    }
  }

  return response
}