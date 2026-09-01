import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Owns all network interaction for the Budgets module (Financial
 * Transactions > Budgets). Budgets.jsx should only call these functions and
 * render `budgets` / `meta` / `stats` — no fetch/apiFetch calls belong in
 * the page itself, same convention as useDepartments.
 *
 * Maps to routes/api.php:
 *   GET    /budgets/stats
 *   GET    /budgets                 (status, approval_status, fiscal_year, search, per_page, page)
 *   GET    /budgets/{budget}
 *   POST   /budgets
 *   PUT    /budgets/{budget}
 *   POST   /budgets/{budget}/plan   (multipart — the actual plan file)
 *   GET    /budgets/{budget}/plan            (forces download)
 *   GET    /budgets/{budget}/plan/view       (inline)
 *   GET    /budgets/{budget}/plans/{document}/view (inline, specific version)
 *   PATCH  /budgets/{budget}/approve
 *   PATCH  /budgets/{budget}/reject          { reason? }
 *   PATCH  /budgets/{budget}/archive
 *   PATCH  /budgets/{budget}/restore
 *
 * NOTE: field name is `budget_id`, not `id` — BudgetResource keys off
 * budget_id (confirmed against the actual resource), same as
 * useDepartments correctly keying off department_id.
 *
 * NOTE: BudgetResource exposes `status` and `approval_status` as two
 * separate fields. fetchBudgets forwards both as independent filters —
 * confirm BudgetService::paginate() actually reads `approval_status` from
 * the filters array server-side; if it currently only reads `status`,
 * this filter will be silently ignored rather than erroring, since Laravel
 * won't complain about an unused query param.
 */
export function useBudgets() {
  const [budgets, setBudgets] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchBudgets = useCallback(async (filters = {}, page = 1, perPage = 20) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.approval_status) params.set('approval_status', filters.approval_status)
      if (filters.fiscal_year) params.set('fiscal_year', filters.fiscal_year)
      if (filters.search) params.set('search', filters.search)
      if (filters.archived) params.set('archived', filters.archived)
      params.set('per_page', perPage)
      params.set('page', page)

      const res = await apiFetch(`/api/budgets?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load budgets.')
      setBudgets(json.data)
      setMeta(json.meta ?? { current_page: 1, last_page: 1, total: json.data.length })
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/budgets/stats')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load budget stats.')
      setStats(json.data)
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  const fetchBudget = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/budgets/${id}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load budget.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  const createBudget = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to create budget.')
      setBudgets((prev) => [json.data, ...prev])
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message, errors: err.errors }
    } finally {
      setSaving(false)
    }
  }, [])

  const updateBudget = useCallback(async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/budgets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update budget.')
      setBudgets((prev) => prev.map((b) => (b.budget_id === id ? json.data : b)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  // Plan upload is a real file (pdf/doc/docx/xls/xlsx, max 10MB per
  // UploadBudgetPlanRequest) sent as multipart/form-data — do NOT set a
  // Content-Type header here, the browser needs to set its own boundary.
  const uploadPlan = useCallback(async (id, file) => {
    setSaving(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('plan', file)
      const res = await apiFetch(`/api/budgets/${id}/plan`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to attach budget plan.')
      setBudgets((prev) => prev.map((b) => (b.budget_id === id ? json.data : b)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const approveBudget = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/budgets/${id}/approve`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to approve budget.')
      setBudgets((prev) => prev.map((b) => (b.budget_id === id ? json.data : b)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const rejectBudget = useCallback(async (id, reason) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/budgets/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to reject budget.')
      setBudgets((prev) => prev.map((b) => (b.budget_id === id ? json.data : b)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const archiveBudget = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/budgets/${id}/archive`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive budget.')
      setBudgets((prev) => prev.filter((b) => b.budget_id !== id))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  const restoreBudget = useCallback(async (id) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/budgets/${id}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore budget.')
      setBudgets((prev) => prev.map((b) => (b.budget_id === id ? json.data : b)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    }
  }, [])

  // Forces a browser download via a blob + temporary <a download>, same
  // as before — kept for whenever an explicit "save to disk" action is
  // wanted, as distinct from viewPlan() below.
  const downloadPlan = useCallback(async (id, fallbackFilename = 'budget-plan') => {
    try {
      const res = await apiFetch(`/api/budgets/${id}/plan`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message || 'Failed to download the budget plan.')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i)
      const filename = match ? decodeURIComponent(match[1]) : fallbackFilename

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  // Opens the plan in a new tab instead of downloading it. apiFetch is
  // still required here (not a plain window.open(url)) because the
  // Authorization header has to go with the request — a bare <a> tag or
  // window.open() to the raw API URL wouldn't carry it. So: fetch the
  // blob via apiFetch (hits the /plan/view endpoint, which sets
  // Content-Disposition: inline server-side), turn it into an object URL,
  // then point a tab at THAT. Only actually renders inline for file types
  // the browser has a native viewer for — practically just PDFs;
  // .doc/.docx/.xls/.xlsx will still trigger a download in most browsers
  // regardless, since there's no browser-native renderer for those.
  //
  // `targetWindow` (optional): a tab already opened SYNCHRONOUSLY by the
  // caller, before this async function's fetch even starts. This fixes a
  // real bug — window.open() only reliably bypasses the popup blocker
  // when it happens as the direct, synchronous result of a click event.
  // The previous version called window.open() only after `await
  // res.blob()` resolved, by which point the browser no longer considered
  // it a direct response to the click and could silently block it —
  // which looks exactly like "View" doing nothing, or falling back to a
  // forced download in browsers/settings that block popups aggressively.
  // If no targetWindow is passed, this falls back to the old
  // window.open(url) behavior so existing callers don't break.
  // Types a browser can actually render inline. Everything else (docx,
  // xlsx, etc.) has no native viewer in ANY browser — that's a platform
  // limitation, not something a header can fix. Trying to navigate a tab
  // to one of those anyway doesn't error, it just silently triggers a
  // background download while the tab sits at about:blank forever — which
  // is worse than not opening a tab at all, since now there's a dead tab
  // left behind with no indication anything happened.
  const INLINE_VIEWABLE_TYPES = ['application/pdf']
  const isInlineViewable = (mimeType) =>
    INLINE_VIEWABLE_TYPES.includes(mimeType) || mimeType?.startsWith('image/')

  // Triggers a normal save-to-disk download from a blob already in hand —
  // same <a download> approach as downloadPlan()/downloadPlanVersion(),
  // just without a second network request since the blob's already here.
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

  // `targetWindow` (optional): a tab already opened SYNCHRONOUSLY by the
  // caller, before this async function's fetch even starts — see the
  // comment further up this file for why that ordering matters for the
  // popup blocker. Return value now includes `viewedInline` so callers can
  // tell the difference between "opened in a tab" and "downloaded instead
  // because this file type has no in-browser viewer" and message the user
  // accordingly, rather than leaving them guessing why a tab is blank.
  const viewPlan = useCallback(async (id, targetWindow) => {
    try {
      const res = await apiFetch(`/api/budgets/${id}/plan/view`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message || 'Failed to open the budget plan.')
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
        // needs it to stay valid while it renders the file. The browser
        // releases it when that tab is closed or navigated away.
        return { success: true, viewedInline: true }
      }

      // Not inline-viewable: close the blank tab rather than leaving it
      // stuck at about:blank, and download the file instead — using the
      // blob already fetched, no extra request needed.
      targetWindow?.close()
      triggerDownloadFromBlob(blob, res.headers.get('Content-Disposition'), 'budget-plan')
      return { success: true, viewedInline: false }
    } catch (err) {
      targetWindow?.close()
      return { success: false, message: err.message }
    }
  }, [])

  // Every plan version ever attached to this budget, newest first — a
  // re-upload doesn't erase history, it just adds another row.
  const fetchPlanHistory = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/budgets/${id}/plans`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load plan history.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  // Same blob-download approach as downloadPlan, but for one specific
  // historical version by its supporting_documents id, not just the latest.
  const downloadPlanVersion = useCallback(async (budgetId, documentId, fallbackFilename = 'budget-plan') => {
    try {
      const res = await apiFetch(`/api/budgets/${budgetId}/plans/${documentId}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message || 'Failed to download this plan version.')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i)
      const filename = match ? decodeURIComponent(match[1]) : fallbackFilename

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      return { success: true }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  // Inline-view equivalent of viewPlan() above — same
  // synchronous-tab-then-redirect approach, same inline-viewable-type
  // check, same fallback to a background download for file types with no
  // browser-native viewer, same optional targetWindow parameter.
  const viewPlanVersion = useCallback(async (budgetId, documentId, targetWindow) => {
    try {
      const res = await apiFetch(`/api/budgets/${budgetId}/plans/${documentId}/view`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message || 'Failed to open this plan version.')
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
      triggerDownloadFromBlob(blob, res.headers.get('Content-Disposition'), 'budget-plan')
      return { success: true, viewedInline: false }
    } catch (err) {
      targetWindow?.close()
      return { success: false, message: err.message }
    }
  }, [])

  return {
    budgets,
    meta,
    stats,
    loading,
    saving,
    error,
    fetchBudgets,
    fetchStats,
    fetchBudget,
    createBudget,
    updateBudget,
    uploadPlan,
    downloadPlan,
    viewPlan,
    fetchPlanHistory,
    downloadPlanVersion,
    viewPlanVersion,
    approveBudget,
    rejectBudget,
    archiveBudget,
    restoreBudget,
  }
}