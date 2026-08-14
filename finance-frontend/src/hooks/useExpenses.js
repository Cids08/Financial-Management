import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Backed by:
 *   GET    /api/expenses            (filters: search, status, budget_id, expense_category_id, trashed, per_page, page)
 *   GET    /api/expenses/stats
 *   GET    /api/expenses/{id}
 *   POST   /api/expenses
 *   PUT    /api/expenses/{id}
 *   PATCH  /api/expenses/{id}/approve
 *   PATCH  /api/expenses/{id}/reject
 *   PATCH  /api/expenses/{id}/archive
 *   PATCH  /api/expenses/{id}/restore   (withTrashed on the backend)
 */
export function useExpenses() {
  const [expenses, setExpenses] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 })
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [filters, setFilters] = useState({ search: '', status: '', budget_id: '', expense_category_id: '', trashed: false, page: 1 })

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
    const result = await runMutation('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
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
    rejectExpense,
    archiveExpense,
    restoreExpense,
  }
}