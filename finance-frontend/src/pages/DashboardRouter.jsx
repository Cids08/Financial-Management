import { PageSkeleton } from '../components/LoadingSkeleton'
import { useProfileContext } from '../context/ProfileContext'
import Dashboard from './Dashboard'
import CollectorDashboard from './CollectorDashboard'
import StaffDashboard from './StaffDashboard'

/**
 * Single /dashboard route, component swapped by role rather than
 * separate URLs per role  -  mirrors how DashboardController already
 * varies its response server-side per role.
 *
 * profile.role comes back title-cased from ProfileResource
 * (Str::headline($role->name))  -  "Collector", "Staff", "Admin",
 * "Super Admin"  -  NOT the raw slug ('collector', 'super-admin').
 * Comparisons below match that exactly.
 */
export default function DashboardRouter() {
  const { profile, loading, error, refetch } = useProfileContext()

  // Show the workspace skeleton until the role has been resolved.
  if (loading) return <PageSkeleton />
  if (!profile) return <div role="alert" className="rounded-xl border border-border bg-surface p-6"><p className="text-sm text-ink">{error || 'Could not load your workspace.'}</p><button type="button" onClick={refetch} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black">Retry</button></div>

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