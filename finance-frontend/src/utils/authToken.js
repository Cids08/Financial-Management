// Single source of truth for where/how the Sanctum token is stored.
// api.js and hooks/useAuth.js both import from here instead of each
// other, so there's no circular dependency and no duplicated key.

const TOKEN_KEY = 'fms-auth-token'

// Identifies this specific browser tab's session, independent of the
// auth token itself. Generated once and kept in sessionStorage (not
// localStorage) deliberately  -  sessionStorage is per-tab and clears when
// the tab closes, matching what this ID represents: "this open tab,"
// not "this browser install." Sent on every login so the backend can
// stamp its ForcedLogout broadcast with it  -  the tab that just logged in
// then recognizes its own broadcast and ignores it instead of logging
// itself out immediately after signing in.
const CLIENT_SESSION_KEY = 'fms-client-session-id'

// Records which token THIS tab signed in with. localStorage is shared by
// every tab in the browser, so with only that we couldn't tell "which tab
// owns the current token"  -  which matters once a second tab logs in as a
// different user and overwrites the shared token. sessionStorage is
// per-tab (clears when the tab closes), which is exactly this value's
// lifetime. Used by SingleTabSessionGuard + api.js's 401 handling.
const TAB_TOKEN_KEY = 'fms-tab-token'

// Flag set on a tab that has been superseded by a login in another tab.
// Once set, getToken() returns null for this tab, so it can NEVER start
// using the other tab's token from shared localStorage  -  not even after
// a reload (sessionStorage outlives reloads). Only a fresh login in this
// tab (setToken) clears it.
const TAB_EVICTED_KEY = 'fms-tab-evicted'

export function getToken() {
  if (sessionStorage.getItem(TAB_EVICTED_KEY)) return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(TAB_TOKEN_KEY, token)
  sessionStorage.removeItem(TAB_EVICTED_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TAB_TOKEN_KEY)
  sessionStorage.removeItem(TAB_EVICTED_KEY)
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

// Adopts the current shared token as this tab's own. Tabs that are
// duplicated or opened after an existing login never call setToken (they
// become logged in by simply reading localStorage), so without claiming,
// the guard couldn't tell that this tab is attached to the current user.
// Called once on mount by SingleTabSessionGuard.
export function claimCurrentToken() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token && !sessionStorage.getItem(TAB_TOKEN_KEY)) {
    sessionStorage.setItem(TAB_TOKEN_KEY, token)
  }
}

// Marks this tab as superseded by a login in another tab. Removes this
// tab's token claim, but deliberately does NOT touch localStorage  - 
// that now holds the OTHER tab's fresh token, which must stay intact for
// the newly-logged-in tab to keep working.
export function markTabEvicted() {
  sessionStorage.setItem(TAB_EVICTED_KEY, '1')
  sessionStorage.removeItem(TAB_TOKEN_KEY)
}

// Subscribes to shared-token changes that came from ANOTHER tab:
//  - another tab logged in (shared token replaced with a different one), or
//  - another tab logged out (shared token removed).
// Both mean THIS tab's own token is no longer the active session. The
// 'storage' event only fires in other tabs (never the tab that changed
// the value), so no tab ever reacts to its own login. Returns an
// unsubscribe function.
export function onTokenReplacedByOtherTab(onReplaced) {
  const handler = (event) => {
    if (event.key !== TOKEN_KEY) return
    if (!sessionStorage.getItem(TAB_TOKEN_KEY)) return
    if (event.newValue === sessionStorage.getItem(TAB_TOKEN_KEY)) return
    onReplaced()
  }

  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}