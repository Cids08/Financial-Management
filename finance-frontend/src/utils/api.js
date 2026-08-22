// Centralized API client for the Financial Management System frontend.
// Every page/hook should call apiFetch() instead of fetch() directly,
// so auth headers, the base URL, and 401 handling live in one place.

import { getToken, clearToken } from './authToken'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Both '/' and '/login' render the Login page, so either counts as
// "already there" — no need to redirect from either one.
function isOnLoginPage() {
  return window.location.pathname === '/' || window.location.pathname === '/login'
}

// apiFetch() is plain JS with no component/hook context, so it can't call
// react-router's navigate() directly. Instead it broadcasts this event;
// <AuthExpiredListener /> (mounted inside <BrowserRouter> in App.jsx)
// listens for it and performs a real client-side redirect.
//
// This replaces a previous window.location.href = '/' hard navigation,
// which could paint the outgoing authenticated layout and the incoming
// Login page in the same frame during the transition — visible as a
// jarring flash where the sidebar and the login card briefly overlapped.
function notifyAuthExpired() {
  window.dispatchEvent(new Event('auth:expired'))
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

    if (!isOnLoginPage()) {
      notifyAuthExpired()
    }

    throw new Error('Session expired. Please log in again.')
  }

  return response
}