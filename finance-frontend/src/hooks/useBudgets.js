import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Owns all network interaction for the Budgets module (Financial
 * Transactions > Budgets). Budgets.jsx should only call these functions and
 * render `budgets` / `meta` / `stats` — no fetch/apiFetch calls belong in
 * the page itself, same convention as useAccountsReceivable.
 *
 * Maps to routes/api.php:
 *   GET    /budgets/stats
 *   GET    /budgets                 (status, fiscal_year, search, per_page, page)
 *   GET    /budgets/{budget}
 *   POST   /budgets
 *   PUT    /budgets/{budget}
 *   POST   /budgets/{budget}/plan   (multipart — the actual plan file)
 *   PATCH  /budgets/{budget}/approve
 *   PATCH  /budgets/{budget}/reject          { reason? }
 *   PATCH  /budgets/{budget}/archive
 *   PATCH  /budgets/{budget}/restore
 *
 * NOTE: BudgetController::index / BudgetService::paginate only accept
 * status, fiscal_year, and search filters today — there is no server-side
 * "archived" filter yet (archive is a soft delete, so a normal index call
 * excludes archived budgets and there's no ?archived=1 equivalent to the
 * withTrashed() pattern used elsewhere, e.g. users/restore). fetchArchived()
 * below is wired to call the same endpoint with an `archived` param in case
 * you add that to BudgetService::paginate — until then it will just return
 * whatever the unfiltered endpoint gives you. Flagging this rather than
 * guessing at server behavior that isn't in the code you shared.
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
      setBudgets((prev) => prev.map((b) => (b.id === id ? json.data : b)))
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
      setBudgets((prev) => prev.map((b) => (b.id === id ? json.data : b)))
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
      setBudgets((prev) => prev.map((b) => (b.id === id ? json.data : b)))
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
      setBudgets((prev) => prev.map((b) => (b.id === id ? json.data : b)))
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
      setBudgets((prev) => prev.filter((b) => b.id !== id))
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
      setBudgets((prev) => prev.map((b) => (b.id === id ? json.data : b)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
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
    approveBudget,
    rejectBudget,
    archiveBudget,
    restoreBudget,
  }
}