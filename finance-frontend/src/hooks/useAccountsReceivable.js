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
      const isFormData = payload instanceof FormData
      const res = await apiFetch('/api/accounts-receivable', {
        method: 'POST',
        ...(isFormData ? {} : { headers: { 'Content-Type': 'application/json' } }),
        body: isFormData ? payload : JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const firstError = json.errors ? Object.values(json.errors)[0]?.[0] : json.message
        throw new Error(firstError || json.message || 'Failed to create invoice.')
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

  const attachDocument = useCallback(async (arId, file) => {
    try {
      const formData = new FormData()
      formData.append('document', file)
      const res = await apiFetch(`/api/accounts-receivable/${arId}/document`, { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const firstError = json.errors ? Object.values(json.errors)[0]?.[0] : json.message
        return { success: false, message: firstError || 'Failed to attach document.' }
      }
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  const fetchDocumentHistory = useCallback(async (arId) => {
    try {
      const res = await apiFetch(`/api/accounts-receivable/${arId}/document`)
      const json = await res.json()
      if (!res.ok || !json.success) return { success: false, message: json.message || 'Failed to load document history.' }
      return { success: true, data: json.data ?? [] }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  const viewDocument = useCallback(async (arId, documentId, targetWindow) => {
    try {
      const res = await apiFetch(`/api/accounts-receivable/${arId}/document/${documentId}/view`)
      if (!res.ok) {
        targetWindow?.close()
        return { success: false, message: 'Failed to load document.' }
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const previewable = ['application/pdf', 'image/jpeg', 'image/png'].includes(blob.type)
      if (targetWindow) {
        targetWindow.location = url
      }
      return { success: true, viewedInline: previewable }
    } catch (err) {
      targetWindow?.close()
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  /** Fetches the aging summary matrix (all customers with outstanding invoices). */
  const fetchAgingSummary = useCallback(async () => {
    try {
      const res = await apiFetch('/api/accounts-receivable/aging-summary')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load aging summary.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  /** Fetches a full Statement of Account for a single customer by ID. */
  const fetchCustomerSoa = useCallback(async (customerId) => {
    try {
      const res = await apiFetch(`/api/accounts-receivable/customer-soa/${customerId}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load statement of account.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  /** Fetches SOA for all customers with outstanding invoices (batch print). */
  const fetchBatchSoa = useCallback(async () => {
    try {
      const res = await apiFetch('/api/accounts-receivable/soa-batch')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load batch statements.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
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
    attachDocument,
    fetchDocumentHistory,
    viewDocument,
    fetchAgingSummary,
    fetchCustomerSoa,
    fetchBatchSoa,
  }
}