import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api'

export function useFixedAssets() {
  const [assets, setAssets] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
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
  }, [debouncedSearch, categoryFilter, statusFilter, showArchived])

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        archived: showArchived ? '1' : '0',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await apiFetch(`/api/fixed-assets?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load assets.')

      setAssets(json.data)
      setMeta(json.meta)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, categoryFilter, statusFilter, showArchived])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  const createAsset = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/fixed-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to add asset.')
      await fetchAssets()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [fetchAssets])

  const updateAsset = useCallback(async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/fixed-assets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update asset.')
      await fetchAssets()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [fetchAssets])

  const archiveAsset = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/fixed-assets/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive asset.')
      await fetchAssets()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [fetchAssets])

  const restoreAsset = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/fixed-assets/${id}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore asset.')
      await fetchAssets()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [fetchAssets])

  return {
    assets, meta, loading, saving, error,
    search, setSearch,
    categoryFilter, setCategoryFilter,
    statusFilter, setStatusFilter,
    showArchived, setShowArchived,
    page, setPage,
    createAsset, updateAsset, archiveAsset, restoreAsset,
  }
}