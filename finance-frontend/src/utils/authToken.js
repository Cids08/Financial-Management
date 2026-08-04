// Single source of truth for where/how the Sanctum token is stored.
// api.js and hooks/useAuth.js both import from here instead of each
// other, so there's no circular dependency and no duplicated key.

const TOKEN_KEY = 'fms-auth-token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function isAuthenticated() {
  return Boolean(getToken())
}