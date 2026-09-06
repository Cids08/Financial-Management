import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '../utils/api'

// Types a browser can actually render inline — same limitation as
// useBudgets.js's viewPlan()/useExpenses.js's viewReceipt(): everything
// else has no native viewer in ANY browser, so trying to navigate a tab
// to one of those just silently triggers a background download while the
// tab sits at about:blank.
const INLINE_VIEWABLE_TYPES = ['application/pdf']
const isInlineViewable = (mimeType) =>
  INLINE_VIEWABLE_TYPES.includes(mimeType) || mimeType?.startsWith('image/')

// Triggers a normal save-to-disk download from a blob already in hand.
function triggerDownloadFromBlob(blob, disposition, fallbackFilename) {
  const match = (disposition || '').match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i)
  const filename = match ? decodeURIComponent(match[1]) : fallbackFilename
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

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

  // Due-date range filter — sent to the backend the same way as
  // search/status, so it applies across every page, not just the one
  // currently loaded.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const debounceRef = useRef(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, statusFilter, showArchived, dateFrom, dateTo])

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
      if (dateFrom) params.set('due_date_from', dateFrom)
      if (dateTo) params.set('due_date_to', dateTo)

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
  }, [page, debouncedSearch, statusFilter, showArchived, dateFrom, dateTo])

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

  // Document upload is a real file (pdf/jpg/jpeg/png, max 10MB per
  // UploadTaxObligationDocumentRequest) sent as multipart/form-data — do
  // NOT set a Content-Type header here, the browser needs to set its own
  // boundary. Endpoint is singular /document, matching
  // AccountsPayableController's real document-route naming.
  const uploadDocument = useCallback(async (id, file) => {
    setError(null)
    try {
      const formData = new FormData()
      formData.append('document', file)
      const res = await apiFetch(`/api/tax-obligations/${id}/document`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to attach document.')
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  // Every document version ever attached to this obligation, newest
  // first — a re-upload doesn't erase history, it just adds another row.
  const fetchDocumentHistory = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/tax-obligations/${id}/document`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load document history.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  // Opens a specific document version inline in a new tab instead of
  // forcing a download. `targetWindow` (optional): a tab already opened
  // SYNCHRONOUSLY by the caller before this async function's fetch even
  // starts — see useBudgets.js's viewPlan() for the full explanation of
  // why that ordering matters for the popup blocker.
  const viewDocument = useCallback(async (obligationId, documentId, targetWindow) => {
    try {
      const res = await apiFetch(`/api/tax-obligations/${obligationId}/document/${documentId}/view`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message || 'Failed to open this document.')
      }
      const blob = await res.blob()

      if (isInlineViewable(blob.type)) {
        const url = window.URL.createObjectURL(blob)
        if (targetWindow && !targetWindow.closed) {
          targetWindow.location.href = url
        } else {
          window.open(url, '_blank', 'noopener,noreferrer')
        }
        // Deliberately not revoking the object URL immediately — the tab
        // needs it to stay valid while it renders the file.
        return { success: true, viewedInline: true }
      }

      targetWindow?.close()
      triggerDownloadFromBlob(blob, res.headers.get('Content-Disposition'), 'tax-obligation-document')
      return { success: true, viewedInline: false }
    } catch (err) {
      targetWindow?.close()
      return { success: false, message: err.message }
    }
  }, [])

  return {
    obligations, meta, loading, saving, error,
    search, setSearch,
    statusFilter, setStatusFilter,
    showArchived, setShowArchived,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    page, setPage,
    createObligation, updateObligation, archiveObligation, restoreObligation,
    uploadDocument, fetchDocumentHistory, viewDocument,
  }
}