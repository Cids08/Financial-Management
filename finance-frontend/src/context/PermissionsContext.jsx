import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '../utils/api'

const PermissionsContext = createContext(null)

/**
 * Wrap DashboardLayout (alongside ProfileProvider/CompanyProvider) with
 * this once. Sidebar — and any future route guard that needs to check
 * "can this user do X" — then reads from the same fetched list instead of
 * each consumer re-fetching or, worse, reading the wrong shape off
 * useAuth()'s `user` object (see the bug this fixes: Sidebar.jsx was
 * passing `user` itself into filterMenuByPermissions(), which expects a
 * flat array of permission_name strings, not a user object).
 *
 * Backed by GET /api/me/permissions.
 */
export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchPermissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/me/permissions')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load permissions.')
      setPermissions(json.data || [])
    } catch (err) {
      setError(err.message)
      // Fail closed: if permissions couldn't be loaded, treat the user as
      // having none rather than silently falling back to "show everything".
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  // A Set gives O(1) lookups for hasPermission() instead of permissions
  // .includes(...) re-scanning the array on every single call — cheap
  // either way at this list size, but this is the correct shape for it.
  const permissionSet = useMemo(() => new Set(permissions), [permissions])

  const hasPermission = useCallback(
    (permissionName) => permissionSet.has(permissionName),
    [permissionSet]
  )

  const value = { permissions, hasPermission, loading, error, refetch: fetchPermissions }

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext)
  if (!ctx) {
    throw new Error('usePermissions must be used within a <PermissionsProvider>')
  }
  return ctx
}