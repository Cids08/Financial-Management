import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Talks to /api/disbursements via apiFetch — mirrors the shape
 * DisbursementController / DisbursementService / DisbursementResource
 * return — server does the filtering + pagination, this hook just
 * orchestrates requests and keeps local UI state (page, filters) in sync
 * with them. Same apiFetch/res.json()/json.success contract as
 * useBudgets.js and useDepartments.js — this file previously called a
 * nonexistent `api.get/post/patch` (axios) that was never imported or
 * defined, which is why every request was silently throwing before it hit
 * the network. Fixed to use the apiFetch wrapper that's actually imported.
 */
export function useDisbursements() {
  const [disbursements, setDisbursements] = useState([])
  const [stats, setStats] = useState(null)
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Filters — mirrors the old local state names so the component barely
  // has to change.
  const [dSearch, setDSearch] = useState('')
  const [dStatusFilter, setDStatusFilter] = useState('all')
  const [dShowArchived, setDShowArchived] = useState(false)
  const [dDateFrom, setDDateFrom] = useState('')
  const [dDateTo, setDDateTo] = useState('')
  const [dPage, setDPage] = useState(1)

  const dHasDateFilter = Boolean(dDateFrom || dDateTo)
  const clearDDateFilter = () => { setDDateFrom(''); setDDateTo('') }

  // Debounce search so we don't fire a request per keystroke.
  const searchTimer = useRef(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(dSearch), 350)
    return () => clearTimeout(searchTimer.current)
  }, [dSearch])

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setDPage(1)
  }, [debouncedSearch, dStatusFilter, dShowArchived, dDateFrom, dDateTo])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', dPage)
      params.set('per_page', 10)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (dStatusFilter !== 'all') params.set('status', dStatusFilter)
      if (dShowArchived) params.set('archived', 1)
      if (dDateFrom) params.set('date_from', dDateFrom)
      if (dDateTo) params.set('date_to', dDateTo)

      const res = await apiFetch(`/api/disbursements?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load disbursements.')
      setDisbursements(json.data ?? [])
      setMeta(json.meta ?? { current_page: 1, last_page: 1, total: (json.data ?? []).length })
    } catch (err) {
      setError(err.message || 'Failed to load disbursements.')
    } finally {
      setLoading(false)
    }
  }, [dPage, debouncedSearch, dStatusFilter, dShowArchived, dDateFrom, dDateTo])

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/disbursements/stats')
      const json = await res.json()
      if (!res.ok || !json.success) return // stats are decorative — swallow so a stats failure doesn't blank the table
      setStats(json.data)
    } catch {
      // stats are decorative — swallow so a stats failure doesn't blank the table
    }
  }, [])

  useEffect(() => { fetchList() }, [fetchList])
  useEffect(() => { fetchStats() }, [fetchStats])

  const refresh = useCallback(() => {
    fetchList()
    fetchStats()
  }, [fetchList, fetchStats])

  const createDisbursement = useCallback(async (payload) => {
    const res = await apiFetch('/api/disbursements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to create disbursement.')
    await refresh()
    return json.data
  }, [refresh])

  const updateDisbursement = useCallback(async (id, payload) => {
    const res = await apiFetch(`/api/disbursements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update disbursement.')
    await refresh()
    return json.data
  }, [refresh])

  const approveDisbursement = useCallback(async (id) => {
    const res = await apiFetch(`/api/disbursements/${id}/approve`, { method: 'PATCH' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to approve disbursement.')
    await refresh()
    return json.data
  }, [refresh])

  const rejectDisbursement = useCallback(async (id, reason) => {
    const res = await apiFetch(`/api/disbursements/${id}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to reject disbursement.')
    await refresh()
    return json.data
  }, [refresh])

  const releaseDisbursement = useCallback(async (id) => {
    const res = await apiFetch(`/api/disbursements/${id}/release`, { method: 'PATCH' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to release disbursement.')
    await refresh()
    return json.data
  }, [refresh])

  // Proof upload is a real file, sent as multipart/form-data — do NOT set
  // a Content-Type header here, the browser needs to set its own boundary
  // (same rule as uploadPlan in useBudgets.js).
  const uploadProof = useCallback(async (id, file) => {
    const formData = new FormData()
    formData.append('proof', file)
    const res = await apiFetch(`/api/disbursements/${id}/proof`, {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to attach proof of release.')
    await refresh()
    return json.data
  }, [refresh])

  const archiveDisbursement = useCallback(async (id) => {
    const res = await apiFetch(`/api/disbursements/${id}/archive`, { method: 'PATCH' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive disbursement.')
    await refresh()
  }, [refresh])

  const restoreDisbursement = useCallback(async (id) => {
    const res = await apiFetch(`/api/disbursements/${id}/restore`, { method: 'PATCH' })
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore disbursement.')
    await refresh()
  }, [refresh])

  return {
    // data
    disbursements, stats, meta, loading, error,
    // filters
    dSearch, setDSearch, dStatusFilter, setDStatusFilter,
    dShowArchived, setDShowArchived, dDateFrom, setDDateFrom,
    dDateTo, setDDateTo, dHasDateFilter, clearDDateFilter,
    dPage, setDPage,
    // actions
    refresh, createDisbursement, updateDisbursement,
    approveDisbursement, rejectDisbursement, releaseDisbursement,
    uploadProof, archiveDisbursement, restoreDisbursement,
  }
}