import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * Owns all network interaction for the Departments module (Master Data >
 * Departments). Departments.jsx should only call these functions and
 * render `departments` / `meta` — no fetch/apiFetch calls belong in the
 * page itself, same convention as useBudgets.
 *
 * Maps to routes/api.php:
 *   GET    /departments                (search, status, archived, per_page, page)
 *   POST   /departments
 *   PUT    /departments/{department}
 *   DELETE /departments/{department}           (soft delete / archive)
 *   PATCH  /departments/{department}/restore
 *
 * NOTE: field name is `department_id`, not `id` — DepartmentController
 * resources appear to key off department_id per Departments.jsx's existing
 * usage (`/api/departments/${d.department_id}`). Kept consistent below.
 */
export function useDepartments() {
  const [departments, setDepartments] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const fetchDepartments = useCallback(async (filters = {}, page = 1, perPage = 12) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.set('search', filters.search)
      if (filters.status) params.set('status', filters.status)
      if (filters.archived) params.set('archived', filters.archived)
      params.set('per_page', perPage)
      params.set('page', page)

      const res = await apiFetch(`/api/departments?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load departments.')
      setDepartments(json.data ?? [])
      setMeta(json.meta ?? { current_page: 1, last_page: 1, total: (json.data ?? []).length })
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDepartment = useCallback(async (id) => {
    try {
      const res = await apiFetch(`/api/departments/${id}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load department.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message }
    }
  }, [])

  const createDepartment = useCallback(async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save department.')
      setDepartments((prev) => [json.data, ...prev])
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const updateDepartment = useCallback(async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/departments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to save department.')
      setDepartments((prev) => prev.map((d) => (d.department_id === id ? json.data : d)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const archiveDepartment = useCallback(async (id) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/departments/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive department.')
      setDepartments((prev) => prev.filter((d) => d.department_id !== id))
      return { success: true }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const restoreDepartment = useCallback(async (id) => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/departments/${id}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore department.')
      setDepartments((prev) => prev.map((d) => (d.department_id === id ? json.data : d)))
      return { success: true, data: json.data }
    } catch (err) {
      setError(err.message)
      return { success: false, message: err.message }
    } finally {
      setSaving(false)
    }
  }, [])

  return {
    departments,
    meta,
    loading,
    saving,
    error,
    fetchDepartments,
    fetchDepartment,
    createDepartment,
    updateDepartment,
    archiveDepartment,
    restoreDepartment,
  }
}