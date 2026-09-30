import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { isForcedLogoutVisible } from '../utils/forcedLogoutGate'

// Listens for the 'auth:expired' event dispatched by apiFetch() on a 401
// and performs a clean client-side redirect to the login page, instead of
// the previous window.location.href hard navigation  -  which could paint
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
      // The ForcedLogout modal is showing; let it drive this session's
      // exit (via its "Return to sign in" button) instead of racing it
      // to the login page and yanking the modal off screen.
      if (isForcedLogoutVisible()) return
      if (redirectingRef.current) return
      redirectingRef.current = true
      // Pass a reason through router state so the Login page can explain
      // WHY the session ended (single-tab/WS notices are not guaranteed to
      // reach every device, e.g. a phone that can't reach the Reverb host).
      navigate('/', { replace: true, state: { authNotice: 'signedOutByServer' } })
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