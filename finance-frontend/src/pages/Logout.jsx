import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '../utils/authToken'

export default function Logout() {
  const navigate = useNavigate()

  useEffect(() => {
    // TODO: also call the backend sign-out endpoint to invalidate the
    // Sanctum token server-side, not just remove it locally.
    clearToken()
    navigate('/login', { replace: true })
  }, [navigate])

  // Nothing rendered — this route just clears the session and redirects.
  return null
}