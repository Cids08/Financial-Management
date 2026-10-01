import { ContentSkeleton } from '../components/LoadingSkeleton'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, Check, CheckCheck, Trash2, Loader2, BellPlus, Search, RotateCcw, X, Monitor, Shield, AlertCircle } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Pagination from '../components/Pagination'
import Button from '../components/Button'
import Tooltip from '../components/Tooltip'
import Modal from '../components/Modal'
import { useNotificationsContext } from '../context/NotificationsContext'
import { useProfileContext } from '../context/ProfileContext'
import { getEcho } from '../utils/echo'
import { isAuthenticated } from '../utils/authToken'
import { notificationTypeMeta, NOTIFICATION_MODULES, NOTIFICATION_SEVERITIES } from '../utils/notificationTypes'
import { enablePush, disablePush, getBrowserSubscriptionState, fetchVapidKey } from '../utils/pushNotifications'

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const INPUT = `w-full h-10 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

async function fetchVapidKeyQuietly() {
  try {
    const { push_enabled: enabled } = await fetchVapidKey()
    return Boolean(enabled)
  } catch {
    return false
  }
}

export default function Notifications({ title = 'Notifications', crumbs = ['Notifications'] }) {
  const navigate = useNavigate()

  // Shared instance  -  mounted once in DashboardLayout via
  // NotificationsProvider. Marking something read/deleted here updates
  // Header's bell and Sidebar's badge immediately, since they all read
  // from this same state instead of separately polling the API.
  //
  // NOTE: Header's bell dropdown (Notification.jsx) also calls
  // fetchNotifications() for its own 5-item preview, against this same
  // shared `notifications`/`meta` state. If someone opens that dropdown
  // while this page is also mounted, whichever fetch resolves last wins
  // and the other's list/pagination gets overwritten. Flagging this again
  // here since it's this page that would visibly "lose"  -  its list could
  // silently reset to a 5-item, page-1 preview if the header dropdown is
  // opened in the same tab.
  const {
    notifications, meta, unreadCount, loading, error,
    fetchNotifications, markAsRead, markAllAsRead, deleteNotification,
  } = useNotificationsContext()

  const [unreadOnly, setUnreadOnly] = useState(false)
  const [severity, setSeverity] = useState('')
  const [module, setModule] = useState('')
  const [page, setPage] = useState(1)

  // --- Push notification state ---
  const [pushServerEnabled, setPushServerEnabled] = useState(false)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushNotice, setPushNotice] = useState('')
  const [showPushModal, setShowPushModal] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const state = await getBrowserSubscriptionState()
        if (!cancelled) setPushSubscribed(state.subscribed)
      } catch {
        /* push unavailable in this browser */
      }
    })()
    fetchVapidKeyQuietly().then((enabled) => {
      if (!cancelled) setPushServerEnabled(enabled)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    fetchNotifications({ unread: unreadOnly, types: severity ? [severity] : [], modules: module ? [module] : [] }, page)
  }, [unreadOnly, severity, module, page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live list: a new notification arriving on private-user.{id} re-fetches
  // the list so new entries appear without a manual reload. The channel is
  // shared with NotificationsContext (badge counter), so cleanup only stops
  // this listener  -  it must NOT leave the channel or the badge dies too.
  const { profile } = useProfileContext()
  const pageRef = useRef(page)
  pageRef.current = page
  const listParamsRef = useRef({ unread: unreadOnly, severity, module })
  listParamsRef.current = { unread: unreadOnly, severity, module }
  useEffect(() => {
    if (!isAuthenticated() || !profile?.id) return
    const refreshList = () => {
      const p = listParamsRef.current
      fetchNotifications({ unread: p.unread, types: p.severity ? [p.severity] : [], modules: p.module ? [p.module] : [] }, pageRef.current)
    }
    let channel
    try {
      const echo = getEcho()
      channel = echo.private(`user.${profile.id}`)
      channel.listen('.notification.created', refreshList)
    } catch {
      // websocket unavailable — rely on page reload / filters
    }
    return () => {
      if (channel) {
        try {
          channel.stopListening('.notification.created', refreshList)
        } catch {
          // ignore
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const totalPages = meta.last_page || 1

  const handleOpen = async (n) => {
    if (!n.is_read) await markAsRead(n.id)
    navigate(n.route ?? notificationTypeMeta(n.type, n).route)
  }

  const handleMarkAllRead = async () => {
    await markAllAsRead()
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    await deleteNotification(id)
  }

  const handleConfirmEnablePush = async () => {
    setShowPushModal(false)
    setPushBusy(true)
    setPushNotice('')
    try {
      await enablePush()
      setPushSubscribed(true)
      setPushNotice('Push notifications enabled for this browser.')
    } catch (err) {
      setPushNotice(err.message || 'Could not enable push notifications.')
    } finally {
      setPushBusy(false)
    }
  }

  const handleDisablePush = async () => {
    setPushBusy(true)
    setPushNotice('')
    try {
      await disablePush()
      setPushSubscribed(false)
      setPushNotice('Push notifications disabled for this browser.')
    } catch {
      setPushNotice('Could not disable push notifications.')
    } finally {
      setPushBusy(false)
    }
  }

  const groups = useMemo(() => {
    // Simple "Today / Earlier" grouping  -  purely a display convenience,
    // no server-side date filter involved.
    const today = new Date().toDateString()
    const todayItems = []
    const earlierItems = []
    const list = Array.isArray(notifications) ? notifications : []
    for (const n of list) {
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

      <div className="flex flex-col gap-4 rounded-2xl border border-border border-t-4 border-t-primary bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : "You're all caught up."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {/* Filters */}
      <div className={`${PANEL} p-4`}>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end flex-wrap">
          <div className="w-full sm:w-52 shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Severity</label>
            <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1) }} className={INPUT}>
              <option value="">All severities</option>
              {NOTIFICATION_SEVERITIES.map((s) => (
                <option key={s} value={s}>{notificationTypeMeta(s).label}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-52 shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Module</label>
            <select value={module} onChange={(e) => { setModule(e.target.value); setPage(1) }} className={INPUT}>
              <option value="">All units</option>
              {NOTIFICATION_MODULES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          {(severity || module) && (
            <div className="shrink-0">
              <Button variant="secondary" size="sm" icon={RotateCcw} iconPosition="left" onClick={() => { setSeverity(''); setModule(''); setPage(1) }}>Reset</Button>
            </div>
          )}
          {/* Push notifications */}
          <div className="ml-auto flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:max-w-sm">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Desktop push notifications</p>
              <p className="mt-0.5 text-xs text-muted">
                {pushSubscribed
                  ? 'Desktop alerts are enabled for this browser.'
                  : pushServerEnabled
                    ? 'Get notified even when the app tab is not open.'
                    : 'Desktop alerts are currently unavailable.'}
              </p>
              {pushNotice && <p className="mt-1 text-xs text-primary">{pushNotice}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {pushSubscribed ? (
                <Button variant="secondary" size="sm" icon={BellOff} onClick={handleDisablePush} disabled={pushBusy}>
                  {pushBusy ? <Loader2 size={14} className="animate-spin" /> : 'Disable'}
                </Button>
              ) : (
                <Button variant="primary" size="sm" icon={BellPlus} onClick={() => setShowPushModal(true)} disabled={pushBusy || !pushServerEnabled}>
                  {pushBusy ? <Loader2 size={14} className="animate-spin" /> : 'Enable push'}
                </Button>
              )}
        </div>
      </div>

        </div>
      </div>

      <div className={PANEL}>
        {loading ? (
          <ContentSkeleton rows={5} />
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Bell size={28} className="text-muted/40" />
            <p className="text-sm text-muted">{unreadOnly ? "No unread notifications." : "No notifications yet."}</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="px-3 pb-2 first:pt-3">
              <p className="px-1 py-2 text-xs font-semibold uppercase tracking-wider text-muted">{group.label}</p>
              <div className="space-y-2">
                {group.items.map((n) => {
                  const meta = notificationTypeMeta(n.type, n)
                  const Icon = meta.icon
                  return (
                    <article
                      key={n.id}
                      className={`grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto]
                        ${!n.is_read
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-surface hover:border-border/80 hover:bg-bg'}`}
                    >
                      <button type="button" onClick={() => handleOpen(n)} className="flex min-w-0 items-start gap-3 rounded-lg text-left">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
                        <Icon size={16} className={meta.color} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`wrap-anywhere text-sm ${!n.is_read ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{n.title}</p>
                          {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                        </div>
                        <p className="mt-1 wrap-anywhere text-xs leading-5 text-muted">{n.message}</p>
                        <p className="mt-1 text-xs text-muted/70">{formatDateTime(n.created_at)}</p>
                      </div>
                      </button>
                      <div className="flex shrink-0 items-start justify-end gap-1">
                        {!n.is_read && (
                          <Tooltip label="Mark as read" align="end">
                            <button
                              type="button"
                              aria-label="Mark as read"
                              onClick={(e) => { e.stopPropagation(); markAsRead(n.id) }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <Check size={15} />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip label="Delete notification" align="end">
                          <button
                            type="button"
                            aria-label="Delete notification"
                            onClick={(e) => handleDelete(e, n.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors duration-150"
                          >
                            <Trash2 size={15} />
                          </button>
                        </Tooltip>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          ))
        )}

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={meta.total} label="notifications" bordered />
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{error}</div>
      )}

      {/* Push notification opt-in disclosure & warning modal */}
      <Modal
        open={showPushModal}
        onClose={() => setShowPushModal(false)}
        title="Enable Desktop Push Notifications"
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setShowPushModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" icon={BellPlus} onClick={handleConfirmEnablePush}>
              Continue & Enable
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-1 text-sm text-ink">
          <p className="text-muted text-xs leading-relaxed">
            Alerts may appear on this device?s desktop or lock screen, even when the app is closed. Anyone viewing this device may see them. Continue only if you want to enable notifications for this browser.
          </p>

          <div className="space-y-2.5 rounded-lg border border-border bg-bg/50 p-3 text-xs">
            <div className="flex items-start gap-2.5">
              <Bell size={15} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-ink">What notifications will you receive?</p>
                <p className="text-muted mt-0.5">Critical approval requests, payment confirmations, overdue collections, and urgent system alerts.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Monitor size={15} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-ink">Device-Specific</p>
                <p className="text-muted mt-0.5">Push alerts will be registered exclusively for this specific browser and device. They will not appear on other computers unless enabled there too.</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Shield size={15} className="text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-ink">Privacy & Screen Discretion</p>
                <p className="text-muted mt-0.5">Desktop banners honor your Privacy Mode settings so sensitive monetary figures can remain masked if you work in shared spaces.</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-3 text-xs text-status-warning">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-status-warning" />
              <div>
                <span className="font-semibold">Browser Permission Required:</span>
                <p className="mt-0.5">When you click <strong>Continue & Enable</strong>, your web browser will display a permission prompt. Please click <strong>"Allow"</strong> to activate alerts.</p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
