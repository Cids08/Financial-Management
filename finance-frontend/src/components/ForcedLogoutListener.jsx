import { useEffect, useState } from 'react'
import { LogIn } from 'lucide-react'
import Button from './Button'
import { useAuth } from '../hooks/useAuth'
import { getEcho, disconnectEcho } from '../utils/echo'
import { getClientSessionId, isAuthenticated } from '../utils/authToken'
import { apiFetch } from '../utils/api'

/**
 * Mount this once, inside the authenticated layout (alongside where
 * AuthExpiredListener already lives in App.jsx). It needs to know the
 * current user's id to know which private channel to join — rather than
 * assuming that's available from some existing app-wide context, it
 * fetches its own copy via GET /api/profile on mount. Cheap, one-time
 * call, and keeps this component self-contained regardless of what else
 * changes elsewhere in the app.
 */
export default function ForcedLogoutListener() {
  const { logout } = useAuth()
  const [notice, setNotice] = useState(null) // { deviceLabel } | null

  useEffect(() => {
    if (!isAuthenticated()) return

    let channel
    let cancelled = false

    apiFetch('/api/profile')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json.success) return

        const userId = json.data.id
        const echo = getEcho()

        channel = echo.private(`user.${userId}`)
          .listen('.forced.logout', (event) => {
            // This broadcast includes every session kill for this user —
            // including the one that JUST happened because THIS tab is the
            // one that logged in. Ignore that case; only react when some
            // other tab/device triggered it.
            if (event.originSessionId === getClientSessionId()) return

            setNotice({ deviceLabel: event.deviceLabel })
          })
      })
      .catch(() => {
        // Profile fetch failing here isn't worth surfacing to the user —
        // worst case, this device won't get the real-time notice and
        // falls back to the existing 401-on-next-request handling
        // (AuthExpiredListener) once its token is actually revoked.
      })

    return () => {
      cancelled = true
      if (channel) {
        getEcho().leave(`user.${channel.name?.replace('private-', '') ?? ''}`)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!notice) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-surface p-6 shadow-2xl border border-white/10">
        <h2 className="text-lg font-bold text-ink">Signed out</h2>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          Your account was signed in from another device
          {notice.deviceLabel ? <> (<span className="font-medium text-ink">{notice.deviceLabel}</span>)</> : null}.
          For security, this session has been ended. If this wasn't you, change your password immediately.
        </p>
        <Button
          type="button"
          variant="primary"
          size="md"
          icon={LogIn}
          className="w-full mt-5"
          onClick={() => {
            disconnectEcho()
            logout()
          }}
        >
          Return to sign in
        </Button>
      </div>
    </div>
  )
}