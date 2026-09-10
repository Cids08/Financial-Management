import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Backed by:
 *   GET    /api/expenses            (filters: search, status, budget_id, expense_category_id, expense_date_from, expense_date_to, trashed, per_page, page)
 *   GET    /api/expenses/stats
 *   GET    /api/expenses/{id}
 *   POST   /api/expenses
 *   PUT    /api/expenses/{id}
 *   PATCH  /api/expenses/{id}/approve
 *   PATCH  /api/expenses/{id}/reject
 *   PATCH  /api/expenses/{id}/archive
 *   PATCH  /api/expenses/{id}/restore   (withTrashed on the backend)
 *   POST   /api/expenses/{id}/receipt            (multipart — the actual receipt file)
 *   GET    /api/expenses/{id}/receipt/view       (inline, current/latest)
 *   GET    /api/expenses/{id}/receipts           (version history list)
 *   GET    /api/expenses/{id}/receipts/{document}/view (inline, specific version)
 *
 * Receipt upload/view functions mirror useBudgets.js's uploadPlan/viewPlan/
 * fetchPlanHistory/viewPlanVersion exactly, including the popup-blocker-safe
 * targetWindow handling — see the comments on viewReceipt() below for why
 * that ordering matters.
 */
export function useExpenses() {
  const [expenses, setExpenses] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 })
  const [filters, setFilters] = useState({ search: '', status: '', budget_id: '', expense_category_id: '', expense_date_from: '', expense_date_to: '', trashed: false, page: 1 })
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [stats, setStats] = useState({ total: 0, total_amount: 0, this_month_amount: 0, archived: 0 })
  const [statsLoading, setStatsLoading] = useState(true)

  const [mutating, setMutating] = useState(false)
  const [mutateError, setMutateError] = useState('')

  const buildQuery = useCallback((f) => {
    const params = new URLSearchParams()
    if (f.search) params.set('search', f.search)
    if (f.status) params.set('status', f.status)
    if (f.budget_id) params.set('budget_id', f.budget_id)
    if (f.expense_category_id) params.set('expense_category_id', f.expense_category_id)
    if (f.expense_date_from) params.set('expense_date_from', f.expense_date_from)
    if (f.expense_date_to) params.set('expense_date_to', f.expense_date_to)
    if (f.trashed) params.set('trashed', '1')
    params.set('page', f.page || 1)
    return params.toString()
  }, [])

  const fetchExpenses = useCallback(async (overrides = {}) => {
    const next = { ...filters, ...overrides }
    setFilters(next)
    setListLoading(true)
    setListError('')
    try {
      const res = await apiFetch(`/api/expenses?${buildQuery(next)}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load expenses.')
      setExpenses(json.data)
      if (json.meta) setMeta(json.meta)
    } catch (err) {
      setListError(err.message)
    } finally {
      setListLoading(false)
    }
  }, [filters, buildQuery])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await apiFetch('/api/expenses/stats')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load expense stats.')
      setStats(json.data)
    } catch {
      // Non-critical for the page to function — cards just show 0s.
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const runMutation = useCallback(async (path, options) => {
    setMutating(true)
    setMutateError('')
    try {
      const res = await apiFetch(path, options)
      const json = await res.json()
      if (!res.ok || !json.success) {
        const message = json.errors
          ? Object.values(json.errors).flat()[0]
          : json.message || 'Something went wrong.'
        throw new Error(message)
      }
      return { success: true, data: json.data }
    } catch (err) {
      setMutateError(err.message)
      return { success: false, message: err.message }
    } finally {
      setMutating(false)
    }
  }, [])

  const createExpense = useCallback(async (payload) => {
    const isFormData = payload instanceof FormData
    const result = await runMutation('/api/expenses', {
      method: 'POST',
      body: isFormData ? payload : JSON.stringify(payload),
    })
    if (result.success) {
      fetchExpenses()
      fetchStats()
    }
    return result
  }, [runMutation, fetchExpenses, fetchStats])

  const updateExpense = useCallback(async (id, payload) => {
    const result = await runMutation(`/api/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    if (result.success) {
      fetchExpenses()
      fetchStats()
    }
    return result
  }, [runMutation, fetchExpenses, fetchStats])

  const approveExpense = useCallback(async (id) => {
    const result = await runMutation(`/api/expenses/${id}/approve`, { method: 'PATCH' })
    if (result.success) {
      fetchExpenses()
      fetchStats()
    }
    return result
  }, [runMutation, fetchExpenses, fetchStats])

  const batchApproveExpenses = useCallback(async (expenseIds) => {
    const result = await runMutation('/api/expenses/batch-approve', {
      method: 'POST',
      body: JSON.stringify({ expense_ids: expenseIds }),
    })
    if (result.success) {
      fetchExpenses()
      fetchStats()
    }
    return result
  }, [runMutation, fetchExpenses, fetchStats])

  const fetchApprovalProposals = useCallback(async (filters = {}) => {
    const params = new URLSearchParams()
    if (filters.budget_id) params.set('budget_id', filters.budget_id)
    if (filters.expense_category_id) params.set('expense_category_id', filters.expense_category_id)
    if (filters.expense_date_from) params.set('expense_date_from', filters.expense_date_from)
    if (filters.expense_date_to) params.set('expense_date_to', filters.expense_date_to)

    const query = params.toString() ? `?${params.toString()}` : ''
    try {
      const res = await apiFetch(`/api/expenses/approval-proposals${query}`)
      const data = await res.json()
      return data
    } catch (e) {
      return { success: false, message: e.message || 'Failed to fetch approval proposals.' }
    }
  }, [])

  const rejectExpense = useCallback(async (id, remarks) => {
    const result = await runMutation(`/api/expenses/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ remarks }),
    })
    if (result.success) fetchExpenses()
    return result
  }, [runMutation, fetchExpenses])

  const archiveExpense = useCallback(async (id) => {
    const result = await runMutation(`/api/expenses/${id}/archive`, { method: 'PATCH' })
    if (result.success) {
      fetchExpenses()
      fetchStats()
    }
    return result
  }, [runMutation, fetchExpenses, fetchStats])

  const restoreExpense = useCallback(async (id) => {
    const result = await runMutation(`/api/expenses/${id}/restore`, { method: 'PATCH' })
    if (result.success) {
      fetchExpenses()
      fetchStats()
    }
    return result
  }, [runMutation, fetchExpenses, fetchStats])

  // Receipt upload is a real file (pdf/jpg/jpeg/png, max 10MB per
  // UploadExpenseReceiptRequest) sent as multipart/form-data — do NOT set
  // a Content-Type header here, the browser needs to set its own boundary.
  // Mirrors useBudgets.js's uploadPlan() exactly.
  const uploadReceipt = useCallback(async (id, file) => {
    setMutating(true)
    setMutateError('')
    try {
      const formData = new FormData()
      formData.append('receipt', file)
      const res = await apiFetch(`/api/expenses/${id}/receipt`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to attach receipt.')
      return { success: true, data: json.data }
    } catch (err) {
      setMutateError(err.message)
      return { success: false, message: err.message }
    } finally {
      setMutating(false)
    }
  }, [])

  // Types a browser can actually render inline — receipts are restricted
  // to pdf/jpg/jpeg/png server-side, so in practice this will basically
  // always be true, but the check stays for parity with useBudgets.js and
  // as a safety net if that validation rule ever loosens.
  const INLINE_VIEWABLE_TYPES = ['application/pdf']
  const isInlineViewable = (mimeType) =>
    INLINE_VIEWABLE_TYPES.includes(mimeType) || mimeType?.startsWith('image/')

  // Triggers a normal save-to-disk download from a blob already in hand —
  // same <a download> approach as useBudgets.js's triggerDownloadFromBlob.
  const triggerDownloadFromBlob = (blob, disposition, fallbackFilename) => {
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

  // Opens the CURRENT (most recently uploaded) receipt in a new tab
  // instead of downloading it. apiFetch is required (not a plain
  // window.open(url)) because the Authorization header has to go with the
  // request — a bare <a> tag or window.open() to the raw API URL
  // wouldn't carry it.
  //
  // `targetWindow` (optional): a tab already opened SYNCHRONOUSLY by the
  // caller, before this async function's fetch even starts — mirrors
  // useBudgets.js's viewPlan() exactly. Browsers only reliably allow
  // window.open() to bypass the popup blocker when it happens as the
  // direct, synchronous result of a click event; calling window.open()
  // only after `await res.blob()` resolves risks the browser no longer
  // considering it a direct response to the click and silently blocking
  // it. If no targetWindow is passed, this falls back to window.open(url)
  // so existing callers don't break.
  const viewReceipt = useCallback(async (id, targetWindow) => {
    try {
      const res = await apiFetch(`/api/expenses/${id}/receipt/view`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message || 'Failed to open the receipt.')
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

      // Not inline-viewable: close the blank tab rather than leaving it
      // stuck at about:blank, and download the file instead — using the
      // blob already fetched, no extra request needed.
      targetWindow?.close()
      triggerDownloadFromBlob(blob, res.headers.get('Content-Disposition'), 'receipt')
      return { success: true, viewedInline: false }
    } catch (err) {
      targetWindow?.close()
      return { success: false, message: err.message }
    }
  }, [])

  // Every receipt version ever attached to this expense, newest first — a
  // re-upload doesn't erase history, it just adds another row. Mirrors
  // useBudgets.js's fetchPlanHistory() exactly.
  const fetchReceiptHistory = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/expenses/${id}/receipts`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load receipt history.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  // Inline-view equivalent of viewReceipt() above, but for one specific
  // historical version by its supporting_documents id — same
  // synchronous-tab-then-redirect approach, same inline-viewable-type
  // check, same fallback to a background download, same optional
  // targetWindow parameter. Mirrors useBudgets.js's viewPlanVersion()
  // exactly.
  const viewReceiptVersion = useCallback(async (expenseId, documentId, targetWindow) => {
    try {
      const res = await apiFetch(`/api/expenses/${expenseId}/receipts/${documentId}/view`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message || 'Failed to open this receipt version.')
      }
      const blob = await res.blob()

      if (isInlineViewable(blob.type)) {
        const url = window.URL.createObjectURL(blob)
        if (targetWindow && !targetWindow.closed) {
          targetWindow.location.href = url
        } else {
          window.open(url, '_blank', 'noopener,noreferrer')
        }
        return { success: true, viewedInline: true }
      }

      targetWindow?.close()
      triggerDownloadFromBlob(blob, res.headers.get('Content-Disposition'), 'receipt')
      return { success: true, viewedInline: false }
    } catch (err) {
      targetWindow?.close()
      return { success: false, message: err.message }
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [])

  useEffect(() => {
    fetchExpenses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    expenses,
    meta,
    listLoading,
    listError,
    filters,
    setFilter: (patch) => fetchExpenses({ ...patch, page: 1 }),
    goToPage: (page) => fetchExpenses({ page }),
    refetch: fetchExpenses,

    stats,
    statsLoading,
    refetchStats: fetchStats,

    mutating,
    mutateError,
    createExpense,
    updateExpense,
    approveExpense,
    batchApproveExpenses,
    fetchApprovalProposals,
    rejectExpense,
    archiveExpense,
    restoreExpense,

    uploadReceipt,
    viewReceipt,
    fetchReceiptHistory,
    viewReceiptVersion,
  }
}