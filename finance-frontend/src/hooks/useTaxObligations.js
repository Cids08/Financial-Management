import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api'

export function useTaxObligations() {
  const [obligations, setObligations] = useState([])
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

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, showArchived])

  const fetchObligations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        archived: showArchived ? '1' : '0',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await apiFetch(`/api/tax-obligations?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load tax obligations.')

      setObligations(json.data)
      setMeta(json.meta)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, showArchived])

  useEffect(() => {
    fetchObligations()
  }, [fetchObligations])

  const createObligation = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/tax-obligations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to add tax obligation.')
      await fetchObligations()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [fetchObligations])

  const updateObligation = useCallback(async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/tax-obligations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update tax obligation.')
      await fetchObligations()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [fetchObligations])

  const archiveObligation = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/tax-obligations/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive tax obligation.')
      await fetchObligations()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [fetchObligations])

  const restoreObligation = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/tax-obligations/${id}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore tax obligation.')
      await fetchObligations()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [fetchObligations])

  return {
    obligations, meta, loading, saving, error,
    search, setSearch,
    statusFilter, setStatusFilter,
    showArchived, setShowArchived,
    page, setPage,
    createObligation, updateObligation, archiveObligation, restoreObligation,
  }
}