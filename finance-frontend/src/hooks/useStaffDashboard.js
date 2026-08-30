import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Backs StaffDashboard.jsx. Hits GET /api/dashboard — per the
 * RolesAndPermissionsSeeder docblock, dashboard.view is the SAME
 * permission/route for every role; DashboardController is expected to
 * branch on the authenticated user's role to decide what payload comes
 * back. This hook doesn't care which shape it gets — it destructures
 * exactly the keys StaffDashboard.jsx renders and treats anything
 * missing as "not provided yet" rather than an error.
 *
 * Expected (staff-shaped) response:
 * {
 *   summary: {
 *     customers: number, suppliers: number,
 *     ar_outstanding: number, ap_outstanding: number,
 *     expenses_this_month: number,
 *   },
 *   attention: {
 *     ar: [{ id, customer_name, amount, due_date }],
 *     ap: [{ id, supplier_name, amount, due_date }],
 *     expenses: [{ id, description, amount, submitted_at }],
 *     disbursements: [{ id, reference, amount, submitted_at }],
 *     budgets: [{ id, budget_name, reason }], // e.g. "no plan attached"
 *   },
 *   recent_activity: [{ id, type, description, actor_name, created_at }],
 * }
 */
export function useStaffDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // apiFetch() returns the raw Response — it only throws on 401
      // (session expired). Every other non-2xx status still resolves
      // normally, so .ok has to be checked here, same as any other
      // apiFetch caller in this project.
      const response = await apiFetch('/api/dashboard')
      const json = await response.json()

      if (!response.ok) {
        throw new Error(json?.message || 'Failed to load dashboard.')
      }

      setData(json?.data ?? null)
    } catch (err) {
      setError(err?.message || 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, fetchDashboard }
}