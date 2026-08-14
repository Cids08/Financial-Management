import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * ASSUMPTION: GET /api/suppliers returns objects shaped like
 * { supplier_id, supplier_name, ... } — matching the user_id/role_id
 * convention used elsewhere. I don't have SupplierController, so if the
 * real shape differs (e.g. plain `id`/`name`), adjust supplierName()
 * usage in AccountsPayable.jsx accordingly.
 */
export function useAccountsPayable() {
  const [bills, setBills] = useState([])
  const [archivedBills, setArchivedBills] = useState([])
  const [billsLoading, setBillsLoading] = useState(true)
  const [billsError, setBillsError] = useState(null)

  const [stats, setStats] = useState({ total: 0, payable: 0, overdue: 0, archived: 0 })
  const [statsLoading, setStatsLoading] = useState(true)

  const [suppliers, setSuppliers] = useState([])
  const [suppliersLoading, setSuppliersLoading] = useState(true)
  const [suppliersError, setSuppliersError] = useState(null)

  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const [actionBusyId, setActionBusyId] = useState(null)

  const fetchBills = useCallback(async () => {
    setBillsLoading(true)
    setBillsError(null)
    try {
      const [activeRes, archivedRes] = await Promise.all([
        apiFetch('/api/accounts-payable'),
        apiFetch('/api/accounts-payable?archived=1'),
      ])
      const activeJson = await activeRes.json()
      const archivedJson = await archivedRes.json()

      if (!activeRes.ok || !activeJson.success) {
        throw new Error(activeJson.message || 'Failed to load bills.')
      }
      if (!archivedRes.ok || !archivedJson.success) {
        throw new Error(archivedJson.message || 'Failed to load archived bills.')
      }

      setBills(activeJson.data)
      setArchivedBills(archivedJson.data)
    } catch (err) {
      setBillsError(err.message)
    } finally {
      setBillsLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await apiFetch('/api/accounts-payable/stats')
      const json = await res.json()
      if (res.ok && json.success) setStats(json.data)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const fetchSuppliers = useCallback(async () => {
    setSuppliersLoading(true)
    setSuppliersError(null)
    try {
      const res = await apiFetch('/api/suppliers')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load suppliers.')
      setSuppliers(json.data)
    } catch (err) {
      setSuppliersError(err.message)
    } finally {
      setSuppliersLoading(false)
    }
  }, [])

  const refetchAll = useCallback(async () => {
    await Promise.all([fetchBills(), fetchStats()])
  }, [fetchBills, fetchStats])

  useEffect(() => {
    fetchBills()
    fetchStats()
    fetchSuppliers()
  }, [fetchBills, fetchStats, fetchSuppliers])

  const createBill = useCallback(async (fields) => {
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await apiFetch('/api/accounts-payable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to add bill.')
      await refetchAll()
      return { success: true }
    } catch (err) {
      setFormError(err.message)
      return { success: false, message: err.message }
    } finally {
      setFormSaving(false)
    }
  }, [refetchAll])

  const updateBill = useCallback(async (apId, fields) => {
    setFormSaving(true)
    setFormError(null)
    try {
      const res = await apiFetch(`/api/accounts-payable/${apId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to update bill.')
      await refetchAll()
      return { success: true }
    } catch (err) {
      setFormError(err.message)
      return { success: false, message: err.message }
    } finally {
      setFormSaving(false)
    }
  }, [refetchAll])

  const archiveBill = useCallback(async (apId) => {
    setActionBusyId(apId)
    setBillsError(null)
    try {
      const res = await apiFetch(`/api/accounts-payable/${apId}/archive`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to archive bill.')
      await refetchAll()
      return { success: true }
    } catch (err) {
      setBillsError(err.message)
      return { success: false, message: err.message }
    } finally {
      setActionBusyId(null)
    }
  }, [refetchAll])

  const restoreBill = useCallback(async (apId) => {
    setActionBusyId(apId)
    setBillsError(null)
    try {
      const res = await apiFetch(`/api/accounts-payable/${apId}/restore`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to restore bill.')
      await refetchAll()
      return { success: true }
    } catch (err) {
      setBillsError(err.message)
      return { success: false, message: err.message }
    } finally {
      setActionBusyId(null)
    }
  }, [refetchAll])

  const approveBill = useCallback(async (apId) => {
    setActionBusyId(apId)
    setBillsError(null)
    try {
      const res = await apiFetch(`/api/accounts-payable/${apId}/approve`, { method: 'PATCH' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to approve bill.')
      await fetchBills()
      return { success: true, bill: json.data }
    } catch (err) {
      setBillsError(err.message)
      return { success: false, message: err.message }
    } finally {
      setActionBusyId(null)
    }
  }, [fetchBills])

  return {
    bills,
    archivedBills,
    billsLoading,
    billsError,
    stats,
    statsLoading,
    suppliers,
    suppliersLoading,
    suppliersError,
    formSaving,
    formError,
    actionBusyId,
    createBill,
    updateBill,
    archiveBill,
    restoreBill,
    approveBill,
    refetch: refetchAll,
  }
}