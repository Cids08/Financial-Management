// Centralized API client for the Financial Management System frontend.
// Every page/hook should call apiFetch() instead of fetch() directly,
// so auth headers, the base URL, and 401 handling live in one place.

import { getToken, clearToken } from './authToken'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Module-level guard so multiple concurrent 401s (e.g. several hooks
// firing requests on mount) only trigger a single redirect, and so
// we never redirect again once we're already on the login page.
let redirectingToLogin = false

// Both '/' and '/login' render the Login page, so either counts as
// "already there" — no need to force a reload from either one.
function isOnLoginPage() {
  return window.location.pathname === '/' || window.location.pathname === '/login'
}

/**
 * Wraps fetch() with:
 *  - the API base URL
 *  - the Sanctum bearer token (read from localStorage)
 *  - JSON headers (skipped automatically for FormData bodies, e.g. file uploads)
 *  - a redirect-to-login on 401 responses, without looping
 *
 * Pass `skipAuthRedirect: true` for requests where a 401 is an expected,
 * meaningful response rather than an expired session — e.g. the login
 * endpoint itself returning 401 for bad credentials. Without this flag,
 * such calls would have their real error message replaced by a generic
 * "Session expired" message and could trigger an unwanted redirect/token
 * clear for a session that was never established.
 */
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

    if (!isOnLoginPage() && !redirectingToLogin) {
      redirectingToLogin = true
      window.location.href = '/'
    }

    throw new Error('Session expired. Please log in again.')
  }

  return response
}