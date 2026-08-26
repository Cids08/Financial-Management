// Single source of truth for where/how the Sanctum token is stored.
// api.js and hooks/useAuth.js both import from here instead of each
// other, so there's no circular dependency and no duplicated key.

const TOKEN_KEY = 'fms-auth-token'

// Identifies this specific browser tab's session, independent of the
// auth token itself. Generated once and kept in sessionStorage (not
// localStorage) deliberately — sessionStorage is per-tab and clears when
// the tab closes, matching what this ID represents: "this open tab,"
// not "this browser install." Sent on every login so the backend can
// stamp its ForcedLogout broadcast with it — the tab that just logged in
// then recognizes its own broadcast and ignores it instead of logging
// itself out immediately after signing in.
const CLIENT_SESSION_KEY = 'fms-client-session-id'

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

export function getClientSessionId() {
  let id = sessionStorage.getItem(CLIENT_SESSION_KEY)

  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(CLIENT_SESSION_KEY, id)
  }

  return id
}