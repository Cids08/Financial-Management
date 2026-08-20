import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Plus, Pencil, Archive, RotateCcw, Send, CheckCircle2, Clock3, Info, Printer,
  PiggyBank, TrendingDown, Building2, XCircle, Clock, AlertTriangle, ListChecks, Lock,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { usePermissions } from '../context/PermissionsContext'
import { hasPermission } from '../utils/permissions'

/* ---------------------------------------------------------------------- */
/* Shared lookups                                                          */
/* ---------------------------------------------------------------------- */

const AP_RECORDS = [
  { ap_id: 1, invoice_number: 'SUP-INV-3301', supplier_name: 'Northgate Supplies Inc.' },
  { ap_id: 2, invoice_number: 'SUP-INV-3312', supplier_name: 'Pinnacle Freight Co.' },
  { ap_id: 3, invoice_number: 'SUP-INV-3325', supplier_name: 'Coastal Steel Traders' },
  { ap_id: 4, invoice_number: 'SUP-INV-3298', supplier_name: 'Alliance Fuel Depot' },
  { ap_id: 5, invoice_number: 'SUP-INV-3270', supplier_name: 'Sunrise Office Depot' },
]
const DEPARTMENTS = [
  { department_id: 1, department_name: 'Finance' },
  { department_id: 2, department_name: 'Operations' },
  { department_id: 3, department_name: 'Sales & Marketing' },
  { department_id: 4, department_name: 'IT' },
  { department_id: 5, department_name: 'Human Resources' },
]
const CASH_ACCOUNTS = [
  { cash_account_id: 1, account_name: 'BDO Operating Account' },
  { cash_account_id: 2, account_name: 'BPI Payroll Account' },
  { cash_account_id: 3, account_name: 'Metrobank Reserve Fund' },
  { cash_account_id: 4, account_name: 'Head Office Petty Cash' },
]
const USERS = [
  { user_id: 1, first_name: 'Ana', last_name: 'Reyes' },
  { user_id: 2, first_name: 'Marco', last_name: 'Santos' },
  { user_id: 3, first_name: 'Liza', last_name: 'Fernandez' },
]
const EXPENSE_CATEGORIES = [
  { expense_category_id: 1, category_name: 'Logistics & Freight' },
  { expense_category_id: 2, category_name: 'Advertising & Promotions' },
  { expense_category_id: 3, category_name: 'Software & Subscriptions' },
  { expense_category_id: 4, category_name: 'Travel' },
  { expense_category_id: 5, category_name: 'Office Supplies' },
  { expense_category_id: 6, category_name: 'Recruitment' },
]

const apInfo = (id) => AP_RECORDS.find((a) => a.ap_id === Number(id))
const deptName = (id) => DEPARTMENTS.find((d) => d.department_id === Number(id))?.department_name || 'Unknown'
const accountName = (id) => CASH_ACCOUNTS.find((a) => a.cash_account_id === Number(id))?.account_name || 'Unknown'
const categoryName = (id) => EXPENSE_CATEGORIES.find((c) => c.expense_category_id === Number(id))?.category_name || 'Uncategorized'
const userName = (id) => {
  const u = USERS.find((u) => u.user_id === Number(id))
  return u ? `${u.first_name} ${u.last_name}` : '—'
}
// The user currently signed in — used to auto-stamp who created/approved a record
// instead of asking for it on every form.
const CURRENT_USER_ID = 1

/* ---------------------------------------------------------------------- */
/* Dummy data                                                              */
/* ---------------------------------------------------------------------- */

const initialDisbursements = [
  { disbursement_id: 1, ap_id: 1, department_id: 2, cash_account_id: 1, payee: 'Northgate Supplies Inc.', payment_date: '2026-07-18', amount_paid: 98000, payment_method: 'Bank Transfer', reference_number: 'REF-DIS-001', status: 'Released', released_by: 1, approved_by: 3, approved_at: '2026-07-17T09:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-16T10:00:00', updated_at: '2026-07-18T14:00:00' },
  { disbursement_id: 2, ap_id: 2, department_id: 2, cash_account_id: 1, payee: 'Pinnacle Freight Co.', payment_date: '2026-07-22', amount_paid: 20000, payment_method: 'Check', reference_number: 'REF-DIS-002', status: 'Approved', released_by: null, approved_by: 3, approved_at: '2026-07-21T11:30:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-20T08:00:00', updated_at: '2026-07-21T11:30:00' },
  { disbursement_id: 3, ap_id: 3, department_id: 2, cash_account_id: 2, payee: 'Coastal Steel Traders', payment_date: '', amount_paid: 132000, payment_method: 'Bank Transfer', reference_number: 'REF-DIS-003', status: 'Pending', released_by: null, approved_by: null, approved_at: null, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-19T09:15:00', updated_at: '2026-07-19T09:15:00' },
  { disbursement_id: 4, ap_id: 4, department_id: 4, cash_account_id: 1, payee: 'Alliance Fuel Depot', payment_date: '2026-06-19', amount_paid: 76000, payment_method: 'Bank Transfer', reference_number: 'REF-DIS-004', status: 'Released', released_by: 2, approved_by: 3, approved_at: '2026-06-18T10:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-06-17T13:00:00', updated_at: '2026-06-19T15:30:00' },
  { disbursement_id: 5, ap_id: 5, department_id: 5, cash_account_id: 4, payee: 'Sunrise Office Depot', payment_date: '2026-05-10', amount_paid: 21000, payment_method: 'Cash', reference_number: 'REF-DIS-005', status: 'Rejected', released_by: null, approved_by: null, approved_at: null, is_archived: true, archived_at: '2026-07-26T09:00:00', archived_by: 1, created_at: '2026-05-08T09:00:00', updated_at: '2026-07-26T09:00:00' },
]

const initialBudgets = [
  { budget_id: 1, department_id: 2, fiscal_year: 2026, allocated_amount: 1500000, remaining_amount: 620000, status: 'Active', approval_status: 'Approved', remarks: 'Includes logistics contingency', created_by: 1, approved_by: 3, approved_at: '2026-01-05T09:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-01-02T09:00:00', updated_at: '2026-07-20T10:00:00' },
  { budget_id: 2, department_id: 3, fiscal_year: 2026, allocated_amount: 800000, remaining_amount: 145000, status: 'Active', approval_status: 'Approved', remarks: 'Q3 campaign heavy spend', created_by: 1, approved_by: 3, approved_at: '2026-01-06T09:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-01-02T09:30:00', updated_at: '2026-07-18T14:00:00' },
  { budget_id: 3, department_id: 4, fiscal_year: 2026, allocated_amount: 650000, remaining_amount: 650000, status: 'Active', approval_status: 'Pending', remarks: '', created_by: 2, approved_by: null, approved_at: null, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-28T10:00:00', updated_at: '2026-07-28T10:00:00' },
  { budget_id: 4, department_id: 5, fiscal_year: 2026, allocated_amount: 300000, remaining_amount: 90000, status: 'Active', approval_status: 'Approved', remarks: 'Recruitment drive ongoing', created_by: 2, approved_by: 3, approved_at: '2026-01-08T09:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-01-03T11:00:00', updated_at: '2026-07-05T13:00:00' },
  { budget_id: 5, department_id: 1, fiscal_year: 2025, allocated_amount: 500000, remaining_amount: 0, status: 'Closed', approval_status: 'Approved', remarks: 'FY2025 closed out', created_by: 1, approved_by: 3, approved_at: '2025-01-05T09:00:00', is_archived: true, archived_at: '2026-01-15T09:00:00', archived_by: 1, created_at: '2025-01-02T09:00:00', updated_at: '2026-01-15T09:00:00' },
]

// Expense breakdown per budget — "where did they use the money".
// Real data will come from GET /api/expenses?budget_id={id} once the
// backend endpoint is wired in (see the note at the bottom of this file).
const initialExpenses = [
  { expense_id: 1, budget_id: 1, expense_category_id: 1, description: 'Q2 freight consolidation — Cebu route', expense_amount: 310000, expense_date: '2026-04-12', status: 'Approved' },
  { expense_id: 2, budget_id: 1, expense_category_id: 1, description: 'Warehouse forklift rental', expense_amount: 180000, expense_date: '2026-05-20', status: 'Approved' },
  { expense_id: 3, budget_id: 1, expense_category_id: 5, description: 'Site safety equipment restock', expense_amount: 390000, expense_date: '2026-06-30', status: 'Approved' },
  { expense_id: 4, budget_id: 2, expense_category_id: 2, description: 'Q3 digital ad campaign — Meta & Google', expense_amount: 420000, expense_date: '2026-07-02', status: 'Approved' },
  { expense_id: 5, budget_id: 2, expense_category_id: 3, description: 'CRM + email marketing subscription renewal', expense_amount: 95000, expense_date: '2026-06-15', status: 'Approved' },
  { expense_id: 6, budget_id: 2, expense_category_id: 4, description: 'Trade show travel — Cebu Business Expo', expense_amount: 140000, expense_date: '2026-07-19', status: 'Approved' },
  { expense_id: 7, budget_id: 4, expense_category_id: 6, description: 'Job board postings & agency fees', expense_amount: 150000, expense_date: '2026-03-10', status: 'Approved' },
  { expense_id: 8, budget_id: 4, expense_category_id: 4, description: 'Candidate interview travel reimbursement', expense_amount: 60000, expense_date: '2026-05-22', status: 'Approved' },
]

/* ---------------------------------------------------------------------- */
/* Config                                                                   */
/* ---------------------------------------------------------------------- */

const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'GCash']
const DISBURSEMENT_STATUS_OPTIONS = ['Pending', 'Approved', 'Released', 'Rejected']
const BUDGET_STATUS_OPTIONS = ['Active', 'Closed']

const EMPTY_DISBURSEMENT_FORM = { ap_id: AP_RECORDS[0].ap_id, department_id: DEPARTMENTS[0].department_id, cash_account_id: CASH_ACCOUNTS[0].cash_account_id, payee: '', payment_date: '', amount_paid: '', payment_method: 'Bank Transfer', reference_number: '', status: 'Pending' }
const EMPTY_BUDGET_FORM = { department_id: DEPARTMENTS[0].department_id, fiscal_year: new Date().getFullYear(), allocated_amount: '', remarks: '' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_LOCKED = `w-full h-9 px-3 rounded-lg border border-border bg-bg/60 text-sm text-muted
  cursor-not-allowed select-none flex items-center`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const DISBURSEMENT_STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Approved: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Released: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}
const BUDGET_STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}
const APPROVAL_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Approved: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}
const APPROVAL_ICONS = { Pending: Clock, Approved: CheckCircle2, Rejected: XCircle }

// Wording per tab — pulled out so the header subtitle and the single-tab
// fallback both read the exact same copy, never two slightly-different
// descriptions of the same section.
const TAB_COPY = {
  payments: {
    label: 'Payments',
    subtitle: 'Track outgoing payments released against supplier bills.',
    addLabel: 'Add Disbursement',
  },
  budgets: {
    label: 'Budget Allocations',
    subtitle: 'Allocate, approve, and track department budgets, including where funds were spent.',
    addLabel: 'Add Budget',
  },
}

function usedPct(allocated, remaining) {
  if (!allocated) return 0
  return Math.min(100, Math.round(((allocated - remaining) / allocated) * 100))
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-ink text-right">{value ?? '—'}</span>
    </div>
  )
}

function ApprovalBadge({ status }) {
  const Icon = APPROVAL_ICONS[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${APPROVAL_STYLES[status]}`}>
      <Icon size={12} />
      {status}
    </span>
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
/* Main module — merged Disbursements (payments + budget allocations)      */
/* ---------------------------------------------------------------------- */

export default function Disbursements({ title = 'Disbursements', crumbs = ['Financial Transactions', 'Disbursements'] }) {
  const { permissions, loading: permsLoading } = usePermissions()

  // Budget Management is ONE permission group on the backend
  // (disbursements.view/manage/approve — see RolesAndPermissionsSeeder,
  // the canonical source of truth) even though the UI splits it into two
  // tabs. There is no separate budgets.* permission; both tabs share the
  // same disbursements.* checks.
  const canViewPayments = hasPermission(permissions, 'disbursements.view')
  const canManagePayments = hasPermission(permissions, 'disbursements.manage')
  const canViewBudgets = hasPermission(permissions, 'disbursements.view')
  const canManageBudgets = hasPermission(permissions, 'disbursements.manage')
  const canApproveBudgets = hasPermission(permissions, 'disbursements.approve')
  const canViewExpenseBreakdown = hasPermission(permissions, 'expenses.view')

  const availableTabs = useMemo(
    () => ['payments', 'budgets'].filter((t) => (t === 'payments' ? canViewPayments : canViewBudgets)),
    [canViewPayments, canViewBudgets]
  )

  const [activeTab, setActiveTab] = useState('payments')

  // If the current tab isn't actually visible to this user (or becomes
  // unavailable once permissions load), fall back to whichever tab is —
  // never render an "Add Budget" button to someone who can't see budgets.
  useEffect(() => {
    if (permsLoading) return
    if (!availableTabs.includes(activeTab) && availableTabs.length > 0) {
      setActiveTab(availableTabs[0])
    }
  }, [permsLoading, availableTabs, activeTab])

  /* ---- Payments (formerly the standalone Disbursements page) ---- */
  const [disbursements, setDisbursements] = useState(initialDisbursements)
  const [dSearch, setDSearch] = useState('')
  const [dStatusFilter, setDStatusFilter] = useState('all')
  const [dShowArchived, setDShowArchived] = useState(false)
  const [dModalMode, setDModalMode] = useState(null)
  const [dForm, setDForm] = useState(EMPTY_DISBURSEMENT_FORM)
  const [dFormError, setDFormError] = useState('')
  const [dDetailRecord, setDDetailRecord] = useState(null)

  const filteredDisbursements = useMemo(() => {
    return disbursements.filter((d) => {
      if (!dShowArchived && d.is_archived) return false
      if (dShowArchived && !d.is_archived) return false
      if (dStatusFilter !== 'all' && d.status !== dStatusFilter) return false
      const q = dSearch.toLowerCase()
      if (dSearch && !d.payee.toLowerCase().includes(q) && !d.reference_number.toLowerCase().includes(q)) return false
      return true
    })
  }, [disbursements, dSearch, dStatusFilter, dShowArchived])

  const dStats = useMemo(() => {
    const active = disbursements.filter((d) => !d.is_archived)
    return {
      total: active.length,
      released: active.filter((d) => d.status === 'Released').reduce((sum, d) => sum + d.amount_paid, 0),
      pending: active.filter((d) => d.status === 'Pending').length,
      archived: disbursements.filter((d) => d.is_archived).length,
    }
  }, [disbursements])

  const toggleDisbursementArchive = (id) => {
    if (!canManagePayments) return
    setDisbursements((prev) => prev.map((d) => {
      if (d.disbursement_id !== id) return d
      const nextArchived = !d.is_archived
      return { ...d, is_archived: nextArchived, archived_at: nextArchived ? new Date().toISOString() : null, archived_by: nextArchived ? CURRENT_USER_ID : null, updated_at: new Date().toISOString() }
    }))
  }

  const openAddDisbursement = () => { setDForm(EMPTY_DISBURSEMENT_FORM); setDFormError(''); setDModalMode('add') }
  const openEditDisbursement = (d) => {
    if (!canManagePayments) return
    setDForm({ ap_id: d.ap_id, department_id: d.department_id, cash_account_id: d.cash_account_id, payee: d.payee, payment_date: d.payment_date, amount_paid: d.amount_paid, payment_method: d.payment_method, reference_number: d.reference_number, status: d.status })
    setDFormError('')
    setDModalMode(d)
  }
  const closeDisbursementModal = () => { setDModalMode(null); setDFormError('') }
  const openDisbursementDetail = (d) => setDDetailRecord(d)
  const closeDisbursementDetail = () => setDDetailRecord(null)

  const handlePrintDisbursement = (d) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const info = apInfo(d.ap_id)
    const rows = [
      ['Payee', d.payee],
      ['Related Bill', info?.invoice_number || '—'],
      ['Department', deptName(d.department_id)],
      ['Payment Date', formatDate(d.payment_date)],
      ['Amount Paid', formatCurrency(d.amount_paid)],
      ['Payment Method', d.payment_method],
      ['Cash Account', accountName(d.cash_account_id)],
      ['Reference No.', d.reference_number || '—'],
      ['Approved By', userName(d.approved_by)],
      ['Status', d.status],
    ]
    win.document.write(`
      <html>
        <head>
          <title>Disbursement Voucher ${d.reference_number}</title>
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
            <div><h1>Disbursement Voucher</h1><p>${d.payee}</p></div>
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

  const handleDisbursementSubmit = (e) => {
    e.preventDefault()
    if (!dForm.payee.trim() || !dForm.amount_paid) {
      setDFormError('Payee and amount are required.')
      return
    }
    const payload = { ...dForm, ap_id: Number(dForm.ap_id), department_id: Number(dForm.department_id), cash_account_id: Number(dForm.cash_account_id), amount_paid: Number(dForm.amount_paid) || 0 }
    const now = new Date().toISOString()
    if (dModalMode === 'add') {
      const nextId = Math.max(0, ...disbursements.map((d) => d.disbursement_id)) + 1
      setDisbursements((prev) => [...prev, { disbursement_id: nextId, ...payload, released_by: null, approved_by: null, approved_at: null, is_archived: false, archived_at: null, archived_by: null, created_at: now, updated_at: now }])
    } else if (dModalMode) {
      const editingId = dModalMode.disbursement_id
      setDisbursements((prev) => prev.map((d) => (d.disbursement_id === editingId ? { ...d, ...payload, updated_at: now } : d)))
    }
    closeDisbursementModal()
  }

  const disbursementStatCards = [
    { key: 'total', label: 'Total Payments', value: dStats.total, icon: Send, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: dStatusFilter === 'all' && !dShowArchived, onClick: () => { setDStatusFilter('all'); setDShowArchived(false) } },
    { key: 'released', label: 'Released Amount', value: formatCurrency(dStats.released), icon: CheckCircle2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: dStatusFilter === 'Released' && !dShowArchived, onClick: () => { setDStatusFilter('Released'); setDShowArchived(false) } },
    { key: 'pending', label: 'Pending', value: dStats.pending, icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: dStatusFilter === 'Pending' && !dShowArchived, onClick: () => { setDStatusFilter('Pending'); setDShowArchived(false) } },
    { key: 'archived', label: 'Archived', value: dStats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: dShowArchived, onClick: () => setDShowArchived(true) },
  ]

  const isDisbursementModalOpen = dModalMode !== null
  const isEditingDisbursement = dModalMode !== null && dModalMode !== 'add'

  /* ---- Budget Allocations (formerly the standalone Budgets page) ---- */
  const [budgets, setBudgets] = useState(initialBudgets)
  const [expenses] = useState(initialExpenses)
  const [bSearch, setBSearch] = useState('')
  const [bStatusFilter, setBStatusFilter] = useState('all')
  const [approvalFilter, setApprovalFilter] = useState('all')
  const [bShowArchived, setBShowArchived] = useState(false)
  const [bModalMode, setBModalMode] = useState(null)
  const [bForm, setBForm] = useState(EMPTY_BUDGET_FORM)
  const [bFormError, setBFormError] = useState('')
  const [bDetailRecord, setBDetailRecord] = useState(null)
  const [breakdownBudget, setBreakdownBudget] = useState(null)

  const filteredBudgets = useMemo(() => {
    return budgets.filter((b) => {
      if (!bShowArchived && b.is_archived) return false
      if (bShowArchived && !b.is_archived) return false
      if (bStatusFilter !== 'all' && b.status !== bStatusFilter) return false
      if (approvalFilter !== 'all' && b.approval_status !== approvalFilter) return false
      const q = bSearch.toLowerCase()
      if (bSearch && !deptName(b.department_id).toLowerCase().includes(q) && !String(b.fiscal_year).includes(q)) return false
      return true
    })
  }, [budgets, bSearch, bStatusFilter, approvalFilter, bShowArchived])

  const bStats = useMemo(() => {
    const active = budgets.filter((b) => !b.is_archived)
    return {
      total: active.length,
      allocated: active.reduce((sum, b) => sum + b.allocated_amount, 0),
      remaining: active.reduce((sum, b) => sum + b.remaining_amount, 0),
      pending: active.filter((b) => b.approval_status === 'Pending').length,
      archived: budgets.filter((b) => b.is_archived).length,
    }
  }, [budgets])

  const toggleBudgetArchive = (id) => {
    if (!canManageBudgets) return
    setBudgets((prev) => prev.map((b) => {
      if (b.budget_id !== id) return b
      const nextArchived = !b.is_archived
      return { ...b, is_archived: nextArchived, archived_at: nextArchived ? new Date().toISOString() : null, archived_by: nextArchived ? CURRENT_USER_ID : null, updated_at: new Date().toISOString() }
    }))
  }

  const setApproval = (id, decision) => {
    if (!canApproveBudgets) return
    const now = new Date().toISOString()
    setBudgets((prev) => prev.map((b) => (
      b.budget_id === id
        ? { ...b, approval_status: decision, approved_by: CURRENT_USER_ID, approved_at: now, updated_at: now }
        : b
    )))
    setBDetailRecord((prev) => (prev && prev.budget_id === id ? { ...prev, approval_status: decision, approved_by: CURRENT_USER_ID, approved_at: now } : prev))
  }

  const openAddBudget = () => { setBForm(EMPTY_BUDGET_FORM); setBFormError(''); setBModalMode('add') }
  const openEditBudget = (b) => {
    if (!canManageBudgets) return
    // Once a budget is Approved it's locked from editing entirely — that decision is final.
    // Before approval, only the allocated amount and remarks can change; department,
    // fiscal year, remaining amount, and status stay locked either way.
    if (b.approval_status === 'Approved') return
    setBForm({ department_id: b.department_id, fiscal_year: b.fiscal_year, allocated_amount: b.allocated_amount, remarks: b.remarks })
    setBFormError('')
    setBModalMode(b)
  }
  const closeBudgetModal = () => { setBModalMode(null); setBFormError('') }
  const openBudgetDetail = (b) => setBDetailRecord(b)
  const closeBudgetDetail = () => setBDetailRecord(null)
  const openBreakdown = (b) => {
    if (!canViewExpenseBreakdown) return
    // Always close the Budget Details modal first — Expense Breakdown can
    // be opened either from the table row (detail modal already closed)
    // or from inside the Budget Details modal's footer button. Closing it
    // here either way means only one modal is ever open at a time,
    // instead of stacking a second modal on top of the first.
    setBDetailRecord(null)
    setBreakdownBudget(b)
  }
  const closeBreakdown = () => setBreakdownBudget(null)

  const handlePrintBudget = (b) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Department', deptName(b.department_id)],
      ['Fiscal Year', b.fiscal_year],
      ['Allocated Amount', formatCurrency(b.allocated_amount)],
      ['Remaining Amount', formatCurrency(b.remaining_amount)],
      ['Utilization', `${usedPct(b.allocated_amount, b.remaining_amount)}%`],
      ['Approval Status', b.approval_status],
      ['Approved By', userName(b.approved_by)],
      ['Status', b.status],
      ...(b.remarks ? [['Remarks', b.remarks]] : []),
    ]
    win.document.write(`
      <html>
        <head>
          <title>Budget — ${deptName(b.department_id)} FY${b.fiscal_year}</title>
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
            <div><h1>Budget Report</h1><p>${deptName(b.department_id)} &middot; FY${b.fiscal_year}</p></div>
            <span class="status">${b.status}</span>
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

  const handleBudgetSubmit = (e) => {
    e.preventDefault()
    if (!bForm.fiscal_year || !bForm.allocated_amount) {
      setBFormError('Fiscal year and allocated amount are required.')
      return
    }
    const allocated = Number(bForm.allocated_amount) || 0
    const now = new Date().toISOString()

    if (bModalMode === 'add') {
      const nextId = Math.max(0, ...budgets.map((b) => b.budget_id)) + 1
      setBudgets((prev) => [...prev, {
        budget_id: nextId,
        department_id: Number(bForm.department_id),
        fiscal_year: Number(bForm.fiscal_year),
        allocated_amount: allocated,
        remaining_amount: allocated,
        status: 'Active',
        approval_status: 'Pending',
        remarks: bForm.remarks,
        created_by: CURRENT_USER_ID,
        approved_by: null,
        approved_at: null,
        is_archived: false,
        archived_at: null,
        archived_by: null,
        created_at: now,
        updated_at: now,
      }])
    } else if (bModalMode) {
      const editingId = bModalMode.budget_id
      setBudgets((prev) => prev.map((b) => (
        b.budget_id === editingId
          ? { ...b, allocated_amount: allocated, remarks: bForm.remarks, updated_at: now }
          : b
      )))
    }
    closeBudgetModal()
  }

  const budgetStatCards = [
    { key: 'total', label: 'Total Budgets', value: bStats.total, icon: PiggyBank, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: bStatusFilter === 'all' && approvalFilter === 'all' && !bShowArchived, onClick: () => { setBStatusFilter('all'); setApprovalFilter('all'); setBShowArchived(false) } },
    { key: 'pending', label: 'Pending Approval', value: bStats.pending, icon: Clock, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: approvalFilter === 'Pending', onClick: () => { setBShowArchived(false); setApprovalFilter('Pending') } },
    { key: 'allocated', label: 'Total Allocated', value: formatCurrency(bStats.allocated), icon: Building2, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => { setBStatusFilter('all'); setApprovalFilter('all'); setBShowArchived(false) } },
    { key: 'remaining', label: 'Total Remaining', value: formatCurrency(bStats.remaining), icon: TrendingDown, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => { setBStatusFilter('all'); setApprovalFilter('all'); setBShowArchived(false) } },
    { key: 'archived', label: 'Archived', value: bStats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: bShowArchived, onClick: () => setBShowArchived(true) },
  ]

  const isBudgetModalOpen = bModalMode !== null
  const isEditingBudget = bModalMode !== null && bModalMode !== 'add'
  const breakdownExpenses = useMemo(
    () => (breakdownBudget ? expenses.filter((e) => e.budget_id === breakdownBudget.budget_id) : []),
    [breakdownBudget, expenses]
  )
  const breakdownTotal = breakdownExpenses.reduce((sum, e) => sum + e.expense_amount, 0)
  // Category totals for the bar chart, largest spend first.
  const breakdownByCategory = useMemo(() => {
    const totals = new Map()
    for (const e of breakdownExpenses) {
      const key = e.expense_category_id
      totals.set(key, (totals.get(key) || 0) + e.expense_amount)
    }
    return [...totals.entries()]
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [breakdownExpenses])
  const topCategory = breakdownByCategory[0]

  const breakdownPanelRef = useRef(null)
  useEffect(() => {
    if (breakdownBudget) {
      breakdownPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [breakdownBudget])

  /* ---------------------------------------------------------------------- */

  if (!permsLoading && availableTabs.length === 0) {
    return (
      <div className="space-y-5 animate-fadeIn">
        <Breadcrumb items={crumbs} />
        <NoAccessState label="Disbursements or Budget Allocations" />
      </div>
    )
  }

  const showTabSwitcher = availableTabs.length > 1
  const copy = TAB_COPY[activeTab] ?? TAB_COPY.payments
  const canAddOnActiveTab = activeTab === 'payments' ? canManagePayments : canManageBudgets

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">{copy.subtitle}</p>
        </div>
        {canAddOnActiveTab && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={activeTab === 'payments' ? openAddDisbursement : openAddBudget}
          >
            {copy.addLabel}
          </Button>
        )}
      </div>

      {/* Tab switcher — only rendered when the user can actually see both */}
      {showTabSwitcher && (
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          {availableTabs.map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ${
                activeTab === tabId ? 'bg-primary text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {TAB_COPY[tabId].label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'payments' && canViewPayments && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {disbursementStatCards.map((card) => {
              const Icon = card.icon
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={card.onClick}
                  className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left cursor-pointer
                    transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                    ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                    <Icon size={18} className={card.iconColor} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted">{card.label}</p>
                    <p className="text-lg font-bold text-ink">{card.value}</p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input type="text" value={dSearch} onChange={(e) => setDSearch(e.target.value)} placeholder="Search by payee or reference..." className={`${INPUT} pl-9`} />
            </div>
            <select value={dStatusFilter} onChange={(e) => setDStatusFilter(e.target.value)} className={INPUT}>
              <option value="all">All Statuses</option>
              {DISBURSEMENT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
        <Button
          variant={showArchived ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => setShowArchived((prev) => !prev)}
          className="shrink-0 whitespace-nowrap"
        >
          Show Archived
        </Button>
          </div>

          <div className={PANEL}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Payee</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Bill / Department</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Payment Date</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDisbursements.map((d) => {
                    const info = apInfo(d.ap_id)
                    return (
                      <tr key={d.disbursement_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-ink">{d.payee}</p>
                          <p className="text-xs text-muted">{d.reference_number} &middot; {accountName(d.cash_account_id)}</p>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <p className="text-ink">{info?.invoice_number}</p>
                          <p className="text-xs text-muted">{deptName(d.department_id)}</p>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(d.payment_date)}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(d.amount_paid)}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${DISBURSEMENT_STATUS_STYLES[d.status]}`}>{d.status}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip label="View full record" align="start">
                              <button type="button" onClick={() => openDisbursementDetail(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                <Info size={15} />
                              </button>
                            </Tooltip>
                            <Tooltip label="Print voucher" align="start">
                              <button type="button" onClick={() => handlePrintDisbursement(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                <Printer size={15} />
                              </button>
                            </Tooltip>
                            {canManagePayments && (
                              <>
                                <Tooltip label="Edit disbursement" align="start">
                                  <button type="button" onClick={() => openEditDisbursement(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                    <Pencil size={15} />
                                  </button>
                                </Tooltip>
                                <Tooltip label={d.is_archived ? 'Restore disbursement' : 'Archive disbursement'} align="end">
                                  <button type="button" onClick={() => toggleDisbursementArchive(d.disbursement_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                    {d.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                                  </button>
                                </Tooltip>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredDisbursements.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No disbursements match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'budgets' && canViewBudgets && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {budgetStatCards.map((card) => {
              const Icon = card.icon
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={card.onClick}
                  className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left cursor-pointer
                    transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                    ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                    <Icon size={18} className={card.iconColor} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted truncate" title={card.label}>{card.label}</p>
                    <p className="text-lg font-bold text-ink truncate" title={String(card.value)}>{card.value}</p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input type="text" value={bSearch} onChange={(e) => setBSearch(e.target.value)} placeholder="Search by department or fiscal year..." className={`${INPUT} pl-9`} />
            </div>
            <select value={bStatusFilter} onChange={(e) => setBStatusFilter(e.target.value)} className={INPUT}>
              <option value="all">All Statuses</option>
              {BUDGET_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} className={INPUT}>
              <option value="all">All Approval States</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={bShowArchived} onChange={(e) => setBShowArchived(e.target.checked)} className="rounded border-border accent-primary" />
              Show archived
            </label>
          </div>

          <div className={PANEL}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Department</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Fiscal Year</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Allocated / Remaining</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Utilization</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Approval</th>
                    <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBudgets.map((b) => {
                    const pct = usedPct(b.allocated_amount, b.remaining_amount)
                    const isPending = b.approval_status === 'Pending'
                    const hasExpenses = expenses.some((e) => e.budget_id === b.budget_id)
                    return (
                      <tr key={b.budget_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-ink">{deptName(b.department_id)}</p>
                          {b.remarks && <p className="text-xs text-muted truncate max-w-55">{b.remarks}</p>}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-ink">{b.fiscal_year}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <p className="text-ink tabular-nums">{formatCurrency(b.allocated_amount)}</p>
                          <p className="text-xs text-muted tabular-nums">Left: {formatCurrency(b.remaining_amount)}</p>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-bg overflow-hidden">
                              <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted tabular-nums">{pct}%</span>
                            {pct >= 90 && <Tooltip label="Nearing budget limit"><AlertTriangle size={13} className="text-red-500" /></Tooltip>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${BUDGET_STATUS_STYLES[b.status]}`}>{b.status}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap"><ApprovalBadge status={b.approval_status} /></td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isPending && canApproveBudgets && (
                              <>
                                <Tooltip label="Approve budget" align="start">
                                  <button type="button" onClick={() => setApproval(b.budget_id, 'Approved')} className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors duration-150">
                                    <CheckCircle2 size={15} />
                                  </button>
                                </Tooltip>
                                <Tooltip label="Reject budget" align="start">
                                  <button type="button" onClick={() => setApproval(b.budget_id, 'Rejected')} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-150">
                                    <XCircle size={15} />
                                  </button>
                                </Tooltip>
                              </>
                            )}
                            {canViewExpenseBreakdown && (
                              <Tooltip label={hasExpenses ? 'View expense breakdown' : 'No expenses recorded yet'} align="start">
                                <button
                                  type="button"
                                  onClick={() => hasExpenses && openBreakdown(b)}
                                  disabled={!hasExpenses}
                                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 ${
                                    hasExpenses ? 'text-muted hover:bg-bg hover:text-ink' : 'text-border cursor-not-allowed'
                                  }`}
                                >
                                  <ListChecks size={15} />
                                </button>
                              </Tooltip>
                            )}
                            <Tooltip label="View full record" align="start">
                              <button type="button" onClick={() => openBudgetDetail(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                <Info size={15} />
                              </button>
                            </Tooltip>
                            <Tooltip label="Print budget report" align="start">
                              <button type="button" onClick={() => handlePrintBudget(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                <Printer size={15} />
                              </button>
                            </Tooltip>
                            {canManageBudgets && b.approval_status !== 'Approved' && (
                              <Tooltip label="Edit budget" align="start">
                                <button
                                  type="button"
                                  onClick={() => openEditBudget(b)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                                >
                                  <Pencil size={15} />
                                </button>
                              </Tooltip>
                            )}
                            {canManageBudgets && (
                              <Tooltip label={b.is_archived ? 'Restore budget' : 'Archive budget'} align="end">
                                <button type="button" onClick={() => toggleBudgetArchive(b.budget_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                  {b.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredBudgets.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No budgets match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- Expense Breakdown — inline, not a modal, so it's visible
               immediately below the table instead of behind an extra click ---- */}
          {canViewExpenseBreakdown && (
            <div ref={breakdownPanelRef} className={`${PANEL} ${PANEL_PAD}`}>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
                  <ListChecks size={17} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">Expense Breakdown</p>
                  <p className="text-xs text-muted">
                    {breakdownBudget
                      ? `${deptName(breakdownBudget.department_id)} · FY${breakdownBudget.fiscal_year} — where the money went`
                      : 'Click the breakdown icon on any budget row to see it here.'}
                  </p>
                </div>
                {breakdownBudget && (
                  <button
                    type="button"
                    onClick={closeBreakdown}
                    className="ml-auto text-xs font-medium text-muted hover:text-ink transition-colors duration-150"
                  >
                    Clear
                  </button>
                )}
              </div>

              {!breakdownBudget ? (
                <div className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted">
                  No budget selected yet.
                </div>
              ) : breakdownExpenses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted">
                  No expenses recorded against this budget yet.
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted">Spent so far</p>
                      <p className="text-lg font-bold text-ink tabular-nums">{formatCurrency(breakdownTotal)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted">Allocated</p>
                      <p className="text-lg font-bold text-ink tabular-nums">{formatCurrency(breakdownBudget.allocated_amount)}</p>
                    </div>
                    <div className="rounded-lg border border-border p-3 col-span-2 sm:col-span-1">
                      <p className="text-xs text-muted truncate">Top category</p>
                      <p className="text-sm font-bold text-ink truncate">{topCategory ? categoryName(topCategory.categoryId) : '—'}</p>
                      {topCategory && <p className="text-xs text-muted tabular-nums">{formatCurrency(topCategory.amount)}</p>}
                    </div>
                  </div>

                  {/* Bar chart — spend by category */}
                  <div className="space-y-2">
                    {breakdownByCategory.map(({ categoryId, amount }) => {
                      const pct = breakdownTotal > 0 ? Math.round((amount / breakdownTotal) * 100) : 0
                      return (
                        <div key={categoryId}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-ink">{categoryName(categoryId)}</span>
                            <span className="text-muted tabular-nums">{formatCurrency(amount)} · {pct}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-bg overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Line items */}
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {breakdownExpenses.map((e) => (
                      <div key={e.expense_id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-ink truncate">{e.description}</p>
                          <p className="text-[11px] text-muted">{categoryName(e.expense_category_id)} &middot; {formatDate(e.expense_date)}</p>
                        </div>
                        <p className="text-xs font-semibold text-ink tabular-nums shrink-0">{formatCurrency(e.expense_amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ---- Disbursement Add/Edit modal ---- */}
      <Modal
        open={isDisbursementModalOpen}
        onClose={closeDisbursementModal}
        title={isEditingDisbursement ? 'Edit Disbursement' : 'Add Disbursement'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDisbursementModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleDisbursementSubmit}>{isEditingDisbursement ? 'Save Changes' : 'Add Disbursement'}</Button>
          </>
        }
      >
        <form onSubmit={handleDisbursementSubmit} className="space-y-4">
          {dFormError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{dFormError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Related Bill</label>
              <select value={dForm.ap_id} onChange={(e) => setDForm((f) => ({ ...f, ap_id: e.target.value }))} className={INPUT}>
                {AP_RECORDS.map((a) => <option key={a.ap_id} value={a.ap_id}>{a.invoice_number} — {a.supplier_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Department</label>
              <select value={dForm.department_id} onChange={(e) => setDForm((f) => ({ ...f, department_id: e.target.value }))} className={INPUT}>
                {DEPARTMENTS.map((dp) => <option key={dp.department_id} value={dp.department_id}>{dp.department_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Payee</label>
            <input type="text" value={dForm.payee} onChange={(e) => setDForm((f) => ({ ...f, payee: e.target.value }))} className={INPUT} placeholder="Northgate Supplies Inc." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Date</label>
              <input type="date" value={dForm.payment_date} onChange={(e) => setDForm((f) => ({ ...f, payment_date: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Amount Paid</label>
              <input type="number" value={dForm.amount_paid} onChange={(e) => setDForm((f) => ({ ...f, amount_paid: e.target.value }))} className={INPUT} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={dForm.payment_method} onChange={(e) => setDForm((f) => ({ ...f, payment_method: e.target.value }))} className={INPUT}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Cash Account</label>
              <select value={dForm.cash_account_id} onChange={(e) => setDForm((f) => ({ ...f, cash_account_id: e.target.value }))} className={INPUT}>
                {CASH_ACCOUNTS.map((a) => <option key={a.cash_account_id} value={a.cash_account_id}>{a.account_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Reference Number</label>
              <input type="text" value={dForm.reference_number} onChange={(e) => setDForm((f) => ({ ...f, reference_number: e.target.value }))} className={INPUT} placeholder="REF-DIS-001" />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={dForm.status} onChange={(e) => setDForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
                {DISBURSEMENT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {isEditingDisbursement && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <p className="text-xs font-medium text-muted mb-1">Record Info (read-only)</p>
              <DetailRow label="Approved by" value={userName(dModalMode.approved_by)} />
              <DetailRow label="Approved at" value={formatDateTime(dModalMode.approved_at)} />
              <DetailRow label="Released by" value={userName(dModalMode.released_by)} />
              <DetailRow label="Created at" value={formatDateTime(dModalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(dModalMode.updated_at)} />
              {dModalMode.is_archived && (
                <>
                  <DetailRow label="Archived by" value={userName(dModalMode.archived_by)} />
                  <DetailRow label="Archived at" value={formatDateTime(dModalMode.archived_at)} />
                </>
              )}
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
            {dDetailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrintDisbursement(dDetailRecord)}>Print Voucher</Button>}
          </>
        }
      >
        {dDetailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{dDetailRecord.payee}</p>
                <p className="text-xs text-muted">{apInfo(dDetailRecord.ap_id)?.invoice_number}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${DISBURSEMENT_STATUS_STYLES[dDetailRecord.status]}`}>{dDetailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Department" value={deptName(dDetailRecord.department_id)} />
                <DetailRow label="Payment Date" value={formatDate(dDetailRecord.payment_date)} />
                <DetailRow label="Amount Paid" value={formatCurrency(dDetailRecord.amount_paid)} />
                <DetailRow label="Payment Method" value={dDetailRecord.payment_method} />
                <DetailRow label="Cash Account" value={accountName(dDetailRecord.cash_account_id)} />
                <DetailRow label="Reference No." value={dDetailRecord.reference_number} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Approved by" value={userName(dDetailRecord.approved_by)} />
                <DetailRow label="Approved at" value={formatDateTime(dDetailRecord.approved_at)} />
                <DetailRow label="Released by" value={userName(dDetailRecord.released_by)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created at" value={formatDateTime(dDetailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(dDetailRecord.updated_at)} />
                <DetailRow label="Archived" value={dDetailRecord.is_archived ? 'Yes' : 'No'} />
                {dDetailRecord.is_archived && (
                  <>
                    <DetailRow label="Archived by" value={userName(dDetailRecord.archived_by)} />
                    <DetailRow label="Archived at" value={formatDateTime(dDetailRecord.archived_at)} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Budget Add/Edit modal ---- */}
      <Modal
        open={isBudgetModalOpen}
        onClose={closeBudgetModal}
        title={isEditingBudget ? 'Edit Budget' : 'Add Budget'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeBudgetModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleBudgetSubmit}>{isEditingBudget ? 'Save Changes' : 'Add Budget'}</Button>
          </>
        }
      >
        <form onSubmit={handleBudgetSubmit} className="space-y-4">
          {bFormError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{bFormError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Department</label>
              {isEditingBudget ? (
                <div className={INPUT_LOCKED}><span className="truncate">{deptName(bForm.department_id)}</span></div>
              ) : (
                <select value={bForm.department_id} onChange={(e) => setBForm((f) => ({ ...f, department_id: e.target.value }))} className={INPUT}>
                  {DEPARTMENTS.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={LABEL}>Fiscal Year</label>
              {isEditingBudget ? (
                <div className={INPUT_LOCKED}><span>{bForm.fiscal_year}</span></div>
              ) : (
                <input type="number" value={bForm.fiscal_year} onChange={(e) => setBForm((f) => ({ ...f, fiscal_year: e.target.value }))} className={INPUT} placeholder="2026" />
              )}
            </div>
          </div>

          <div>
            <label className={LABEL}>Allocated Amount</label>
            <input type="number" value={bForm.allocated_amount} onChange={(e) => setBForm((f) => ({ ...f, allocated_amount: e.target.value }))} className={INPUT} placeholder="0.00" />
          </div>

          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={bForm.remarks} onChange={(e) => setBForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} placeholder="Optional notes" />
          </div>

          {!isEditingBudget && (
            <p className="text-xs text-muted">New budgets start as <span className="font-medium text-ink">Pending</span> approval and become spendable once approved.</p>
          )}

          {isEditingBudget && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <DetailRow label="Remaining amount" value={formatCurrency(bModalMode.remaining_amount)} />
              <DetailRow label="Status" value={<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${BUDGET_STATUS_STYLES[bModalMode.status]}`}>{bModalMode.status}</span>} />
              <DetailRow label="Approval status" value={<ApprovalBadge status={bModalMode.approval_status} />} />
              <DetailRow label="Created by" value={userName(bModalMode.created_by)} />
              <DetailRow label="Approved by" value={userName(bModalMode.approved_by)} />
              <DetailRow label="Approved at" value={formatDateTime(bModalMode.approved_at)} />
              <DetailRow label="Created at" value={formatDateTime(bModalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(bModalMode.updated_at)} />
              {bModalMode.is_archived && (
                <>
                  <DetailRow label="Archived by" value={userName(bModalMode.archived_by)} />
                  <DetailRow label="Archived at" value={formatDateTime(bModalMode.archived_at)} />
                </>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* ---- Budget Detail modal ---- */}
      <Modal
        open={!!bDetailRecord}
        onClose={closeBudgetDetail}
        title="Budget Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeBudgetDetail}>Close</Button>
            {bDetailRecord && bDetailRecord.approval_status === 'Pending' && canApproveBudgets && (
              <>
                <Button variant="secondary" size="md" icon={XCircle} onClick={() => setApproval(bDetailRecord.budget_id, 'Rejected')}>Reject</Button>
                <Button variant="primary" size="md" icon={CheckCircle2} onClick={() => setApproval(bDetailRecord.budget_id, 'Approved')}>Approve</Button>
              </>
            )}
            {bDetailRecord && bDetailRecord.approval_status !== 'Pending' && (
              <>
                {canViewExpenseBreakdown && expenses.some((e) => e.budget_id === bDetailRecord.budget_id) && (
                  <Button variant="secondary" size="md" icon={ListChecks} onClick={() => openBreakdown(bDetailRecord)}>Expense Breakdown</Button>
                )}
                <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrintBudget(bDetailRecord)}>Print Report</Button>
              </>
            )}
          </>
        }
      >
        {bDetailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{deptName(bDetailRecord.department_id)}</p>
                <p className="text-xs text-muted">Fiscal Year {bDetailRecord.fiscal_year}</p>
              </div>
              <div className="flex items-center gap-2">
                <ApprovalBadge status={bDetailRecord.approval_status} />
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${BUDGET_STATUS_STYLES[bDetailRecord.status]}`}>{bDetailRecord.status}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Allocated Amount" value={formatCurrency(bDetailRecord.allocated_amount)} />
                <DetailRow label="Remaining Amount" value={formatCurrency(bDetailRecord.remaining_amount)} />
                <DetailRow label="Utilization" value={`${usedPct(bDetailRecord.allocated_amount, bDetailRecord.remaining_amount)}%`} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Remarks" value={bDetailRecord.remarks || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={userName(bDetailRecord.created_by)} />
                <DetailRow label="Approved by" value={userName(bDetailRecord.approved_by)} />
                <DetailRow label="Approved at" value={formatDateTime(bDetailRecord.approved_at)} />
                <DetailRow label="Created at" value={formatDateTime(bDetailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(bDetailRecord.updated_at)} />
                {bDetailRecord.is_archived && (
                  <>
                    <DetailRow label="Archived by" value={userName(bDetailRecord.archived_by)} />
                    <DetailRow label="Archived at" value={formatDateTime(bDetailRecord.archived_at)} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/**
 * TODO once the backend is wired in: replace `initialExpenses` (and the
 * `expenses.filter(e => e.budget_id === ...)` breakdown logic above) with
 * a real fetch to GET /api/expenses?budget_id={id}. See the note in
 * routes/api.php about reusing the Expenses index rather than a nested
 * budgets/expenses route.
 */