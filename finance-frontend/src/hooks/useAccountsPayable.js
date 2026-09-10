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
      const res = await apiFetch('/api/suppliers?per_page=500')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load suppliers.')
      const list = Array.isArray(json.data) ? json.data : (json.data?.data ?? [])
      setSuppliers(list)
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
      const isFormData = fields instanceof FormData
      const res = await apiFetch('/api/accounts-payable', {
        method: 'POST',
        ...(isFormData ? {} : { headers: { 'Content-Type': 'application/json' } }),
        body: isFormData ? fields : JSON.stringify(fields),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const firstError = json.errors ? Object.values(json.errors)[0]?.[0] : json.message
        throw new Error(firstError || json.message || 'Failed to add bill.')
      }
      await refetchAll()
      return { success: true, bill: json.data }
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

  const rejectBill = useCallback(async (apId, reason = '') => {
    setActionBusyId(apId)
    setBillsError(null)
    try {
      const res = await apiFetch(`/api/accounts-payable/${apId}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: reason || null }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to reject bill.')
      await Promise.all([fetchBills(), fetchStats()])
      return { success: true, bill: json.data }
    } catch (err) {
      setBillsError(err.message)
      return { success: false, message: err.message }
    } finally {
      setActionBusyId(null)
    }
  }, [fetchBills, fetchStats])

  // Attach a supporting document to a bill. multipart/form-data — apiFetch
  // must not set a Content-Type header itself (same as BillScanUpload's
  // /api/invoices/scan call) so the browser sets the multipart boundary.
  const attachDocument = useCallback(async (apId, file) => {
    try {
      const formData = new FormData()
      formData.append('document', file)
      const res = await apiFetch(`/api/accounts-payable/${apId}/document`, { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const firstError = json.errors ? Object.values(json.errors)[0]?.[0] : json.message
        return { success: false, message: firstError || 'Failed to attach document.' }
      }
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  const fetchDocumentHistory = useCallback(async (apId) => {
    try {
      const res = await apiFetch(`/api/accounts-payable/${apId}/document`)
      const json = await res.json()
      if (!res.ok || !json.success) return { success: false, message: json.message || 'Failed to load document history.' }
      return { success: true, data: json.data ?? [] }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  // targetWindow: a window already opened synchronously by the caller's
  // click handler (see AccountsPayableDocumentModal's handleView) — popup
  // blockers only reliably allow window.open() as a direct result of the
  // click event, not after this async fetch resolves.
  const viewDocument = useCallback(async (apId, documentId, targetWindow) => {
    try {
      const res = await apiFetch(`/api/accounts-payable/${apId}/document/${documentId}/view`)
      if (!res.ok) {
        targetWindow?.close()
        return { success: false, message: 'Failed to load document.' }
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const previewable = ['application/pdf', 'image/jpeg', 'image/png'].includes(blob.type)
      if (targetWindow) {
        targetWindow.location = url
      }
      return { success: true, viewedInline: previewable }
    } catch (err) {
      targetWindow?.close()
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Payment Wizard — Automated Batch Payment Run
  // ---------------------------------------------------------------------------

  /**
   * Fetch approved bills eligible for payment.
   * @param {{ horizon?: number, supplier_id?: number|null }} filters
   */
  const fetchPaymentProposals = useCallback(async (filters = {}) => {
    try {
      const params = new URLSearchParams()
      if (filters.horizon) params.set('horizon', filters.horizon)
      if (filters.supplier_id) params.set('supplier_id', filters.supplier_id)
      const res = await apiFetch(`/api/accounts-payable/payment-proposals?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load proposals.')
      return { success: true, data: json.data }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [])

  /**
   * Execute a Payment Run — creates pending disbursements for selected proposals.
   * @param {{ cash_account_id: number, payment_method: string, payment_date: string, proposals: Array }} payload
   */
  const executePaymentRun = useCallback(async (payload) => {
    try {
      const res = await apiFetch('/api/accounts-payable/execute-payment-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        const firstError = json.errors ? Object.values(json.errors)[0]?.[0] : json.message
        throw new Error(firstError || json.message || 'Payment run failed.')
      }
      await refetchAll()
      return { success: true, data: json.data, message: json.message }
    } catch (err) {
      return { success: false, message: err.message || 'Network error.' }
    }
  }, [refetchAll])

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
    rejectBill,
    fetchBillAuditLogs,
    attachDocument,
    fetchDocumentHistory,
    viewDocument,
    fetchPaymentProposals,
    executePaymentRun,
    refetch: refetchAll,
  }
}
