import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isAuthenticated } from '../hooks/useAuth'

// Wrap any layout/route that requires a logged-in user.
// Usage: <Route element={<ProtectedRoute />}><Route element={<DashboardLayout />}>...</Route></Route>
export default function ProtectedRoute() {
  const location = useLocation()

  if (!isAuthenticated()) {
    return <Navigate to="/" replace state={{ from: location }} />
  }

  return <Outlet />
}