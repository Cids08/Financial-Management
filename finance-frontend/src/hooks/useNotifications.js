import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Backs the Notifications page. Maps to routes/api.php:
 *   GET    /notifications
 *   GET    /notifications/unread-count
 *   PATCH  /notifications/read-all
 *   PATCH  /notifications/{notification}/read
 *   DELETE /notifications/{notification}
 *
 * NOTE: NotificationController itself wasn't shared, so index()'s exact
 * filter/pagination support is assumed rather than confirmed — this hook
 * sends `unread` and `page`/`per_page` the same way every other paginated
 * index in this project does (see useAccountsReceivable, useBudgets). If
 * the controller doesn't support one of these query params yet, it'll just
 * ignore it silently rather than error, so worth checking that file if
 * filtering doesn't actually narrow results.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchNotifications = useCallback(async (filters = {}, page = 1, perPage = 20) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.unread) params.set('unread', '1')
      if (filters.type) params.set('type', filters.type)
      params.set('per_page', perPage)
      params.set('page', page)

      const res = await apiFetch(`/api/notifications?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load notifications.')
      setNotifications(json.data)
      setMeta(json.meta ?? { current_page: 1, last_page: 1, total: json.data.length })
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications/unread-count')
      const json = await res.json()
      if (!res.ok || !json.success) return { success: false }
      setUnreadCount(json.data?.count ?? json.data ?? 0)
      return { success: true }
    } catch {
      return { success: false }
    }
  }, [])

  const markAsRead = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to mark notification as read.')
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      const res = await apiFetch('/api/notifications/read-all', { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to mark all as read.')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at ?? new Date().toISOString() })))
      setUnreadCount(0)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  const deleteNotification = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to delete notification.')
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  return {
    notifications,
    meta,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  }
}