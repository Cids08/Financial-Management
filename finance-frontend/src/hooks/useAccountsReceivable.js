import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Owns all network interaction for the Accounts Receivable module.
 * AccountsReceivable.jsx should only call these functions and render
 * `records` — no fetch/apiFetch calls belong in the page itself.
 */
export function useAccountsReceivable() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // No filters passed by default — returns the full set (active + archived)
  // in one call so the page can keep doing its own client-side filtering,
  // search, and stats the same way it already does.
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/accounts-receivable')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load invoices.')
      setRecords(json.data)
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  const createRecord = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/accounts-receivable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to create invoice.')
      }
      setRecords((prev) => [json.data, ...prev])
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const updateRecord = useCallback(async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/accounts-receivable/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to update invoice.')
      }
      setRecords((prev) => prev.map((r) => (r.ar_id === id ? json.data : r)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const toggleArchive = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/accounts-receivable/${id}/toggle-archive`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to update invoice.')
      }
      setRecords((prev) => prev.map((r) => (r.ar_id === id ? json.data : r)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  return {
    records,
    loading,
    saving,
    error,
    fetchRecords,
    createRecord,
    updateRecord,
    toggleArchive,
  }
}