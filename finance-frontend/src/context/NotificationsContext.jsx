import { createContext, useContext, useEffect } from 'react'
import { useNotifications } from '../hooks/useNotifications'
import { useProfileContext } from './ProfileContext'
import { getEcho } from '../utils/echo'
import { isAuthenticated } from '../utils/authToken'

const NotificationsContext = createContext(null)

// Kept as a fallback for sessions where the websocket dropped; the real
// badge updates now arrive faster over the private-user channel.
const UNREAD_POLL_MS = 30_000

export function NotificationsProvider({ children }) {
  const notificationsState = useNotifications()
  const { fetchUnreadCount } = notificationsState
  const { profile } = useProfileContext()

  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, UNREAD_POLL_MS)
    const handleFocus = () => fetchUnreadCount()
    window.addEventListener('focus', handleFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchUnreadCount])

  // Live badge updates: notification.created arrives on private-user.{id}
  // from NotificationService and refreshes the unread count immediately
  // instead of waiting for the 30s poll.
  useEffect(() => {
    if (!isAuthenticated() || !profile?.id) return

    let channel
    let handler
    try {
      const echo = getEcho()
      handler = () => fetchUnreadCount()
      channel = echo.private(`user.${profile.id}`)
      channel.listen('.notification.created', handler)
    } catch {
      // Websocket unavailable — poll/focus fallback still covers us.
    }

    return () => {
      // stopListening on the captured channel/echo only -  calling getEcho()
      // here after a logout disconnect() would RECREATE the socket just to
      // tear it down (and resurrect the connection the logout just killed),
      // and leave() would rip the shared private-user.{id} channel out from
      // under ForcedLogoutListener.
      if (channel && handler) {
        try {
          channel.stopListening('.notification.created', handler)
        } catch {
          // ignore
        }
      }
    }
  }, [profile?.id, fetchUnreadCount])

  return (
    <NotificationsContext.Provider value={notificationsState}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    throw new Error('useNotificationsContext must be used within a NotificationsProvider')
  }
  return ctx
}