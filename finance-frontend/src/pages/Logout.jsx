import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken, getToken } from '../utils/authToken'
import { API_BASE_URL } from '../utils/api'

export default function Logout() {
  const navigate = useNavigate()

  useEffect(() => {
    // Fallback logout route (guests and direct /logout visits). Revoke the
    // Sanctum token server-side first, then drop it locally. keepalive so
    // the request survives the redirect below; 401 is expected and ignored.
    const token = getToken()
    if (token) {
      fetch(`${API_BASE_URL}/api/logout`, {
        method: 'POST',
        keepalive: true,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => { /* best-effort */ })
    }
    clearToken()
    navigate('/login', { replace: true })
  }, [navigate])

  // Nothing rendered  -  this route just clears the session and redirects.
  return null
}