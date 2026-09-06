import { getToken, clearToken } from './authToken'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function isOnLoginPage() {
  return window.location.pathname === '/' || window.location.pathname === '/login'
}

function notifyAuthExpired() {
  window.dispatchEvent(new Event('auth:expired'))
}

export async function apiFetch(path, options = {}) {
  const { skipAuthRedirect = false, ...fetchOptions } = options
  const token = getToken()
  const isFormData = fetchOptions.body instanceof FormData

  const headers = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...fetchOptions.headers,
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  })

  if (response.status === 401 && !skipAuthRedirect) {
    clearToken()

    if (!isOnLoginPage()) {
      notifyAuthExpired()
    }

    throw new Error('Session expired. Please log in again.')
  }

  // Backend flags accounts that must change their password before doing
  // anything else (EnsurePasswordChanged middleware). Broadcasts the same
  // way as auth:expired — MustChangePasswordListener (mounted in App.jsx)
  // picks this up and shows a blocking, non-dismissible modal.
  if (response.status === 423) {
    try {
      const clone = response.clone()
      const json = await clone.json()
      if (json?.data?.mustChangePassword) {
        window.dispatchEvent(new Event('auth:must-change-password'))
      }
    } catch {
      // Body wasn't JSON or already consumed — fall through.
    }
  }

  return response
}