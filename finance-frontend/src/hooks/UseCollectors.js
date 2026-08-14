import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Backs Collectors.jsx against /api/collectors. Search/status/archived
 * filtering now happens server-side (the table can outgrow what's
 * reasonable to filter client-side), so this debounces the search term
 * itself rather than firing a request on every keystroke.
 */
export function useCollectors() {
  const [collectors, setCollectors] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)

  const debounceRef = useRef(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  // Any filter change resets back to page 1 — staying on page 4 of a
  // now-different result set would just show an empty/wrong page.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, showArchived])

  const fetchCollectors = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        archived: showArchived ? '1' : '0',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await apiFetch(`/api/collectors?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load collectors.')

      setCollectors(json.data)
      setMeta(json.meta)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, showArchived])

  useEffect(() => {
    fetchCollectors()
  }, [fetchCollectors])

  const createCollector = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/collectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to add collector.')
      await fetchCollectors()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [fetchCollectors])

  const updateCollector = useCallback(async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/collectors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update collector.')
      await fetchCollectors()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [fetchCollectors])

  const archiveCollector = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/collectors/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive collector.')
      await fetchCollectors()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [fetchCollectors])

  const restoreCollector = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/collectors/${id}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore collector.')
      await fetchCollectors()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [fetchCollectors])

  /**
   * GET /api/collectors/{id}/efficiency?period=day|week|month|year
   * A plain fetcher rather than hook-owned state — the efficiency
   * modal that calls this manages its own loading/data/error, since
   * only one collector's efficiency is ever being viewed at a time.
   */
  const getEfficiency = useCallback(async (id, period = 'month') => {
    try {
      const res = await apiFetch(`/api/collectors/${id}/efficiency?period=${period}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load efficiency.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  return {
    collectors, meta, loading, saving, error,
    search, setSearch,
    statusFilter, setStatusFilter,
    showArchived, setShowArchived,
    page, setPage,
    createCollector, updateCollector, archiveCollector, restoreCollector,
    getEfficiency,
  }
}