import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Owns all network interaction for the Titles module (Master Data >
 * Titles). Titles.jsx should only call these functions and render
 * `titles` / `meta` - no fetch/apiFetch calls belong in the page itself,
 * same convention as useDepartments.
 *
 * Maps to routes/api.php:
 *   GET    /titles                (search, archived, per_page, page)
 *   POST   /titles
 *   PUT    /titles/{title}
 *   PATCH  /titles/{title}/archive
 *   PATCH  /titles/{title}/restore
 */
export function useTitles() {
  const [titles, setTitles] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchTitles = useCallback(async (filters = {}, page = 1, perPage = 12) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.set('search', filters.search)
      if (filters.archived) params.set('archived', filters.archived)
      params.set('per_page', perPage)
      params.set('page', page)

      const res = await apiFetch(`/api/titles?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load positions.')
      setTitles(json.data ?? [])
      setMeta(json.meta ?? { current_page: 1, last_page: 1, total: (json.data ?? []).length })
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  const createTitle = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save position.')
      setTitles((prev) => [json.data, ...prev])
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const updateTitle = useCallback(async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/titles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save position.')
      setTitles((prev) => prev.map((t) => (t.title_id === id ? json.data : t)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const archiveTitle = useCallback(async (id) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/titles/${id}/archive`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive position.')
      setTitles((prev) => prev.filter((t) => t.title_id !== id))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const restoreTitle = useCallback(async (id) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/titles/${id}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore position.')
      setTitles((prev) => prev.map((t) => (t.title_id === id ? json.data : t)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  return {
    titles,
    meta,
    loading,
    saving,
    error,
    fetchTitles,
    createTitle,
    updateTitle,
    archiveTitle,
    restoreTitle,
  }
}
