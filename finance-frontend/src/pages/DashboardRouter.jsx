import { useProfileContext } from '../context/ProfileContext'
import Dashboard from './Dashboard'
import CollectorDashboard from './CollectorDashboard'
import StaffDashboard from './StaffDashboard'

/**
 * Single /dashboard route, component swapped by role rather than
 * separate URLs per role — mirrors how DashboardController already
 * varies its response server-side per role.
 *
 * profile.role comes back title-cased from ProfileResource
 * (Str::headline($role->name)) — "Collector", "Staff", "Admin",
 * "Super Admin" — NOT the raw slug ('collector', 'super-admin').
 * Comparisons below match that exactly.
 */
export default function DashboardRouter() {
  const { profile, loading } = useProfileContext()

  // Profile hasn't loaded yet (e.g. hard refresh) — render nothing rather
  // than flashing the wrong dashboard before we know the real role.
  if (loading || !profile) {
    return null
  }

  switch (profile.role) {
    case 'Collector':
      return <CollectorDashboard />
    case 'Staff':
      return <StaffDashboard />
    default:
      // Admin, Super Admin, and any unrecognized role fall back to the
      // full dashboard rather than a blank screen.
      return <Dashboard />
  }
}