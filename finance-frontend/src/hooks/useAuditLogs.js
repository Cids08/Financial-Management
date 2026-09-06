import { useCallback, useState } from 'react'
import { apiFetch } from '../utils/api'

const DEFAULT_META = { current_page: 1, last_page: 1, per_page: 20, total: 0 }

function buildQuery(params) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value)
    }
  })
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Audit log viewer data for the (admin-only) Audit Logs page.
 *
 * Backed by:
 *   GET /api/audit-logs?search=&module=&action=&user_id=&date_from=&date_to=&page=
 *   GET /api/audit-logs/modules
 *   GET /api/audit-logs/export?search=&module=&action=&user_id=&date_from=&date_to=
 */
export function useAuditLogs() {
  const [logs, setLogs] = useState([])
  const [meta, setMeta] = useState(DEFAULT_META)
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const fetchModules = useCallback(async () => {
    try {
      const res = await apiFetch('/api/audit-logs/modules')
      const json = await res.json()
      if (res.ok && json.success) setModules(json.data)
    } catch {
      // Non-critical — the module filter dropdown just falls back to no
      // options if this fails; it shouldn't block the log list itself.
    }
  }, [])

  const fetchLogs = useCallback(async (filters = {}, page = 1) => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/audit-logs${buildQuery({ ...filters, page })}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load audit logs.')
      setLogs(json.data)
      setMeta(json.meta || DEFAULT_META)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Exports whatever the current filters (including date range) match —
  // not just the current page — via the unpaginated /export endpoint.
  // Returns the raw entries so the page can build the CSV itself, same
  // division of labor as Settings.jsx's exportActivity().
  const exportLogs = useCallback(async (filters = {}) => {
    setExporting(true)
    setExportError('')
    try {
      const res = await apiFetch(`/api/audit-logs/export${buildQuery(filters)}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to export audit logs.')
      return { success: true, data: json.data }
    } catch (err) {
      setExportError(err.message)
      return { success: false, message: err.message }
    } finally {
      setExporting(false)
    }
  }, [])

  return { logs, meta, modules, loading, error, fetchLogs, fetchModules, exportLogs, exporting, exportError }
}