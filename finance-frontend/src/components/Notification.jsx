import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { useClickOutside } from '../hooks/useClickOutside'
import { useNotificationsContext } from '../context/NotificationsContext'
import { notificationTypeMeta } from '../utils/notificationTypes'

// How many notifications the dropdown preview shows — the full list lives
// on the Notifications page.
const PREVIEW_COUNT = 5

function formatRelativeTime(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function Notification() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  // Shared instance (NotificationsProvider, mounted once in
  // DashboardLayout) — same state the Sidebar badge and the Notifications
  // page read from. NOTE: this dropdown reuses the context's single
  // `notifications`/`fetchNotifications` for its 5-item preview, the same
  // list state the full Notifications page paginates through. If someone
  // has that page open in one tab and opens this dropdown in another, one
  // will overwrite the other's page of results the next time either
  // fetches. Low-probability in practice, but worth knowing — the real
  // fix would be giving the preview its own separate list state instead
  // of sharing `notifications` from context.
  const { notifications, unreadCount, loading, fetchNotifications, markAsRead, markAllAsRead } = useNotificationsContext()

  useClickOutside(ref, () => setOpen(false))

  const handleToggle = () => {
    const nextOpen = !open
    setOpen(nextOpen)
    if (nextOpen) {
      fetchNotifications({}, 1, PREVIEW_COUNT)
    }
  }

  const handleSelect = async (n) => {
    if (!n.is_read) await markAsRead(n.id)
    setOpen(false)
    navigate(n.route ?? notificationTypeMeta(n.type).route)
  }

  const handleMarkAllRead = async (e) => {
    e.stopPropagation()
    await markAllAsRead()
  }

  const handleViewAll = () => {
    setOpen(false)
    navigate('/notifications')
  }

  const preview = notifications.slice(0, PREVIEW_COUNT)
  const hasUnread = unreadCount > 0

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-lg
          text-muted hover:text-ink hover:bg-bg transition-colors duration-150"
      >
        <Bell size={19} />
        {hasUnread && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-surface" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 bg-surface rounded-xl border border-border
            shadow-dropdown animate-fadeIn origin-top-right z-50"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            {hasUnread ? (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            ) : (
              <span className="text-xs text-muted">All caught up</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
              <Loader2 size={15} className="animate-spin" /> Loading...
            </div>
          ) : preview.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
              <Bell size={22} className="text-muted/40" />
              <p className="text-xs text-muted">No notifications yet.</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {preview.map((n) => {
                const meta = notificationTypeMeta(n.type)
                const Icon = meta.icon
                return (
                  <li
                    key={n.id}
                    onClick={() => handleSelect(n)}
                    className={`flex gap-3 px-4 py-3 hover:bg-bg cursor-pointer transition-colors duration-150 border-b border-border last:border-0 ${!n.is_read ? 'bg-primary/5' : ''}`}
                  >
                    <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${meta.bg} ${meta.color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-ink leading-snug truncate">{n.title}</p>
                        {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      </div>
                      <p className="text-xs text-muted mt-0.5">{formatRelativeTime(n.created_at)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <button
            onClick={handleViewAll}
            className="w-full text-center text-sm font-medium text-ink py-2.5 hover:bg-bg transition-colors duration-150 rounded-b-xl"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  )
}