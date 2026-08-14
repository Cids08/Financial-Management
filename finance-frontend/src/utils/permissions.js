/**
 * Consumes a FLAT array of permission_name strings (e.g. ['users.view',
 * 'ap.manage']) — the exact shape GET /api/me/permissions returns (see
 * PermissionController::mine() on the backend). Deliberately NOT
 * dependent on user.role.permissions being eager-loaded on whatever
 * useAuth() returns, since that shape couldn't be confirmed and was the
 * likely cause of every check silently failing (only ungated items like
 * Dashboard were showing).
 *
 * Source the `permissions` array from usePermissions() (see
 * src/context/PermissionsContext.jsx) in Sidebar.jsx, not from useAuth().
 */
export function hasPermission(permissions, permissionName) {
  if (!permissionName) return true // items with no permission tag are always visible
  if (!permissions) return false
  return permissions.includes(permissionName)
}

/**
 * Filters menuData down to what this user is actually allowed to see.
 * - A leaf item with no `permission` field is always kept (Dashboard, Settings, Logout).
 * - A leaf item with a `permission` field is kept only if hasPermission() passes.
 * - A parent group (has `children`) is kept only if at least one child survives —
 *   otherwise the whole group (e.g. "User Management") disappears rather than
 *   showing an empty section header.
 */
export function filterMenuByPermissions(menuData, permissions) {
  return menuData.reduce((acc, item) => {
    if (Array.isArray(item.children)) {
      const visibleChildren = item.children.filter((child) => hasPermission(permissions, child.permission))
      if (visibleChildren.length > 0) {
        acc.push({ ...item, children: visibleChildren })
      }
      return acc
    }

    if (hasPermission(permissions, item.permission)) {
      acc.push(item)
    }
    return acc
  }, [])
}