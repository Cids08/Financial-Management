import { createContext, useContext, useEffect } from 'react'
import { useNotifications } from '../hooks/useNotifications'

const NotificationsContext = createContext(null)

// Same polling cadence Sidebar.jsx used before — now lives in exactly one
// place instead of once per component that needs the unread count.
const UNREAD_POLL_MS = 30_000

export function NotificationsProvider({ children }) {
  // Everything useNotifications() exposes (notifications, meta, unreadCount,
  // loading, error, fetchNotifications, fetchUnreadCount, markAsRead,
  // markAllAsRead, deleteNotification) is shared as-is — consumers just
  // call useNotificationsContext() instead of useNotifications() directly.
  const notificationsState = useNotifications()
  const { fetchUnreadCount } = notificationsState

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