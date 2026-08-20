import { usePermissions } from '../context/PermissionsContext'
import { ShieldAlert } from 'lucide-react'

/**
 * Gates a single route by permission. Distinct from ProtectedRoute (which
 * only checks whether the user is authenticated at all, via <Outlet/>) —
 * this checks whether the authenticated user has a specific permission,
 * and wraps an individual page element rather than a layout route.
 *
 * Closes the gap where menuData.js hides a module from the sidebar, but
 * the underlying route is still directly reachable by typing the URL:
 * without this, the page mounts fully (header, buttons, stat cards) and
 * only the data fetch fails with an inline 403 banner, instead of
 * blocking access to the page itself.
 *
 * Usage in App.jsx (nested inside the existing <ProtectedRoute> auth guard):
 *   <Route path="/master-data/fixed-assets" element={
 *     <RequirePermission permission="fixed-assets.view">
 *       <FixedAssets crumbs={[...]} />
 *     </RequirePermission>
 *   } />
 */
export default function RequirePermission({ permission, children }) {
  const { hasPermission, loading } = usePermissions()

  // Permissions haven't loaded yet (e.g. hard refresh on a deep link) —
  // render nothing rather than bouncing the user before we actually know.
  if (loading) {
    return null
  }

  const allowed = !permission || hasPermission(permission)

  if (!allowed) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <ShieldAlert size={22} />
        </div>
        <h1 className="text-lg font-bold text-ink">Access Denied</h1>
        <p className="text-sm text-muted">
          You don't have permission to view this page. If you believe this is a mistake, contact your administrator.
        </p>
      </div>
    )
  }

  return children
}