import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api'

export function useCashAccounts() {
  const [accounts, setAccounts] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, archived: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
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
  }, [debouncedSearch, typeFilter, showArchived])

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: '100',
        archived: showArchived ? '1' : '0',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (typeFilter !== 'all') params.set('type', typeFilter)

      // Stats are exact all-pages counts (see CashAccountService::stats),
      // independent of the filters below — fetched with the list so every
      // mutation refetch keeps both in sync in one round trip.
      const [res, statsRes] = await Promise.all([
        apiFetch(`/api/cash-accounts?${params}`),
        apiFetch('/api/cash-accounts/stats'),
      ])

      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load cash accounts.')

      const statsJson = await statsRes.json()
      if (!statsRes.ok || !statsJson.success) throw new Error(statsJson.message || 'Failed to load cash account stats.')

      setAccounts(json.data)
      setMeta(json.meta)
      setStats(statsJson.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, typeFilter, showArchived])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const createAccount = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/cash-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to add cash account.')
      await fetchAccounts()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [fetchAccounts])

  const updateAccount = useCallback(async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/cash-accounts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update cash account.')
      await fetchAccounts()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [fetchAccounts])

  const archiveAccount = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/cash-accounts/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive cash account.')
      await fetchAccounts()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [fetchAccounts])

  const restoreAccount = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/cash-accounts/${id}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore cash account.')
      await fetchAccounts()
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [fetchAccounts])

  return {
    accounts, meta, stats, loading, saving, error,
    search, setSearch,
    typeFilter, setTypeFilter,
    showArchived, setShowArchived,
    page, setPage,
    createAccount, updateAccount, archiveAccount, restoreAccount,
    refetch: fetchAccounts,
  }
}