import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

/**
 * ASSUMPTION: GET /api/suppliers returns objects shaped like
 * { supplier_id, supplier_name, ... } — matching the user_id/role_id
 * convention used elsewhere. I don't have SupplierController, so if the
 * real shape differs (e.g. plain `id`/`name`), adjust supplierName()
 * usage in AccountsPayable.jsx accordingly.
 *
 * ASSUMPTION: GET /api/audit-logs?module=Accounts+Payable&record_id={id}
 * returns this bill's AuditLog rows. Confirmed from routes/api.php that
 * GET /audit-logs exists (AuditLogController::index, permission:audit-logs.view),
 * but its actual query params aren't confirmed — module/record_id are a
 * guess based on the columns AccountsPayableService::create()/update()/
 * approve()/archive()/restore() already write on every AuditLog row.
 * Verify against the real controller and adjust fetchBillAuditLogs()
 * below if the param names differ.
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

  const [accounts, setAccounts] = useState([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [accountsError, setAccountsError] = useState(null)

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

  // Chart of accounts, for the bill's "which account does this debit"
  // dropdown — see StoreAccountsPayableRequest's now-required account_id.
  // Endpoint confirmed from routes/api.php: GET /general-ledger/chart-of-accounts
  // (GeneralLedgerController::accounts, gated by permission:general-ledger.view —
  // a user without that permission will get a 403 here even if they have
  // ap.manage, which is worth knowing about if AP staff can't see this
  // dropdown populate).
  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true)
    setAccountsError(null)
    try {
      const res = await apiFetch('/api/general-ledger/chart-of-accounts')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load accounts.')
      setAccounts(json.data ?? [])
    } catch (err) {
      setAccountsError(err.message)
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  // On-demand, not fetched on mount — called by the component when the
  // Bill Details modal opens for a specific record, since audit history
  // is per-bill rather than something the whole list view needs upfront.
  const fetchBillAuditLogs = useCallback(async (apId) => {
    const res = await apiFetch(`/api/audit-logs?module=${encodeURIComponent('Accounts Payable')}&record_id=${apId}`)
    const json = await res.json()
    if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load activity log.')
    return json.data ?? []
  }, [])

  const refetchAll = useCallback(async () => {
    await Promise.all([fetchBills(), fetchStats()])
  }, [fetchBills, fetchStats])

  useEffect(() => {
    fetchBills()
    fetchStats()
    fetchSuppliers()
    fetchAccounts()
  }, [fetchBills, fetchStats, fetchSuppliers, fetchAccounts])

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
      // Approving now posts a journal entry (see AccountsPayableService),
      // which changes what a bill "owes" means going forward — refresh
      // stats too, not just the bill list, so the Payable Amount card
      // doesn't go stale after an approval.
      await Promise.all([fetchBills(), fetchStats()])
      return { success: true, bill: json.data }
    } catch (err) {
      setBillsError(err.message)
      return { success: false, message: err.message }
    } finally {
      setActionBusyId(null)
    }
  }, [fetchBills, fetchStats])

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
    accounts,
    accountsLoading,
    accountsError,
    formSaving,
    formError,
    actionBusyId,
    createBill,
    updateBill,
    archiveBill,
    restoreBill,
    approveBill,
    fetchBillAuditLogs,
    refetch: refetchAll,
  }
}