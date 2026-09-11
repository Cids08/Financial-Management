import { useState, useMemo, useEffect } from 'react'
import {
  Search, Plus, Pencil, Archive, RotateCcw, Send, CheckCircle2, Clock3, Info, Printer,
  Lock, ChevronLeft, ChevronRight, CalendarRange, X, Wallet, Users,
  Paperclip, FileText, AlertTriangle, Loader2,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import DisbursementProofModal from '../components/DisbursementProofModal'
import DisbursementPrintModal from '../components/DisbursementPrintModal'
import { formatCurrency } from '../utils/formatters'
import { usePermissions } from '../context/PermissionsContext'
import { useProfileContext } from '../context/ProfileContext'
import { hasPermission } from '../utils/permissions'
import { useDisbursements } from '../hooks/useDisbursements'
import { useDepartments } from '../hooks/useDepartments'
import { useCashAccounts } from '../hooks/useCashAccounts'
import { useAccountsPayable } from '../hooks/useAccountsPayable'

/* ---------------------------------------------------------------------- */
/* Static form config                                                      */
/* ---------------------------------------------------------------------- */

const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'GCash']

// A disbursement either originates from Accounts Payable (created and
// managed here) or from another department's Payroll request (created by
// the Payroll/HR module and simply routed here for approval). Finance only
// approves/rejects/releases payroll-sourced records — it never edits,
// attaches proof to, or archives them from this screen.
const SOURCE_TYPES = {
  ap: { label: 'Accounts Payable', short: 'AP' },
  payroll: { label: 'Payroll', short: 'Payroll' },
}

const EMPTY_DISBURSEMENT_FORM = {
  ap_id: '', department_id: '', cash_account_id: '',
  voucher_number: '', payee: '', payment_date: '', amount_paid: '',
  currency: 'PHP', payment_method: 'Bank Transfer', reference_number: '', remarks: '',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const DISBURSEMENT_STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Approved: 'bg-primary/10 text-primary-dark dark:bg-primary/15 dark:text-primary',
  Released: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

const SOURCE_BADGE_STYLES = {
  ap: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  payroll: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
}

function getSourceType(d) {
  return d.source_type === 'payroll' ? 'payroll' : 'ap'
}

function getNextReferenceNo(disbursements = []) {
  const existingRefs = new Set(
    disbursements.map((d) => (d.reference_number || '').trim().toLowerCase())
  )
  let maxNum = 0
  disbursements.forEach((d) => {
    const match = (d.reference_number || '').match(/REF-DIS-(\d+)/i)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  })
  let nextNum = maxNum > 0 ? maxNum + 1 : (disbursements.length + 1)
  while (existingRefs.has(`ref-dis-${String(nextNum).padStart(3, '0')}`)) {
    nextNum++
  }
  return `REF-DIS-${String(nextNum).padStart(3, '0')}`
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Confirmed against the real AccountsPayableResource: ap_id, invoice_number,
// remaining_balance. supplier_name is `whenLoaded('supplier', ...)` on the
// backend, so it only appears here if AccountsPayableController::index()
// eager-loads the supplier relation — falls back to just the invoice
// number if it isn't loaded, rather than showing "undefined".
function apBillId(bill) {
  return bill.ap_id
}
function apBillLabel(bill) {
  const ref = bill.invoice_number || `AP #${bill.ap_id}`
  const label = bill.supplier_name ? `${ref} — ${bill.supplier_name}` : ref
  return `${label} (${formatCurrency(bill.remaining_balance)} due)`
}
// Only bills that are approved, still open, and not archived make sense to
// disburse against:
//  - not archived: obviously.
//  - remaining_balance > 0 alone isn't enough — per AccountsPayableService::
//    stats()'s own comment, a Cancelled bill can still carry a nonzero
//    remaining_balance since cancelling doesn't zero that column out, so
//    status is checked explicitly too.
//  - approved_by !== null: per AccountsPayableService::approve()'s
//    comment, the AP liability only posts to the ledger at approval —
//    a disbursement is meant to settle that liability, so a bill with
//    nothing posted yet shouldn't be payable against.
function isSelectableApBill(bill) {
  return !bill.is_archived
    && bill.approved_by != null
    && !['Paid', 'Cancelled'].includes(bill.status)
    && Number(bill.remaining_balance) > 0
}

// ASSUMPTION: same caveat as above — CashAccountController/Resource not
// seen. Following the same `<module>_id` convention as departments
// (department_id) and disbursements (disbursement_id), the resource key
// is assumed to be cash_account_id; falls back to id if not.
function cashAccountId(account) {
  return account.cash_account_id ?? account.id
}
function cashAccountLabel(account) {
  const name = account.account_name ?? account.name ?? `Account #${cashAccountId(account)}`
  return account.bank_name ? `${name} — ${account.bank_name}` : name
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-ink text-right">{value ?? '—'}</span>
    </div>
  )
}

function NoAccessState({ label }) {
  return (
    <div className={`${PANEL} flex flex-col items-center justify-center gap-2 py-16 text-center`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-muted">
        <Lock size={18} />
      </div>
      <p className="text-sm font-medium text-ink">You don't have access to {label}</p>
      <p className="text-xs text-muted">Ask an administrator to grant you the {label} permission.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Main module — Disbursements (payments)                                  */
/* ---------------------------------------------------------------------- */

export default function Disbursements({ title = 'Disbursements', crumbs = ['Financial Transactions', 'Disbursements'] }) {
  const { permissions, loading: permsLoading } = usePermissions()
  const { profile } = useProfileContext()
  // Archive/restore of disbursements is restricted to Admin and Super Admin only.
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin'

  const canViewPayments = hasPermission(permissions, 'disbursements.view')
  const canManagePayments = hasPermission(permissions, 'disbursements.manage')
  const canApprovePayments = hasPermission(permissions, 'disbursements.approve') || canManagePayments
  const canReleasePayments = hasPermission(permissions, 'disbursements.release') || canManagePayments || canApprovePayments

  const {
    disbursements, stats, meta, loading, error,
    dSearch, setDSearch, dStatusFilter, setDStatusFilter,
    dShowArchived, setDShowArchived, dDateFrom, setDDateFrom,
    dDateTo, setDDateTo, dHasDateFilter, clearDDateFilter,
    dPage, setDPage,
    createDisbursement, updateDisbursement,
    approveDisbursement, rejectDisbursement, releaseDisbursement,
    uploadProof, archiveDisbursement, restoreDisbursement,
    fetchNextVoucherNumber,
    fetchProofHistory, viewProof, viewLatestProof,
  } = useDisbursements()

  // Lookup data for the Add/Edit form's dropdowns. These are only needed
  // once canManagePayments is true, but the hooks themselves are cheap
  // (single list fetch) and permission-gating the *inputs* rather than
  // the hook calls keeps this component simpler — no conditional hooks.
  const { departments, loading: departmentsLoading, fetchDepartments } = useDepartments()
  const { accounts: cashAccounts, loading: cashAccountsLoading } = useCashAccounts()
  const { bills: apBills, billsLoading: apBillsLoading } = useAccountsPayable()

  // useDepartments() doesn't auto-fetch on mount (unlike useCashAccounts
  // and useAccountsPayable) — it's built to be called with filters/page
  // from the Departments page itself. Pull a single large page here since
  // this is just a lookup list for the dropdown, not a paginated view.
  useEffect(() => {
    fetchDepartments({}, 1, 200)
  }, [fetchDepartments])

  const [dModalMode, setDModalMode] = useState(null) // null | 'add' | disbursement object
  const [dForm, setDForm] = useState(EMPTY_DISBURSEMENT_FORM)
  const [dFormError, setDFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [dateErrors, setDateErrors] = useState({ payment_date: '' })
  const [dDetailRecord, setDDetailRecord] = useState(null)
  const [dSubmitting, setDSubmitting] = useState(false)
  const [dActionError, setDActionError] = useState('')
  const [dActionSuccess, setDActionSuccess] = useState('')
  const [releasingId, setReleasingId] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [proofTarget, setProofTarget] = useState(null)
  const [printTarget, setPrintTarget] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  const validateDate = (field, value) => {
    if (!value) {
      setDateErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    const d = new Date(value)
    const min = new Date('2017-01-01')
    const max = new Date(`${new Date().getFullYear() + 1}-12-31`)
    if (isNaN(d.getTime())) {
      setDateErrors((e) => ({ ...e, [field]: 'Invalid date.' }))
    } else if (d < min || d > max) {
      setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
    } else {
      setDateErrors((e) => ({ ...e, [field]: '' }))
    }
  }

  // Source filter is applied client-side over the page the hook already
  // fetched. If/when useDisbursements grows a server-side `source_type`
  // param, swap this for a hook-driven filter like the status filter above.
  const [dSourceFilter, setDSourceFilter] = useState('all') // 'all' | 'ap' | 'payroll'

  const STATUS_SORT_PRIORITY = {
    Pending: 1,
    Approved: 2,
    Released: 3,
    Rejected: 4,
    Cancelled: 5,
  }

  const visibleDisbursements = useMemo(() => {
    const list = dSourceFilter === 'all'
      ? disbursements
      : disbursements.filter((d) => getSourceType(d) === dSourceFilter)

    return [...list].sort((a, b) => {
      const priorityA = STATUS_SORT_PRIORITY[a.status] || 99
      const priorityB = STATUS_SORT_PRIORITY[b.status] || 99
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }
      return (b.disbursement_id || 0) - (a.disbursement_id || 0)
    })
  }, [disbursements, dSourceFilter])

  const payrollPendingCount = useMemo(
    () => (stats?.payroll_pending ?? disbursements.filter((d) => getSourceType(d) === 'payroll' && d.status === 'Pending').length),
    [stats, disbursements]
  )

  const cashAccountsMap = useMemo(() => {
    const map = new Map()
    for (const acc of cashAccounts) {
      map.set(String(acc.id), acc)
    }
    return map
  }, [cashAccounts])

  const getDisbursementCashAccount = (d) => {
    if (!d) return null
    return cashAccountsMap.get(String(d.cash_account_id)) || null
  }

  const checkInsufficientFunds = (d) => {
    if (!d || d.status === 'Released') return false
    const acc = getDisbursementCashAccount(d)
    const balance = acc ? Number(acc.current_balance) : (d.cash_account_balance !== null && d.cash_account_balance !== undefined ? Number(d.cash_account_balance) : null)
    if (balance === null || isNaN(balance)) return Boolean(d.is_insufficient_funds)
    return Number(d.amount_paid) > balance
  }

  const checkMissingBudget = (d) => {
    if (!d || d.status === 'Released' || getSourceType(d) !== 'payroll') return false
    if (d.active_budget) {
      return !d.active_budget.exists
    }
    return d.has_active_budget === false
  }

  const openAddDisbursement = () => {
    // Default Payment Date to today — there's nothing bill-specific to
    // derive it from (bills only carry invoice_date/due_date), and most
    // disbursements are being recorded as happening now.
    setDForm({
      ...EMPTY_DISBURSEMENT_FORM,
      payment_date: new Date().toISOString().slice(0, 10),
      reference_number: getNextReferenceNo(disbursements),
    })
    setDFormError('')
    setFieldErrors({})
    setDateErrors({ payment_date: '' })
    setDModalMode('add')
    // Preview the next voucher number right away — see
    // useDisbursements' fetchNextVoucherNumber comment for why this is a
    // preview, not a reservation. Falls back to the "Auto-generated on
    // save" placeholder if the fetch fails for any reason.
    fetchNextVoucherNumber().then((voucherNumber) => {
      if (voucherNumber) setDForm((f) => ({ ...f, voucher_number: voucherNumber }))
    })
  }
  const openEditDisbursement = (d) => {
    if (!canManagePayments || d.status !== 'Pending' || getSourceType(d) === 'payroll') return
    setDForm({
      ap_id: d.ap_id, department_id: d.department_id, cash_account_id: d.cash_account_id,
      voucher_number: d.voucher_number, payee: d.payee, payment_date: d.payment_date || '',
      amount_paid: d.amount_paid, currency: d.currency || 'PHP', payment_method: d.payment_method,
      reference_number: d.reference_number || '', remarks: d.remarks || '',
    })
    setDFormError('')
    setFieldErrors({})
    setDateErrors({ payment_date: '' })
    setDModalMode(d)
  }
  const closeDisbursementModal = () => { setDModalMode(null); setDFormError(''); setFieldErrors({}); setDateErrors({ payment_date: '' }) }
  const openDisbursementDetail = (d) => { setDDetailRecord(d); setDActionError('') }
  const closeDisbursementDetail = () => { setDDetailRecord(null); setDActionError('') }

  // Selecting a bill already tells us who's being paid and how much they're
  // owed — auto-fill Payee/Amount Paid/Currency (and Payment Method, if the
  // bill's method is one this form actually supports) instead of making the
  // user retype what's already on the bill. Amount Paid defaults to the
  // FULL remaining_balance (a full settlement); the user can still lower it
  // for a partial payment. Only fires on an actual selection change, so
  // opening the Edit modal for an existing disbursement won't clobber
  // fields that were already customized after this bill was picked.
  const handleApBillChange = (e) => {
    const selectedId = e.target.value
    const bill = apBills.find((b) => String(apBillId(b)) === String(selectedId))
    setDForm((f) => ({
      ...f,
      ap_id: selectedId,
      payee: bill?.supplier_name ?? f.payee,
      amount_paid: bill ? String(bill.remaining_balance) : f.amount_paid,
      currency: bill?.currency ?? f.currency,
      payment_method: bill?.payment_method && PAYMENT_METHODS.includes(bill.payment_method)
        ? bill.payment_method
        : f.payment_method,
      // Head start only, not guaranteed correct — the bill's reference is
      // often a PO/invoice reference, while the disbursement's is more
      // often the actual payment transaction reference (check no., bank
      // transfer ID) that may not exist yet. Still editable either way.
      reference_number: bill?.reference_number ?? f.reference_number,
    }))
  }

  const handlePrintDisbursement = (d) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const isPayroll = getSourceType(d) === 'payroll'
    const rows = isPayroll
      ? [
          ['Payee', d.payee],
          ['Payroll Batch No.', d.payroll_batch_number || '—'],
          ['Requesting Department', d.department_name || '—'],
          ['Pay Period', d.pay_period_start && d.pay_period_end ? `${formatDate(d.pay_period_start)} – ${formatDate(d.pay_period_end)}` : '—'],
          ['Employees Covered', d.employee_count ?? '—'],
          ['Payment Date', formatDate(d.payment_date)],
          ['Amount Paid', formatCurrency(d.amount_paid)],
          ['Payment Method', d.payment_method],
          ['Cash Account', d.cash_account_name || '—'],
          ['Reference No.', d.reference_number || '—'],
          ['Approved By', d.approved_by_name || '—'],
          ['Status', d.status],
        ]
      : [
          ['Payee', d.payee],
          ['Related Bill', d.invoice_number || '—'],
          ['Department', d.department_name || '—'],
          ['Payment Date', formatDate(d.payment_date)],
          ['Amount Paid', formatCurrency(d.amount_paid)],
          ['Payment Method', d.payment_method],
          ['Cash Account', d.cash_account_name || '—'],
          ['Reference No.', d.reference_number || '—'],
          ['Approved By', d.approved_by_name || '—'],
          ['Status', d.status],
        ]
    win.document.write(`
      <html>
        <head>
          <title>${isPayroll ? 'Payroll Disbursement Voucher' : 'Disbursement Voucher'} ${d.voucher_number}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; padding: 48px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; margin-bottom: 24px; }
            .header h1 { margin: 0 0 4px; font-size: 22px; }
            .header p { margin: 0; color: #666; font-size: 14px; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #f3f3f3; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            td { padding: 10px 4px; border-bottom: 1px solid #eee; font-size: 14px; }
            td:first-child { color: #666; width: 40%; }
            td:last-child { font-weight: 600; text-align: right; }
            .footer { margin-top: 32px; font-size: 12px; color: #999; text-align: center; }
            @media print { body { padding: 24px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div><h1>${isPayroll ? 'Payroll Disbursement Voucher' : 'Disbursement Voucher'}</h1><p>${d.payee}</p></div>
            <span class="status">${d.status}</span>
          </div>
          <table>${rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('')}</table>
          <div class="footer">Printed on ${formatDateTime(new Date().toISOString())}</div>
        </body>
      </html>
    `)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleDisbursementSubmit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!dForm.ap_id) errors.ap_id = 'Please select a related bill.'
    if (!dForm.department_id) errors.department_id = 'Please select a department.'
    if (!dForm.payee.trim()) errors.payee = 'Payee is required.'
    if (!dForm.cash_account_id) errors.cash_account_id = 'Please select a cash account.'
    if (!dForm.payment_date) {
      errors.payment_date = 'Payment date is required.'
    } else if (dForm.payment_date < '2017-01-01') {
      errors.payment_date = 'Date is out of range.'
    }

    const amt = Number(dForm.amount_paid)
    if (!dForm.amount_paid) {
      errors.amount_paid = 'Amount paid is required.'
    } else if (amt <= 0) {
      errors.amount_paid = 'Amount must be greater than zero.'
    } else if (dForm.cash_account_id) {
      const selectedAcc = cashAccountsMap.get(String(dForm.cash_account_id))
      if (selectedAcc && amt > Number(selectedAcc.current_balance)) {
        errors.amount_paid = 'Amount exceeds available funds in the selected cash account.'
      }
    }

    if (dForm.reference_number && dForm.reference_number.trim()) {
      const trimmedRef = dForm.reference_number.trim().toLowerCase()
      const dup = disbursements.find((d) => {
        if (dModalMode !== 'add' && d.disbursement_id === dModalMode?.disbursement_id) return false
        return (d.reference_number || '').trim().toLowerCase() === trimmedRef
      })
      if (dup) {
        errors.reference_number = `Reference number is already used by disbursement voucher ${dup.voucher_number}.`
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setDFormError('')
    try {
      const payload = {
        ...dForm,
        source_type: 'ap',
        ap_id: Number(dForm.ap_id),
        department_id: Number(dForm.department_id),
        cash_account_id: Number(dForm.cash_account_id),
        amount_paid: Number(dForm.amount_paid) || 0,
      }
      if (dModalMode === 'add') {
        await createDisbursement(payload)
      } else if (dModalMode) {
        await updateDisbursement(dModalMode.disbursement_id, payload)
      }
      closeDisbursementModal()
    } catch (err) {
      setDFormError(err?.response?.data?.message || 'Could not save the disbursement.')
    } finally {
      setDSubmitting(false)
    }
  }

  const runAction = async (fn) => {
    setDActionError('')
    try {
      await fn()
    } catch (err) {
      setDActionError(err?.message || err?.response?.data?.message || 'That action failed.')
    }
  }

  const handleRelease = async (id, isDetail = false) => {
    if (releasingId) return
    setReleasingId(id)
    setDActionError('')
    setDActionSuccess('')
    try {
      await releaseDisbursement(id)
      setDActionSuccess('Disbursement released successfully! Payment journal entry posted to General Ledger.')
      setTimeout(() => setDActionSuccess(''), 7000)
      if (isDetail) closeDisbursementDetail()
    } catch (err) {
      setDActionError(err?.message || err?.response?.data?.message || 'Failed to release disbursement.')
    } finally {
      setReleasingId(null)
    }
  }

  const handleApprove = async (id, isDetail = false) => {
    if (approvingId) return
    setApprovingId(id)
    setDActionError('')
    setDActionSuccess('')
    try {
      await approveDisbursement(id)
      setDActionSuccess('Disbursement approved successfully! It is now ready for release.')
      setTimeout(() => setDActionSuccess(''), 7000)
      if (isDetail) closeDisbursementDetail()
    } catch (err) {
      setDActionError(err?.message || err?.response?.data?.message || 'Failed to approve disbursement.')
    } finally {
      setApprovingId(null)
    }
  }

  const handleProofUpload = (d, file) => {
    if (!file) return
    runAction(() => uploadProof(d.disbursement_id, file))
  }

  const openReject = (d) => {
    setRejectTarget(d)
    setRejectReason('')
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    setRejectSubmitting(true)
    try {
      await rejectDisbursement(rejectTarget.disbursement_id, rejectReason)
      setRejectTarget(null)
    } catch (err) {
      setDActionError(err?.response?.data?.message || 'Could not reject the disbursement.')
    } finally {
      setRejectSubmitting(false)
    }
  }

  const disbursementStatCards = stats && [
    { key: 'total', label: 'Total Payments', value: stats.total, icon: Send, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: dStatusFilter === 'all' && !dShowArchived && dSourceFilter === 'all', onClick: () => { setDStatusFilter('all'); setDShowArchived(false); setDSourceFilter('all') } },
    { key: 'released', label: 'Released Amount', value: formatCurrency(stats.total_paid), icon: CheckCircle2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: dStatusFilter === 'Released' && !dShowArchived, onClick: () => { setDStatusFilter('Released'); setDShowArchived(false) } },
    { key: 'pending', label: 'Pending', value: stats.pending, icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: dStatusFilter === 'Pending' && !dShowArchived, onClick: () => { setDStatusFilter('Pending'); setDShowArchived(false) } },
    { key: 'payroll_pending', label: 'Payroll Pending', value: payrollPendingCount, icon: Users, iconBg: 'bg-violet-50 dark:bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400', isActive: dSourceFilter === 'payroll' && dStatusFilter === 'Pending' && !dShowArchived, onClick: () => { setDStatusFilter('Pending'); setDShowArchived(false); setDSourceFilter('payroll') } },
    // Only admins can archive/restore disbursements — hide this card for non-admin roles
    ...(isAdmin ? [{ key: 'archived', label: 'Archived', value: stats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: dShowArchived, onClick: () => setDShowArchived(true) }] : []),
  ]

  const isDisbursementModalOpen = dModalMode !== null
  const isEditingDisbursement = dModalMode !== null && dModalMode !== 'add'

  /* ---------------------------------------------------------------------- */

  if (!permsLoading && !canViewPayments) {
    return (
      <div className="space-y-5 animate-fadeIn">
        <Breadcrumb items={crumbs} />
        <NoAccessState label="Disbursements" />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">
            Track outgoing payments released against supplier bills, plus payroll requests submitted by other departments for approval.
          </p>
        </div>
        {canManagePayments && (
          <Button variant="primary" size="sm" icon={Plus} onClick={openAddDisbursement}>Add Disbursement</Button>
        )}
      </div>

      {dActionSuccess && (
        <div className="flex items-center justify-between gap-2 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{dActionSuccess}</span>
          </div>
          <button type="button" onClick={() => setDActionSuccess('')} className="text-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {(error || dActionError) && (
        <div className="flex items-center justify-between gap-2 p-3 bg-rose-500/15 border border-rose-500/30 rounded-lg text-rose-800 dark:text-rose-300 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>{error || dActionError}</span>
          </div>
          <button type="button" onClick={() => setDActionError('')} className="text-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {disbursementStatCards && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {disbursementStatCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.key}
                type="button"
                onClick={card.onClick}
                className={`${PANEL} ${PANEL_PAD} flex items-center gap-2.5 text-left cursor-pointer
                  transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                  ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                  <Icon size={15} className={card.iconColor} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted">{card.label}</p>
                  <p className="text-lg font-bold text-ink">{card.value}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1 min-w-0 basis-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={dSearch} onChange={(e) => setDSearch(e.target.value)} placeholder="Search by voucher, payee, or reference..." className={`${INPUT} pl-9`} style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0 }} autoComplete="off" />
        </div>
        <select value={dSourceFilter} onChange={(e) => setDSourceFilter(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE}>
          <option value="all">All Sources</option>
          <option value="ap">Accounts Payable</option>
          <option value="payroll">Payroll</option>
        </select>
        <select value={dStatusFilter} onChange={(e) => setDStatusFilter(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE}>
          <option value="all">All Statuses</option>
          {['Pending', 'Approved', 'Released', 'Rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1.5 shrink-0">
          <CalendarRange size={15} className="text-muted shrink-0" />
          <input
            type="date"
            value={dDateFrom}
            onChange={(e) => setDDateFrom(e.target.value)}
            max={dDateTo || undefined}
            aria-label="Payment date from"
            className={`${INPUT} scheme-light dark:scheme-dark`}
            style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={dDateTo}
            onChange={(e) => setDDateTo(e.target.value)}
            min={dDateFrom || undefined}
            aria-label="Payment date to"
            className={`${INPUT} scheme-light dark:scheme-dark`}
            style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
          />
          {dHasDateFilter && (
            <Tooltip label="Clear date filter" align="end">
              <button
                type="button"
                onClick={clearDDateFilter}
                aria-label="Clear date filter"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
              >
                <X size={15} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className={PANEL}>
        <div className="overflow-hidden rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-3 py-3">Payee</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3">Source</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3">Reference / Dept</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3 whitespace-nowrap">Payment Date</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3 whitespace-nowrap">Amount</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3">Status</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wider px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">Loading disbursements…</td></tr>
              ) : visibleDisbursements.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                  {dHasDateFilter ? 'No disbursements fall within the selected payment date range.' : 'No disbursements match your filters.'}
                </td></tr>
              ) : visibleDisbursements.map((d) => {
                const sourceType = getSourceType(d)
                const isPayroll = sourceType === 'payroll'
                const cashAcc = getDisbursementCashAccount(d)
                const cashAccBal = cashAcc ? Number(cashAcc.current_balance) : (d.cash_account_balance !== null && d.cash_account_balance !== undefined ? Number(d.cash_account_balance) : null)
                const isOverdrawn = checkInsufficientFunds(d)
                const isMissingBudget = checkMissingBudget(d)
                // "No Proof, No Release" — AP payments require an uploaded proof document
                // (bank wire slip, check scan, or OR) before the Release button activates.
                // Payroll disbursements are exempt from this rule.
                const isMissingProof = !isPayroll && !d.has_attachment && d.status === 'Approved'
                const cashAccName = cashAcc?.account_name || d.cash_account_name || 'Cash Account'
                return (
                  <tr key={d.disbursement_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-3 py-2.5 min-w-0">
                      <p className="font-medium text-ink truncate max-w-35 sm:masm:max-w-45ax-w-[220px]">{d.payee}</p>
                      <p className="text-xs text-muted truncate max-w-.2.5:max-w-42.5 xl:max-w-50">{d.voucher_number} &middot; {d.cash_account_name}</p>
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_BADGE_STYLES[sourceType]}`}>
                        {SOURCE_TYPES[sourceType].short}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 min-w-0">
                      {isPayroll ? (
                        <>
                          <p className="text-ink text-xs truncate max-w-27.5 xl:max-w-32.5">{d.payroll_batch_number || '—'}</p>
                          <p className="text-xs text-muted truncate max-w-27.5 xl:max-w-32.5">{d.department_name}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-ink text-xs truncate max-w-27.5 xl:max-w-32.5">{d.invoice_number}</p>
                          <p className="text-xs text-muted truncate max-w-27.5 xl:max-w-32.5">{d.department_name}</p>
                        </>
                      )}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-ink text-xs">{formatDate(d.payment_date)}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap font-medium tabular-nums text-ink text-xs sm:text-sm">{formatCurrency(d.amount_paid)}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${DISBURSEMENT_STATUS_STYLES[d.status]}`}>{d.status}</span>
                        {isOverdrawn && (
                          <Tooltip label={`Insufficient balance in ${cashAccName} to cover ${formatCurrency(d.amount_paid)}`}>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-200 dark:border-red-500/30">
                              <AlertTriangle size={9} className="shrink-0" />
                              Insufficient Funds
                            </span>
                          </Tooltip>
                        )}
                        {isMissingBudget && (
                          <Tooltip label={`No active approved budget found for ${d.department_name || 'this department'}. Release blocked.`}>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                              <AlertTriangle size={9} className="shrink-0" />
                              No Budget
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip label="View full record" align="start">
                          <button type="button" onClick={() => openDisbursementDetail(d)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Info size={14} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Print voucher / BIR 2307" align="start">
                          <button type="button" onClick={() => setPrintTarget(d)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Printer size={14} />
                          </button>
                        </Tooltip>


                        {/* Proof attachment button — AP-only */}
                        {canManagePayments && !isPayroll && !d.is_archived && (
                          <Tooltip label={d.has_attachment ? 'View proof of payment' : 'Attach proof of payment'} align="start">
                            <button
                              type="button"
                              onClick={() => setProofTarget(d)}
                              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
                                d.has_attachment
                                  ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10'
                                  : 'text-muted hover:bg-bg hover:text-ink'
                              }`}
                            >
                              <Paperclip size={14} />
                            </button>
                          </Tooltip>
                        )}

                        {/* Edit / archive are AP-only */}
                        {canManagePayments && !isPayroll && d.status === 'Pending' && !d.is_archived && (
                          <Tooltip label="Edit disbursement" align="start">
                            <button type="button" onClick={() => openEditDisbursement(d)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <Pencil size={14} />
                            </button>
                          </Tooltip>
                        )}

                        {canApprovePayments && d.status === 'Pending' && (
                          <>
                            <button
                              type="button"
                              disabled={approvingId === d.disbursement_id}
                              onClick={() => handleApprove(d.disbursement_id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                            >
                              {approvingId === d.disbursement_id
                                ? <><Loader2 size={11} className="animate-spin" />Approving…</>
                                : <><CheckCircle2 size={11} />Approve</>
                              }
                            </button>
                            <button
                              type="button"
                              disabled={!!approvingId}
                              onClick={() => openReject(d)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {canReleasePayments && d.status === 'Approved' && (
                          isOverdrawn ? (
                            <Tooltip label={`Cannot release: Insufficient funds in ${cashAccName} (available: ${formatCurrency(cashAccBal ?? 0)}, required: ${formatCurrency(d.amount_paid)})`}>
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75 shrink-0"
                              >
                                <Wallet size={13} />
                                Release
                              </button>
                            </Tooltip>
                          ) : isMissingBudget ? (
                            <Tooltip label={`Cannot release: No active approved budget found for ${d.department_name || 'this department'}`}>
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75 shrink-0"
                              >
                                <Wallet size={13} />
                                Release
                              </button>
                            </Tooltip>
                          ) : isMissingProof ? (
                            <Tooltip label="Attach proof of payment (bank slip, check scan, or OR) before releasing — click the paperclip icon to upload">
                              <button
                                type="button"
                                onClick={() => setProofTarget(d)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/20 shadow-sm transition-all duration-150 active:scale-95 shrink-0"
                              >
                                <Paperclip size={13} />
                                Attach Proof
                              </button>
                            </Tooltip>
                          ) : (
                            <button
                              type="button"
                              disabled={releasingId !== null}
                              onClick={() => handleRelease(d.disbursement_id, false)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-dark active:bg-primary-dark text-black shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                              {releasingId === d.disbursement_id ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" />
                                  Releasing...
                                </>
                              ) : (
                                <>
                                  <Wallet size={13} />
                                  Release
                                </>
                              )}
                            </button>
                          )
                        )}

                        {d.is_archived ? (
                          <Tooltip label="Restore disbursement" align="end">
                            <button
                              type="button"
                              onClick={() => runAction(() => restoreDisbursement(d.disbursement_id))}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <RotateCcw size={14} />
                            </button>
                          </Tooltip>
                        ) : ['Released', 'Rejected'].includes(d.status) ? (
                          <Tooltip label="Archive disbursement" align="end">
                            <button
                              type="button"
                              onClick={() => runAction(() => archiveDisbursement(d.disbursement_id))}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors duration-150"
                            >
                              <Archive size={14} />
                            </button>
                          </Tooltip>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!loading && visibleDisbursements.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              Showing page {meta.current_page} of {meta.last_page} &middot; {meta.total} disbursements
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDPage((p) => Math.max(1, p - 1))}
                disabled={dPage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="px-2 text-xs font-medium text-ink whitespace-nowrap">
                Page {meta.current_page} of {meta.last_page}
              </span>
              <button
                type="button"
                onClick={() => setDPage((p) => Math.min(meta.last_page, p + 1))}
                disabled={dPage === meta.last_page}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Disbursement Add/Edit modal (Accounts Payable only) ---- */}
      <Modal
        open={isDisbursementModalOpen}
        onClose={closeDisbursementModal}
        title={isEditingDisbursement ? 'Edit Disbursement' : 'Add Disbursement'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDisbursementModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleDisbursementSubmit} disabled={dSubmitting}>
              {dSubmitting ? 'Saving…' : isEditingDisbursement ? 'Save Changes' : 'Add Disbursement'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleDisbursementSubmit} className="space-y-4">
          {dFormError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{dFormError}</div>
          )}
          <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-muted">
            Manual disbursements created here are always Accounts Payable payments. Payroll payments are submitted by other departments through the Payroll module and appear directly in the list below for approval.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Related Bill <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={dForm.ap_id}
                onChange={(e) => { handleApBillChange(e); setFieldErrors((fe) => ({ ...fe, ap_id: '' })) }}
                className={`${INPUT} ${fieldErrors.ap_id ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                disabled={apBillsLoading}
              >
                <option value="">{apBillsLoading ? 'Loading bills…' : 'Select a bill…'}</option>
                {apBills
                  .filter((bill) => isSelectableApBill(bill) || String(apBillId(bill)) === String(dForm.ap_id))
                  .map((bill) => (
                    <option key={apBillId(bill)} value={apBillId(bill)}>{apBillLabel(bill)}</option>
                  ))}
              </select>
              {fieldErrors.ap_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.ap_id}</p>}
            </div>
            <div>
              <label className={LABEL}>Department <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={dForm.department_id}
                onChange={(e) => { setDForm((f) => ({ ...f, department_id: e.target.value })); setFieldErrors((fe) => ({ ...fe, department_id: '' })) }}
                className={`${INPUT} ${fieldErrors.department_id ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                disabled={departmentsLoading}
              >
                <option value="">{departmentsLoading ? 'Loading departments…' : 'Select a department…'}</option>
                {departments.map((dept) => (
                  <option key={dept.department_id} value={dept.department_id}>{dept.department_name}</option>
                ))}
              </select>
              {fieldErrors.department_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.department_id}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Voucher Number</label>
              <input
                type="text"
                value={dForm.voucher_number}
                className={INPUT}
                style={INPUT_TEXT_STYLE}
                placeholder={!isEditingDisbursement ? 'Fetching next number…' : 'Auto-generated on save'}
                disabled
              />
              {!isEditingDisbursement && (
                <p className="mt-1 text-[11px] text-muted">
                  Reserved automatically — the exact number is only final once saved.
                </p>
              )}
            </div>
            <div>
              <label className={LABEL}>Payee <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="text"
                value={dForm.payee}
                onChange={(e) => { setDForm((f) => ({ ...f, payee: e.target.value })); setFieldErrors((fe) => ({ ...fe, payee: '' })) }}
                className={`${INPUT} ${fieldErrors.payee ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="Northgate Supplies Inc."
              />
              {fieldErrors.payee && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.payee}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Date <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="date"
                min="2017-01-01"
                max={`${new Date().getFullYear() + 1}-12-31`}
                value={dForm.payment_date}
                onChange={(e) => { setDForm((f) => ({ ...f, payment_date: e.target.value })); setFieldErrors((fe) => ({ ...fe, payment_date: '' })) }}
                onBlur={(e) => validateDate('payment_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${dateErrors.payment_date || fieldErrors.payment_date ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
              />
              {(dateErrors.payment_date || fieldErrors.payment_date) && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{dateErrors.payment_date || fieldErrors.payment_date}</p>}
            </div>
            <div>
              <label className={LABEL}>Amount Paid <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={dForm.amount_paid}
                onChange={(e) => {
                  const val = e.target.value
                  setDForm((f) => ({ ...f, amount_paid: val }))
                  setFieldErrors((fe) => ({ ...fe, amount_paid: '' }))
                  if (val === '') {
                    setFieldErrors((fe) => ({ ...fe, amount_paid: '' }))
                  } else if (Number(val) < 0) {
                    setFieldErrors((fe) => ({ ...fe, amount_paid: 'Amount paid cannot be negative.' }))
                  } else if (Number(val) === 0) {
                    setFieldErrors((fe) => ({ ...fe, amount_paid: 'Amount paid must be greater than zero.' }))
                  } else if (dForm.cash_account_id) {
                    const acc = cashAccountsMap.get(String(dForm.cash_account_id))
                    if (acc && Number(val) > Number(acc.current_balance)) {
                      setFieldErrors((fe) => ({ ...fe, amount_paid: 'Amount exceeds available funds in the selected cash account.' }))
                    }
                  }
                }}
                className={`${INPUT} ${fieldErrors.amount_paid ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="0.00"
              />
              {fieldErrors.amount_paid && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.amount_paid}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={dForm.payment_method} onChange={(e) => setDForm((f) => ({ ...f, payment_method: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Cash Account <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={dForm.cash_account_id}
                onChange={(e) => {
                  const val = e.target.value
                  setDForm((f) => ({ ...f, cash_account_id: val }))
                  setFieldErrors((fe) => ({ ...fe, cash_account_id: '' }))
                  const selectedAcc = cashAccountsMap.get(String(val))
                  const amt = Number(dForm.amount_paid)
                  if (selectedAcc && amt > 0 && amt > Number(selectedAcc.current_balance)) {
                    setFieldErrors((fe) => ({ ...fe, amount_paid: 'Amount exceeds available funds in the selected cash account.' }))
                  } else if (fieldErrors.amount_paid?.includes('exceeds available funds')) {
                    setFieldErrors((fe) => ({ ...fe, amount_paid: '' }))
                  }
                }}
                className={`${INPUT} ${fieldErrors.cash_account_id ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                disabled={cashAccountsLoading}
              >
                <option value="">{cashAccountsLoading ? 'Loading accounts…' : 'Select an account…'}</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}
                  </option>
                ))}
              </select>
              {fieldErrors.cash_account_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.cash_account_id}</p>}
            </div>
          </div>
          {(() => {
            const selectedAcc = cashAccountsMap.get(String(dForm.cash_account_id))
            const enteredAmt = Number(dForm.amount_paid)
            if (selectedAcc) {
              if (Number(selectedAcc.current_balance) <= 0) {
                return (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                    <div>
                      <span className="font-semibold">Account Has Zero Balance:</span> <strong>{selectedAcc.account_name}</strong> currently has no available funds for transactions. Please select another account.
                    </div>
                  </div>
                )
              }
              if (enteredAmt > 0 && enteredAmt > Number(selectedAcc.current_balance)) {
                return (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                    <div>
                      <span className="font-semibold">Insufficient Account Funds:</span> The entered amount ({formatCurrency(enteredAmt)}) exceeds the available funds in <strong>{selectedAcc.account_name}</strong>. This voucher cannot be created until sufficient funds are available.
                    </div>
                  </div>
                )
              }
            }
            return null
          })()}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={LABEL}>Reference Number</label>
                {dModalMode === 'add' && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextRef = getNextReferenceNo(disbursements)
                      setDForm((f) => ({ ...f, reference_number: nextRef }))
                      setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                    }}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Auto-generate
                  </button>
                )}
              </div>
              <input
                type="text"
                value={dForm.reference_number}
                onChange={(e) => {
                  const val = e.target.value
                  setDForm((f) => ({ ...f, reference_number: val }))
                  const trimmed = val.trim().toLowerCase()
                  if (trimmed) {
                    const dup = disbursements.find((d) => {
                      if (dModalMode !== 'add' && d.disbursement_id === dModalMode?.disbursement_id) return false
                      return (d.reference_number || '').trim().toLowerCase() === trimmed
                    })
                    if (dup) {
                      setFieldErrors((fe) => ({ ...fe, reference_number: `Reference number is already used by disbursement voucher ${dup.voucher_number}.` }))
                    } else {
                      setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                    }
                  } else {
                    setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                  }
                }}
                className={`${INPUT} ${fieldErrors.reference_number ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="REF-DIS-001"
              />
              {fieldErrors.reference_number && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {fieldErrors.reference_number}
                </p>
              )}
            </div>
            <div>
              <label className={LABEL}>Currency</label>
              <input type="text" value={dForm.currency} onChange={(e) => setDForm((f) => ({ ...f, currency: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="PHP" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={dForm.remarks} onChange={(e) => setDForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="Optional notes" />
          </div>

          {isEditingDisbursement && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <p className="text-xs font-medium text-muted mb-1">Record Info (read-only)</p>
              <DetailRow label="Approved by" value={dModalMode.approved_by_name} />
              <DetailRow label="Approved at" value={formatDateTime(dModalMode.approved_at)} />
              <DetailRow label="Released by" value={dModalMode.released_by_name} />
              <DetailRow label="Created at" value={formatDateTime(dModalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(dModalMode.updated_at)} />
            </div>
          )}
        </form>
      </Modal>

      {/* ---- Disbursement Detail modal ---- */}
      <Modal
        open={!!dDetailRecord}
        onClose={closeDisbursementDetail}
        title="Disbursement Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDisbursementDetail}>Close</Button>
            {dDetailRecord && (
              <Button
                variant="primary"
                size="md"
                icon={Printer}
                onClick={() => {
                  const target = dDetailRecord
                  closeDisbursementDetail()
                  setPrintTarget(target)
                }}
              >
                Print Voucher / BIR 2307
              </Button>
            )}

            {dDetailRecord && canApprovePayments && dDetailRecord.status === 'Pending' && (
              <>
                <button
                  type="button"
                  disabled={!!approvingId}
                  onClick={() => { closeDisbursementDetail(); openReject(dDetailRecord) }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={approvingId === dDetailRecord.disbursement_id}
                  onClick={() => handleApprove(dDetailRecord.disbursement_id, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {approvingId === dDetailRecord.disbursement_id
                    ? <><Loader2 size={13} className="animate-spin" />Approving…</>
                    : <><CheckCircle2 size={13} />Approve</>
                  }
                </button>
              </>
            )}
            {dDetailRecord && canReleasePayments && dDetailRecord.status === 'Approved' && (
              checkInsufficientFunds(dDetailRecord) ? (
                <Tooltip label={`Cannot release: Insufficient funds in ${getDisbursementCashAccount(dDetailRecord)?.account_name || dDetailRecord.cash_account_name}`}>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75"
                  >
                    <Wallet size={15} />
                    Release Payment
                  </button>
                </Tooltip>
              ) : checkMissingBudget(dDetailRecord) ? (
                <Tooltip label={`Cannot release: No active approved budget found for ${dDetailRecord.department_name || 'this department'}`}>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75"
                  >
                    <Wallet size={15} />
                    Release Payment
                  </button>
                </Tooltip>
              ) : (getSourceType(dDetailRecord) !== 'payroll' && !dDetailRecord.has_attachment) ? (
                <Tooltip label="Attach proof of payment before releasing (bank slip, check scan, or official receipt required)">
                  <button
                    type="button"
                    onClick={() => { closeDisbursementDetail(); setProofTarget(dDetailRecord) }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-500/20 shadow-sm transition-all duration-150 active:scale-95"
                  >
                    <Paperclip size={15} />
                    Attach Proof
                  </button>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  disabled={releasingId !== null}
                  onClick={() => handleRelease(dDetailRecord.disbursement_id, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark active:bg-primary-dark text-black shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {releasingId === dDetailRecord.disbursement_id ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Releasing...
                    </>
                  ) : (
                    <>
                      <Wallet size={15} />
                      Release Payment
                    </>
                  )}
                </button>
              )
            )}
            {dDetailRecord && !dDetailRecord.is_archived && ['Released', 'Rejected'].includes(dDetailRecord.status) && (
              <button
                type="button"
                onClick={() => {
                  const id = dDetailRecord.disbursement_id
                  closeDisbursementDetail()
                  runAction(() => archiveDisbursement(id))
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-border bg-surface hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:border-red-500/30 dark:hover:text-red-400 text-muted shadow-sm transition-all duration-150 active:scale-95"
              >
                <Archive size={15} />
                Archive
              </button>
            )}
            {dDetailRecord && dDetailRecord.is_archived && (
              <button
                type="button"
                onClick={() => {
                  const id = dDetailRecord.disbursement_id
                  closeDisbursementDetail()
                  runAction(() => restoreDisbursement(id))
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-border bg-surface hover:bg-bg text-ink shadow-sm transition-all duration-150 active:scale-95"
              >
                <RotateCcw size={15} />
                Restore
              </button>
            )}
          </>
        }
      >
        {dDetailRecord && (() => {
          const sourceType = getSourceType(dDetailRecord)
          const isPayroll = sourceType === 'payroll'
          const detailCashAcc = getDisbursementCashAccount(dDetailRecord)
          const detailCashAccBal = detailCashAcc ? Number(detailCashAcc.current_balance) : (dDetailRecord.cash_account_balance !== null && dDetailRecord.cash_account_balance !== undefined ? Number(dDetailRecord.cash_account_balance) : null)
          const isDetailOverdrawn = checkInsufficientFunds(dDetailRecord)
          const shortage = isDetailOverdrawn && detailCashAccBal !== null ? Math.max(0, Number(dDetailRecord.amount_paid) - detailCashAccBal) : 0
          const detailAccName = detailCashAcc?.account_name || dDetailRecord.cash_account_name || 'Cash Account'
          return (
            <div className="space-y-4">
              {dActionError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                  {dActionError}
                </div>
              )}
              {/* Insufficient Funds alert banner */}
              {isDetailOverdrawn && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/30 dark:bg-red-500/10">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">Insufficient Account Funds</p>
                    <p className="text-xs text-red-600 dark:text-red-400/90 mt-0.5">
                      The assigned cash account (<strong>{detailAccName}</strong>) currently has insufficient funds to cover this disbursement of <strong>{formatCurrency(dDetailRecord.amount_paid)}</strong>.
                    </p>
                    <p className="text-xs text-red-500 dark:text-red-400/70 mt-1">
                      Funds must be deposited to this account before this payment can be released.
                    </p>
                  </div>
                </div>
              )}
              {/* Missing Active Budget alert banner */}
              {isPayroll && checkMissingBudget(dDetailRecord) && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Missing Active Department Budget</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-0.5">
                      The requesting department (<strong>{dDetailRecord.department_name || 'Department'}</strong>) does not have an approved <strong>Active</strong> budget.
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-1">
                      To maintain fiscal control, an approved active budget is strictly required before payroll funds can be released.
                    </p>
                  </div>
                </div>
              )}
              {/* Pending approval banner */}
              {dDetailRecord.status === 'Pending' && canApprovePayments && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Awaiting Approval</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-0.5">This disbursement is pending your review.</p>
                  </div>
                </div>
              )}
              {/* Approved awaiting release banner — only when proof is also present (or payroll) */}
              {dDetailRecord.status === 'Approved' && canReleasePayments && !isDetailOverdrawn && !checkMissingBudget(dDetailRecord) && (isPayroll || dDetailRecord.has_attachment) && (
                <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 dark:border-primary/20 dark:bg-primary/10">
                  <Wallet size={16} className="mt-0.5 shrink-0 text-primary-dark dark:text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-primary-dark dark:text-primary">Approved — Ready for Release</p>
                    <p className="text-xs text-primary-dark/80 dark:text-primary/80 mt-0.5">This disbursement has been approved and is ready to be released.</p>
                  </div>
                </div>
              )}
              {/* Missing proof banner — AP only, blocks release until proof is attached */}
              {dDetailRecord.status === 'Approved' && !isPayroll && !dDetailRecord.has_attachment && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <Paperclip size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Proof of Payment Required</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-0.5">
                      A bank transfer slip, check voucher scan, or official receipt must be attached before this disbursement can be released.
                      Use the <strong>Attach Proof</strong> button in the Supporting Documents section below.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{dDetailRecord.payee}</p>
                  <p className="text-xs text-muted">{isPayroll ? dDetailRecord.payroll_batch_number : dDetailRecord.invoice_number}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${SOURCE_BADGE_STYLES[sourceType]}`}>
                    {SOURCE_TYPES[sourceType].label}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${DISBURSEMENT_STATUS_STYLES[dDetailRecord.status]}`}>{dDetailRecord.status}</span>
                </div>
              </div>
              <div className="rounded-lg border border-border divide-y divide-border">
                {isPayroll ? (
                  <div className="px-3 py-2">
                    <DetailRow label="Voucher No." value={dDetailRecord.voucher_number} />
                    <DetailRow label="HR Batch No." value={dDetailRecord.payroll_batch_number} />
                    <DetailRow label="Requesting Department" value={dDetailRecord.department_name} />
                    <DetailRow
                      label="Linked Budget"
                      value={
                        dDetailRecord.active_budget?.exists ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-ink">{dDetailRecord.active_budget.budget_name}</span>
                            <span className="text-xs text-muted">({formatCurrency(dDetailRecord.active_budget.remaining_amount)} left)</span>
                          </span>
                        ) : (
                          <span className="font-semibold text-rose-600 dark:text-rose-400">No active budget</span>
                        )
                      }
                    />
                    <DetailRow label="Pay Period" value={dDetailRecord.pay_period_start && dDetailRecord.pay_period_end ? `${formatDate(dDetailRecord.pay_period_start)} – ${formatDate(dDetailRecord.pay_period_end)}` : '—'} />
                    <DetailRow label="Employees Covered" value={dDetailRecord.employee_count} />
                    <DetailRow label="Payment Date" value={formatDate(dDetailRecord.payment_date)} />
                    <DetailRow label="Amount Paid" value={formatCurrency(dDetailRecord.amount_paid)} />
                    <DetailRow label="Currency" value={dDetailRecord.currency} />
                    <DetailRow label="Payment Method" value={dDetailRecord.payment_method} />
                    <DetailRow label="Cash Account" value={dDetailRecord.cash_account_name} />
                    <DetailRow label="HR Reference No." value={dDetailRecord.reference_number} />
                  </div>
                ) : (
                  <div className="px-3 py-2">
                    <DetailRow label="Department" value={dDetailRecord.department_name} />
                    <DetailRow label="Payment Date" value={formatDate(dDetailRecord.payment_date)} />
                    <DetailRow label="Amount Paid" value={formatCurrency(dDetailRecord.amount_paid)} />
                    <DetailRow label="Payment Method" value={dDetailRecord.payment_method} />
                    <DetailRow label="Cash Account" value={dDetailRecord.cash_account_name} />
                    <DetailRow label="Reference No." value={dDetailRecord.reference_number} />
                  </div>
                )}
                <div className="px-3 py-2">
                  <DetailRow label="Approved by" value={dDetailRecord.approved_by_name} />
                  <DetailRow label="Approved at" value={formatDateTime(dDetailRecord.approved_at)} />
                  <DetailRow label="Released by" value={dDetailRecord.released_by_name} />
                </div>
                <div className="px-3 py-2">
                  <DetailRow label="Created at" value={formatDateTime(dDetailRecord.created_at)} />
                  <DetailRow label="Updated at" value={formatDateTime(dDetailRecord.updated_at)} />
                  {dDetailRecord.is_archived && (
                    <DetailRow label="Archived at" value={formatDateTime(dDetailRecord.archived_at)} />
                  )}
                </div>
              </div>

              {/* Proof of payment section — AP-only */}
              {!isPayroll && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-bg px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <FileText size={15} className={dDetailRecord.has_attachment ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'} />
                    <span className="text-sm text-ink">
                      {dDetailRecord.has_attachment ? 'Proof of payment attached' : 'No proof of payment attached'}
                    </span>
                  </div>
                  {canManagePayments && (
                    <button
                      type="button"
                      onClick={() => { closeDisbursementDetail(); setProofTarget(dDetailRecord) }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-bg text-ink shadow-sm transition-all duration-150 active:scale-95"
                    >
                      <Paperclip size={13} />
                      {dDetailRecord.has_attachment ? 'View / Upload' : 'Attach Proof'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </Modal>

      {/* ---- Reject confirmation modal ---- */}
      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Disbursement"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRejectTarget(null)} disabled={rejectSubmitting}>Cancel</Button>
            <button
              type="button"
              onClick={confirmReject}
              disabled={rejectSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {rejectSubmitting ? 'Rejecting…' : 'Confirm Reject'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">
            Reject disbursement for <span className="font-semibold">{rejectTarget?.payee}</span>?
          </p>
          <div>
            <label className={LABEL}>Reason <span className="text-muted font-normal">(optional)</span></label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason…"
              className={`${INPUT} h-auto py-2 resize-none`}
              style={INPUT_TEXT_STYLE}
            />
          </div>
        </div>
      </Modal>

      {/* ---- Disbursement Proof Modal ---- */}
      <DisbursementProofModal
        open={!!proofTarget}
        onClose={() => setProofTarget(null)}
        disbursement={proofTarget}
        fetchHistory={fetchProofHistory}
        onUpload={uploadProof}
        onView={viewProof}
        onUploaded={() => {}}
        canManage={canManagePayments}
      />

      {/* ---- Disbursement Print & BIR 2307 Modal ---- */}
      <DisbursementPrintModal
        open={!!printTarget}
        onClose={() => setPrintTarget(null)}
        disbursementId={printTarget?.disbursement_id || printTarget?.id}
      />
    </div>
  )
}
