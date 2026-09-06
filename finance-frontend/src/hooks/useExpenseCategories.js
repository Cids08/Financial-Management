import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Backed by:
 *   GET    /api/expense-categories   (filters: search, is_active, trashed)
 *   POST   /api/expense-categories
 *   PUT    /api/expense-categories/{id}
 *   PATCH  /api/expense-categories/{id}/archive
 *   PATCH  /api/expense-categories/{id}/restore   (withTrashed on the backend)
 *
 * Unlike useExpenses, ExpenseCategoryController::index() returns the full
 * list via ->get() rather than ->paginate() — there's no `meta` here to
 * track, and no separate stats() endpoint either.
 */
export function useExpenseCategories() {
  const [categories, setCategories] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [filters, setFilters] = useState({ search: '', is_active: '', trashed: false })

  const [mutating, setMutating] = useState(false)
  const [mutateError, setMutateError] = useState('')

  const buildQuery = useCallback((f) => {
    const params = new URLSearchParams()
    if (f.search) params.set('search', f.search)
    if (f.is_active !== '') params.set('is_active', f.is_active)
    if (f.trashed) params.set('trashed', '1')
    return params.toString()
  }, [])

  const fetchCategories = useCallback(async (overrides = {}) => {
    const next = { ...filters, ...overrides }
    setFilters(next)
    setListLoading(true)
    setListError('')
    try {
      const res = await apiFetch(`/api/expense-categories?${buildQuery(next)}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load expense categories.')
      setCategories(json.data)
    } catch (err) {
      setListError(err.message)
    } finally {
      setListLoading(false)
    }
  }, [filters, buildQuery])

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

  const createCategory = useCallback(async (payload) => {
    const result = await runMutation('/api/expense-categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.success) fetchCategories()
    return result
  }, [runMutation, fetchCategories])

  const updateCategory = useCallback(async (id, payload) => {
    const result = await runMutation(`/api/expense-categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    if (result.success) fetchCategories()
    return result
  }, [runMutation, fetchCategories])

  const archiveCategory = useCallback(async (id) => {
    const result = await runMutation(`/api/expense-categories/${id}/archive`, { method: 'PATCH' })
    if (result.success) fetchCategories()
    return result
  }, [runMutation, fetchCategories])

  const restoreCategory = useCallback(async (id) => {
    const result = await runMutation(`/api/expense-categories/${id}/restore`, { method: 'PATCH' })
    if (result.success) fetchCategories()
    return result
  }, [runMutation, fetchCategories])

  useEffect(() => {
    fetchCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    categories,
    listLoading,
    listError,
    filters,
    setFilter: (patch) => fetchCategories(patch),
    refetch: fetchCategories,

    mutating,
    mutateError,
    createCategory,
    updateCategory,
    archiveCategory,
    restoreCategory,
  }
}