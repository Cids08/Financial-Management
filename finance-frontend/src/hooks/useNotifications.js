import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Backs the Notifications page. Maps to routes/api.php:
 *   GET    /notifications
 *   GET    /notifications/unread-count
 *   PATCH  /notifications/read-all
 *   PATCH  /notifications/{notification}/read
 *   DELETE /notifications/{notification}
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
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
      const list = Array.isArray(json.data) ? json.data : (json.data?.data ?? [])
      setNotifications(list)
      setMeta(json.meta ?? { current_page: 1, last_page: 1, total: list.length })
      return { success: true }
    } catch (err) {
      setError(err.message)
      setNotifications([])
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
      // FIX: the controller returns { data: { unread_count: N } }, not
      // { data: { count: N } } / a bare number. json.data.count was always
      // undefined, and since json.data (an object) is never null/undefined,
      // the `??` fallback never kicked in either — unreadCount state was
      // being set to the raw {unread_count: N} object instead of a number.
      // That silently broke every numeric comparison downstream
      // (unreadCount === 0, unreadCount > 0, etc. in Notifications.jsx / Header.jsx).
      setUnreadCount(json.data?.unread_count ?? 0)
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