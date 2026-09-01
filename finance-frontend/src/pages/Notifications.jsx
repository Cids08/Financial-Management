import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, Check, CheckCheck, Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Tooltip from '../components/Tooltip'
import { useNotificationsContext } from '../context/NotificationsContext'
import { notificationTypeMeta } from '../utils/notificationTypes'

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function Notifications({ title = 'Notifications', crumbs = ['Notifications'] }) {
  const navigate = useNavigate()

  // Shared instance — mounted once in DashboardLayout via
  // NotificationsProvider. Marking something read/deleted here updates
  // Header's bell and Sidebar's badge immediately, since they all read
  // from this same state instead of separately polling the API.
  //
  // NOTE: Header's bell dropdown (Notification.jsx) also calls
  // fetchNotifications() for its own 5-item preview, against this same
  // shared `notifications`/`meta` state. If someone opens that dropdown
  // while this page is also mounted, whichever fetch resolves last wins
  // and the other's list/pagination gets overwritten. Flagging this again
  // here since it's this page that would visibly "lose" — its list could
  // silently reset to a 5-item, page-1 preview if the header dropdown is
  // opened in the same tab.
  const {
    notifications, meta, unreadCount, loading, error,
    fetchNotifications, markAsRead, markAllAsRead, deleteNotification,
  } = useNotificationsContext()

  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchNotifications({ unread: unreadOnly }, page)
  }, [unreadOnly, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = meta.last_page || 1

  const handleOpen = async (n) => {
    if (!n.is_read) await markAsRead(n.id)
    navigate(n.route ?? notificationTypeMeta(n.type).route)
  }

  const handleMarkAllRead = async () => {
    await markAllAsRead()
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    await deleteNotification(id)
  }

  const groups = useMemo(() => {
    // Simple "Today / Earlier" grouping — purely a display convenience,
    // no server-side date filter involved.
    const today = new Date().toDateString()
    const todayItems = []
    const earlierItems = []
    for (const n of notifications) {
      const isToday = n.created_at && new Date(n.created_at).toDateString() === today
      ;(isToday ? todayItems : earlierItems).push(n)
    }
    return [
      { label: 'Today', items: todayItems },
      { label: 'Earlier', items: earlierItems },
    ].filter((g) => g.items.length > 0)
  }, [notifications])

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : "You're all caught up."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={unreadOnly ? 'primary' : 'secondary'}
            size="sm"
            icon={unreadOnly ? BellOff : Bell}
            onClick={() => { setUnreadOnly((prev) => !prev); setPage(1) }}
          >
            {unreadOnly ? 'Unread Only' : 'All'}
          </Button>
          <Button variant="secondary" size="sm" icon={CheckCheck} onClick={handleMarkAllRead} disabled={unreadCount === 0}>
            Mark All Read
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

      <div className={PANEL}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Bell size={28} className="text-muted/40" />
            <p className="text-sm text-muted">{unreadOnly ? "No unread notifications." : "No notifications yet."}</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</p>
              <div className="divide-y divide-border">
                {group.items.map((n) => {
                  const meta = notificationTypeMeta(n.type)
                  const Icon = meta.icon
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleOpen(n)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-bg ${!n.is_read ? 'bg-primary/5' : ''}`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
                        <Icon size={16} className={meta.color} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`truncate text-sm ${!n.is_read ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{n.title}</p>
                          {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.message}</p>
                        <p className="mt-1 text-xs text-muted/70">{formatDateTime(n.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!n.is_read && (
                          <Tooltip label="Mark as read" align="end">
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); markAsRead(n.id) }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <Check size={15} />
                            </span>
                          </Tooltip>
                        )}
                        <Tooltip label="Delete notification" align="end">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => handleDelete(e, n.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors duration-150"
                          >
                            <Trash2 size={15} />
                          </span>
                        </Tooltip>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}

        {!loading && meta.total > 0 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted">Page {meta.current_page} of {totalPages} · {meta.total} total</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Previous page">
                <ChevronLeft size={15} />
              </button>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Next page">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}