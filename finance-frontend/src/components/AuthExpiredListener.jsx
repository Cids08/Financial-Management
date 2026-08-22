import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

// Listens for the 'auth:expired' event dispatched by apiFetch() on a 401
// and performs a clean client-side redirect to the login page, instead of
// the previous window.location.href hard navigation — which could paint
// the outgoing authenticated layout and the incoming Login page in the
// same frame during the transition (visible as a jarring flash/overlap
// of the sidebar and the login card).
//
// Must be rendered inside <BrowserRouter> (it's mounted in App.jsx,
// alongside <Routes>) since it needs router context.
export default function AuthExpiredListener() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectingRef = useRef(false)

  useEffect(() => {
    const handleAuthExpired = () => {
      if (redirectingRef.current) return
      redirectingRef.current = true
      navigate('/', { replace: true })
    }

    window.addEventListener('auth:expired', handleAuthExpired)
    return () => window.removeEventListener('auth:expired', handleAuthExpired)
  }, [navigate])

  // Once we're actually back on a login route, reset the guard so a
  // future session expiry (after logging back in) can redirect again.
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/login') {
      redirectingRef.current = false
    }
  }, [location.pathname])

  return null
}