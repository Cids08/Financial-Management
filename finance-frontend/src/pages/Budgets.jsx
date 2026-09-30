import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Plus, Pencil, Archive, RotateCcw, PiggyBank, TrendingDown, Building2, Info, Printer,
  CheckCircle2, XCircle, Clock, AlertTriangle, Paperclip, Loader2,
  FileText, History, Activity, TrendingUp, LayoutGrid, List, Filter, ArrowUpRight, Sparkles,
  CalendarRange, X,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import SlideOver from '../components/SlideOver'
import Pagination from '../components/Pagination'
import Tooltip from '../components/Tooltip'
import BudgetPlanUploadModal from '../components/BudgetPlanUploadModal'
import BudgetPlanHistoryModal from '../components/BudgetPlanHistoryModal'
import { formatCurrency, currencySymbol, convertAmount, getActiveCurrency } from '../utils/formatters'
import { printSlip } from '../utils/printSlip'
import { money, SIGNATURE_PRESETS } from '../utils/print'
import { MIN_INVOICE_AMOUNT, minHint } from '../utils/business'
import { useBudgets } from '../hooks/useBudgets'
import { useDataUpdates } from '../hooks/useDataUpdates'
import { useDepartments } from '../hooks/useDepartments'
import DeletePermanentButton from '../components/DeletePermanentButton'
import RetentionCountdown from '../components/RetentionCountdown'
import BudgetUtilizationLedger from '../components/BudgetUtilizationLedger'
import { useHighlightRow } from '../hooks/useHighlightRow'
import { usePermissions } from '../context/PermissionsContext'
import { useProfile } from '../hooks/useProfile'
import { useCompany } from '../context/CompanyContext'
import { usePrivacy } from '../context/PrivacyContext'
import { hasPermission } from '../utils/permissions'

// status is the ONLY approval-workflow field on Budget  -  see
// status is constrained at the DB level (budgets_status_check) to:
// Draft, Active, Closed, Cancelled  -  there is no separate approval_status
// column. Draft = awaiting approval, Active = approved & spendable,
// Cancelled = rejected, Closed = end-of-cycle (a later, separate action).
const APPROVAL_STYLES = {
  Draft: 'bg-status-warning-bg text-status-warning',
  Active: 'bg-status-success-bg text-status-success',
  Cancelled: 'bg-status-danger-bg text-status-danger',
}
const APPROVAL_ICONS = { Draft: Clock, Active: CheckCircle2, Cancelled: XCircle }

const BUDGET_TYPES = ['Operational', 'Capital', 'Project', 'Emergency', 'Other']

// A new budget's fiscal year has to be the current year or later  -  a
// static "min:2000"-style floor lets someone create a brand-new budget
// for a fiscal year that's already years in the past, which the
// start_date/fiscal_year cross-check alone doesn't catch (both fields can
// still agree with EACH OTHER on a stale year). MAX_FISCAL_YEAR gives a
// reasonable forward planning window rather than leaving the top
// unbounded. Mirrors the same bound now enforced in
// StoreBudgetRequest::rules() on the backend.
const CURRENT_YEAR = new Date().getFullYear()
const MAX_FISCAL_YEAR = CURRENT_YEAR + 5

const EMPTY_FORM = {
  department_id: '',
  budget_code: '',
  budget_name: '',
  budget_type: '',
  budget_type_other: '', // only used when budget_type === 'Other'  -  the actual typed-in category
  fiscal_year: CURRENT_YEAR,
  allocated_amount: '',
  warning_percentage: '',
  start_date: '',
  end_date: '',
  remarks: '',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }
const INPUT_LOCKED = `w-full h-9 px-3 rounded-lg border border-border bg-bg/60 text-sm text-muted
  cursor-not-allowed select-none flex items-center`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

function getBudgetMetrics(b) {
  const allocated = Number(b?.allocated_amount) || 0
  const used = b?.used_amount !== undefined && b?.used_amount !== null
    ? Number(b.used_amount)
    : Math.max(0, allocated - (Number(b?.remaining_amount) || 0))
  const remaining = b?.remaining_amount !== undefined && b?.remaining_amount !== null
    ? Number(b.remaining_amount)
    : (allocated - used)
  const warningPct = Number(b?.warning_percentage) || 80
  const rawPct = allocated > 0 ? (used / allocated) * 100 : 0
  const displayPct = Math.round(rawPct * 10) / 10
  const barPct = Math.min(100, Math.max(0, rawPct))
  const isOver = rawPct > 100 || remaining < 0
  const isWarning = rawPct >= warningPct && !isOver

  let healthColor = 'emerald'
  let healthLabel = 'Healthy'
  if (isOver) {
    healthColor = 'rose'
    healthLabel = 'Over Budget'
  } else if (isWarning) {
    healthColor = 'amber'
    healthLabel = 'Near Limit'
  }

  return {
    allocated,
    used,
    remaining,
    warningPct,
    rawPct,
    displayPct,
    barPct,
    isOver,
    isWarning,
    healthColor,
    healthLabel,
  }
}

function usedPct(allocated, remaining) {
  const alloc = Number(allocated) || 0
  if (!alloc) return 0
  const rem = Number(remaining) || 0
  return Math.round(((alloc - rem) / alloc) * 100)
}

function TableUtilizationCell({ budget }) {
  if (budget.status !== 'Active') {
    return <span className="text-xs text-muted">Not yet active</span>
  }

  const {
    allocated,
    used,
    remaining,
    warningPct,
    displayPct,
    barPct,
    isOver,
    isWarning,
    healthLabel,
  } = getBudgetMetrics(budget)

  const barColor = isOver
    ? 'bg-gradient-to-r from-rose-500 to-red-600'
    : isWarning
    ? 'bg-gradient-to-r from-amber-400 to-amber-500'
    : 'bg-gradient-to-r from-emerald-400 to-emerald-500'

  const badgeStyles = isOver
    ? 'bg-status-danger-bg text-status-danger border-status-danger-border'
    : isWarning
    ? 'bg-status-warning-bg text-status-warning border-status-warning-border'
    : 'bg-status-success-bg text-status-success border-status-success-border'

  const tooltipText = `${formatCurrency(used)} spent of ${formatCurrency(allocated)} (${displayPct}%) · ${remaining < 0 ? 'Deficit: ' + formatCurrency(Math.abs(remaining)) : 'Left: ' + formatCurrency(remaining)} · Threshold: ${warningPct}%`

  return (
    <Tooltip label={tooltipText}>
      <div className="w-36 space-y-1 py-0.5">
        <div className="flex items-center justify-between gap-1 text-xs">
          <span className="font-semibold text-ink tabular-nums">{displayPct}%</span>
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-semibold leading-none ${badgeStyles}`}>
            {isOver && <AlertTriangle size={10} className="shrink-0" />}
            {isWarning && <Clock size={10} className="shrink-0" />}
            {!isOver && !isWarning && <CheckCircle2 size={10} className="shrink-0" />}
            {healthLabel}
          </span>
        </div>

        {/* Multi-tier progress track with warning threshold line */}
        <div className="relative h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${barPct}%` }}
          />
          {warningPct > 0 && warningPct < 100 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60 dark:bg-slate-400/60 z-10 pointer-events-none"
              style={{ left: `${warningPct}%` }}
              title={`Warning threshold: ${warningPct}%`}
            />
          )}
        </div>
      </div>
    </Tooltip>
  )
}

function BudgetHealthCard({ budget, onOpenDetail, onPrint }) {
  const m = getBudgetMetrics(budget)

  const barColor = m.isOver
    ? 'bg-gradient-to-r from-rose-500 to-red-600'
    : m.isWarning
    ? 'bg-gradient-to-r from-amber-400 to-amber-500'
    : 'bg-gradient-to-r from-emerald-400 to-emerald-500'

  const badgeStyles = m.isOver
    ? 'bg-status-danger-bg text-status-danger border-status-danger-border'
    : m.isWarning
    ? 'bg-status-warning-bg text-status-warning border-status-warning-border'
    : 'bg-status-success-bg text-status-success border-status-success-border'

  return (
    <div className={`${PANEL} p-4 flex flex-col justify-between space-y-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md border border-border/80`}>
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary-dark dark:text-primary-light text-[11px] font-semibold">
              <Building2 size={11} />
              {budget.department_name || 'Department'}
            </span>
            <span className="text-[11px] font-medium text-muted">FY{budget.fiscal_year}</span>
          </div>
          <h3 className="text-sm font-bold text-ink mt-1 truncate" title={budget.budget_name}>
            {budget.budget_name}
          </h3>
          <p className="text-xs text-muted font-mono mt-0.5">{budget.budget_code} &middot; {budget.budget_type}</p>
        </div>

        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold shrink-0 ${badgeStyles}`}>
          {m.isOver && <AlertTriangle size={12} className="shrink-0" />}
          {m.isWarning && <Clock size={12} className="shrink-0" />}
          {!m.isOver && !m.isWarning && <CheckCircle2 size={12} className="shrink-0" />}
          {m.healthLabel}
        </span>
      </div>

      {/* 3 KPI mini-tiles */}
      <div className="grid grid-cols-3 gap-2 pt-0.5">
        <div className="rounded-lg border border-border bg-bg/60 p-2 text-left">
          <span className="text-[10px] text-muted block font-medium">Allocated</span>
          <p className="text-xs font-bold text-ink mt-0.5 tabular-nums truncate">{formatCurrency(m.allocated)}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg/60 p-2 text-left">
          <span className="text-[10px] text-muted block font-medium">Utilized ({m.displayPct}%)</span>
          <p className={`text-xs font-bold mt-0.5 tabular-nums truncate ${m.isOver ? 'text-status-danger' : m.isWarning ? 'text-status-warning' : 'text-ink'}`}>
            {formatCurrency(m.used)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg/60 p-2 text-left">
          <span className="text-[10px] text-muted block font-medium">Remaining</span>
          <p className={`text-xs font-bold mt-0.5 tabular-nums truncate ${m.remaining < 0 ? 'text-status-danger' : 'text-status-success'}`}>
            {formatCurrency(m.remaining)}
          </p>
        </div>
      </div>

      {/* Visual Tracking Progress Gauge */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] font-semibold text-ink flex items-center gap-1">
            <Activity size={12} className="text-primary" />
            Utilization Rate
          </span>
          <span className="text-[11px] font-bold text-ink tabular-nums">{m.displayPct}%</span>
        </div>

        <button
          type="button"
          onClick={() => onOpenDetail(budget)}
          title="See the transactions behind this figure"
          className="block w-full text-left cursor-pointer group"
        >
        <div className="relative h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${m.barPct}%` }}
          />
          {m.warningPct > 0 && m.warningPct < 100 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-slate-500/70 dark:bg-slate-300/70 z-10 pointer-events-none"
              style={{ left: `${m.warningPct}%` }}
              title={`Warning threshold: ${m.warningPct}%`}
            />
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted">
          <span>0%</span>
          <span className="font-medium text-status-warning">Warning at {m.warningPct}%</span>
          <span>100% (Ceiling)</span>
        </div>
        </button>
      </div>

      {/* Card Actions */}
      <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpenDetail(budget)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          What Drove This Total
          <ArrowUpRight size={13} />
        </button>

        <button
          type="button"
          onClick={() => onPrint(budget)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors cursor-pointer"
          title="Print Budget Report"
        >
          <Printer size={13} />
        </button>
      </div>
    </div>
  )
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Bounds a Start/End Date input to the given fiscal year  -  this is the
// frontend half of fixing "why can I add a budget starting 2020": the
// year field and the date pickers used to have zero relationship, so
// nothing stopped picking a start_date years away from fiscal_year. The
// backend now rejects the mismatch too (see withValidator() in
// StoreBudgetRequest/UpdateBudgetRequest), but bounding the picker here
// stops the mistake before it's even submitted.
function yearBounds(fiscalYear) {
  if (!fiscalYear) return { min: undefined, max: undefined }
  return { min: `${fiscalYear}-01-01`, max: `${fiscalYear}-12-31` }
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
  const Icon = APPROVAL_ICONS[status] ?? Clock
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${APPROVAL_STYLES[status] ?? APPROVAL_STYLES.Draft}`}>
      <Icon size={12} />
      {status}
    </span>
  )
}

export default function Budgets({ title = 'Budgets', crumbs = ['Financial Transactions', 'Budgets'] }) {
  const {
    budgets, meta, stats, loading, saving, error,
    fetchBudgets, fetchStats, createBudget, updateBudget,
    uploadPlan, viewPlan, fetchPlanHistory, viewPlanVersion, approveBudget, rejectBudget, archiveBudget, restoreBudget,
    fetchUtilization,
  } = useBudgets()

  const { departments, fetchDepartments } = useDepartments()
  const { permissions, role } = usePermissions()
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin' || profile?.role_slug === 'admin' || profile?.role_slug === 'super-admin'
  const canApproveBudgets = hasPermission(permissions, 'budgets.approve') || role === 'super-admin'
  const canManageBudgets = hasPermission(permissions, 'budgets.manage') || role === 'super-admin'

  usePrivacy()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // Draft / Active / Cancelled / Closed / all
  const [showArchived, setShowArchived] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const PER_PAGE = 20

  const hasDateFilter = Boolean(dateFrom || dateTo)
  const clearDateFilter = () => {
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  // Global search (SearchBar.jsx) navigates here with a highlightId (and,
  // since this table's `search` filter is server-side via load() below, a
  // highlightSearch seed) whenever a budget record is clicked from search
  // results.
  const { highlightedId, highlightSearch } = useHighlightRow()
  useEffect(() => {
    if (highlightSearch == null) return
    setSearch(highlightSearch)
    setStatusFilter('all')
    setShowArchived(false)
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }, [highlightSearch])

  const [modalMode, setModalMode] = useState(null) // null | 'add' | budget object being edited
  const [form, setForm] = useState(EMPTY_FORM)
  // Company default fiscal year (Settings) seeds new budgets; falls back to
  // the current year if the setting is outside the allowed range.
  const company = useCompany()
  const { fiscalYear: settingsFiscalYear } = company
  const [serverError, setServerError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [successVisible, setSuccessVisible] = useState(false)   // drives fade-in / fade-out
  const successTimers = useRef([])
  const [fieldErrors, setFieldErrors] = useState({})
  const [dateErrors, setDateErrors] = useState({ start_date: '', end_date: '' })
  const [amountError, setAmountError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)
  // Full-screen utilization ledger. The detail modal is fine for a summary but
  // too narrow for a long transaction list, so the ledger gets its own
  // full-width view.
  const [ledgerTarget, setLedgerTarget] = useState(null)
  const [uploadTarget, setUploadTarget] = useState(null) // budget currently attaching a plan (from table/detail)
  const [historyTarget, setHistoryTarget] = useState(null) // budget whose plan version history is open
  const [planFile, setPlanFile] = useState(null) // plan picked inline in the Add Budget modal
  const [planFileError, setPlanFileError] = useState('')
  // Replacement plan picked inline in the EDIT modal  -  kept separate from
  // planFile/planFileError above so opening Add right after Edit (or vice
  // versa) never bleeds a leftover selection from one mode into the other.
  const [editPlanFile, setEditPlanFile] = useState(null)
  const [editPlanFileError, setEditPlanFileError] = useState('')
  const [rejectTarget, setRejectTarget] = useState(null) // budget being rejected
  const [rejectReason, setRejectReason] = useState('')
  const [actionBusyId, setActionBusyId] = useState(null)
  const [pageNotice, setPageNotice] = useState('') // survives modal close, e.g. "budget created but plan failed to attach"
  // Separate from pageNotice: pageNotice renders in the page body, which
  // is exactly what a modal sits on top of and hides  -  so a View click
  // made FROM INSIDE the Edit or Detail modal needs its own visible
  // notice, shown inside that modal, or the result (e.g. "downloaded
  // instead of previewed") is invisible until the modal is closed.
  const [viewNotice, setViewNotice] = useState('')
  const [codeIsAuto, setCodeIsAuto] = useState(true)

  // ── Dedicated Utilization & Health Tracker State ──────────────────
  const [activeTab, setActiveTab] = useState('budgets') // 'budgets' | 'tracker'
  const [trackerHealthFilter, setTrackerHealthFilter] = useState('all') // 'all' | 'healthy' | 'warning' | 'over'
  const [trackerDeptFilter, setTrackerDeptFilter] = useState('all')
  const [trackerSearch, setTrackerSearch] = useState('')
  const [trackerViewMode, setTrackerViewMode] = useState('cards') // 'cards' | 'table'

  const load = () => {
    fetchBudgets(
      {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search || undefined,
        archived: showArchived ? 1 : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      },
      page,
      PER_PAGE
    )
  }

  useEffect(() => { load() }, [statusFilter, showArchived, dateFrom, dateTo, page]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchStats() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDepartments({}, 1, 100) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates: budget list/stats and the utilization figures refresh in
  // place when budgets or their underlying expenses/disbursements change.
  useDataUpdates(['budgets', 'expenses', 'disbursements'], () => { fetchBudgets(); fetchStats() })

  // Debounce free-text search instead of firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load() }, 350)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filtered list specifically for the dedicated Utilization & Health Tracker
  const trackerBudgets = useMemo(() => {
    return budgets.filter((b) => {
      // Focus on spendable / active budgets (or closed if needed)
      if (b.status !== 'Active') return false

      if (trackerDeptFilter !== 'all' && String(b.department_id) !== String(trackerDeptFilter)) {
        return false
      }

      if (trackerSearch.trim()) {
        const term = trackerSearch.toLowerCase()
        const matchName = (b.budget_name || '').toLowerCase().includes(term)
        const matchCode = (b.budget_code || '').toLowerCase().includes(term)
        const matchDept = (b.department_name || '').toLowerCase().includes(term)
        if (!matchName && !matchCode && !matchDept) return false
      }

      if (trackerHealthFilter !== 'all') {
        const m = getBudgetMetrics(b)
        if (trackerHealthFilter === 'healthy' && (m.isOver || m.isWarning)) return false
        if (trackerHealthFilter === 'warning' && !m.isWarning) return false
        if (trackerHealthFilter === 'over' && !m.isOver) return false
      }

      return true
    })
  }, [budgets, trackerDeptFilter, trackerSearch, trackerHealthFilter])

  // Count health distribution across all active budgets in current dataset
  const healthDistribution = useMemo(() => {
    let healthy = 0
    let warning = 0
    let over = 0
    for (const b of budgets) {
      if (b.status === 'Active') {
        const m = getBudgetMetrics(b)
        if (m.isOver) over++
        else if (m.isWarning) warning++
        else healthy++
      }
    }
    return { healthy, warning, over, total: healthy + warning + over }
  }, [budgets])

  // Proactively detects if the department, fiscal year, and budget type in the Add form already has an existing budget
  const duplicateBudgetWarning = useMemo(() => {
    if (modalMode !== 'add' || !form.department_id || !form.fiscal_year || !form.budget_type) return null
    const effectiveType = form.budget_type === 'Other' ? form.budget_type_other?.trim() : form.budget_type
    if (!effectiveType) return null

    return budgets.find(
      (b) =>
        String(b.department_id) === String(form.department_id) &&
        Number(b.fiscal_year) === Number(form.fiscal_year) &&
        (b.budget_type || '').toLowerCase() === effectiveType.toLowerCase() &&
        b.status !== 'Cancelled' &&
        !b.deleted_at
    )
  }, [modalMode, form.department_id, form.fiscal_year, form.budget_type, form.budget_type_other, budgets])

  // Proactively detects duplicate budget name within the same fiscal year
  const duplicateNameWarning = useMemo(() => {
    if (modalMode !== 'add' || !form.budget_name?.trim() || !form.fiscal_year) return null
    return budgets.find(
      (b) =>
        Number(b.fiscal_year) === Number(form.fiscal_year) &&
        b.budget_name?.trim().toLowerCase() === form.budget_name.trim().toLowerCase() &&
        !b.deleted_at
    )
  }, [modalMode, form.budget_name, form.fiscal_year, budgets])

  // Proactively detects duplicate budget code
  const duplicateCodeWarning = useMemo(() => {
    if (modalMode !== 'add' || !form.budget_code?.trim()) return null
    return budgets.find(
      (b) =>
        b.budget_code?.trim().toLowerCase() === form.budget_code.trim().toLowerCase() &&
        !b.deleted_at
    )
  }, [modalMode, form.budget_code, budgets])

  const formatKpiCurrency = (val) => {
    if (val == null || val === '—') return '—'
    const num = Number(val)
    if (isNaN(num)) return val
    const converted = convertAmount(num)
    if (Math.abs(converted) >= 1_000_000_000) {
      return `${currencySymbol()}${(converted / 1_000_000_000).toLocaleString('en-PH', { maximumFractionDigits: 2 })}B`
    }
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: getActiveCurrency(),
      minimumFractionDigits: converted % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(converted)
  }

  const statCards = useMemo(() => {
    const totalAlloc = Number(stats?.allocated) || 0
    const totalUsed = stats?.used !== undefined && stats?.used !== null
      ? Number(stats.used)
      : Math.max(0, totalAlloc - (Number(stats?.remaining) || 0))
    const overallPct = totalAlloc > 0 ? Math.round((totalUsed / totalAlloc) * 1000) / 10 : 0

    return [
      { key: 'total', label: 'Total Budgets', value: stats?.total ?? '—', icon: PiggyBank, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: activeTab === 'budgets' && statusFilter === 'all' && !showArchived, onClick: () => { setActiveTab('budgets'); setShowArchived(false); setStatusFilter('all') } },
      { key: 'pending', label: 'Draft', value: stats?.pending ?? '—', icon: Clock, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: activeTab === 'budgets' && statusFilter === 'Draft', onClick: () => { setActiveTab('budgets'); setShowArchived(false); setStatusFilter('Draft') } },
      { key: 'allocated', label: 'Total Allocated', value: stats?.allocated != null ? formatKpiCurrency(stats.allocated) : '—', fullValue: stats?.allocated != null ? formatCurrency(stats.allocated) : '—', icon: Building2, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => { setActiveTab('budgets'); setShowArchived(false); setStatusFilter('all') } },
      { key: 'utilized', label: 'Total Utilized', value: stats?.allocated != null ? formatKpiCurrency(totalUsed) : '—', subBadge: stats?.allocated != null ? `${overallPct}%` : null, fullValue: stats?.allocated != null ? `${formatCurrency(totalUsed)} (${overallPct}%)` : '—', icon: Activity, iconBg: overallPct >= 80 ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-violet-50 dark:bg-violet-500/10', iconColor: overallPct >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400', isActive: activeTab === 'tracker', onClick: () => { setActiveTab('tracker') } },
      { key: 'remaining', label: 'Total Remaining', value: stats?.remaining != null ? formatKpiCurrency(stats.remaining) : '—', fullValue: stats?.remaining != null ? formatCurrency(stats.remaining) : '—', icon: TrendingDown, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => { setActiveTab('budgets'); setShowArchived(false); setStatusFilter('all') } },
      { key: 'archived', label: 'Archived', value: stats?.archived ?? '—', icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: activeTab === 'budgets' && showArchived, onClick: () => { setActiveTab('budgets'); setShowArchived(true) } },
    ]
  }, [stats, statusFilter, showArchived, activeTab])

  const validateDate = (field, value) => {
    if (!value) {
      setDateErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    const d = new Date(value)
    const min = new Date('2017-01-01')
    if (isNaN(d.getTime())) {
      setDateErrors((e) => ({ ...e, [field]: 'Invalid date.' }))
    } else if (d < min) {
      setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
    } else {
      const fy = isEditing ? modalMode.fiscal_year : Number(form.fiscal_year)
      if (fy && d.getFullYear() !== fy) {
        setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
      } else {
        setDateErrors((e) => ({ ...e, [field]: '' }))
      }
    }
  }

  const generateBudgetCode = (deptId, fy, bType) => {
    const dept = departments.find((d) => String(d.department_id || d.id) === String(deptId))
    const year = fy || form.fiscal_year || CURRENT_YEAR
    let abbr = 'DEPT'
    if (dept) {
      const name = dept.department_name || ''
      if (/finance/i.test(name)) abbr = 'FIN'
      else if (/human\s*resources|hr/i.test(name)) abbr = 'HR'
      else if (/operation/i.test(name)) abbr = 'OPS'
      else if (/marketing/i.test(name)) abbr = 'MKT'
      else if (/legal/i.test(name)) abbr = 'LGL'
      else if (/information\s*tech|it/i.test(name)) abbr = 'IT'
      else if (/accounting/i.test(name)) abbr = 'ACC'
      else if (/admin/i.test(name)) abbr = 'ADM'
      else {
        const words = name.trim().split(/\s+/)
        abbr = words.length > 1
          ? words.map((w) => w[0]).join('').toUpperCase().slice(0, 4)
          : name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'DEPT'
      }
    }

    let typeTag = ''
    const currentType = bType !== undefined ? bType : form.budget_type
    if (currentType) {
      if (currentType === 'Operational') typeTag = '-OP'
      else if (currentType === 'Capital') typeTag = '-CAP'
      else if (currentType === 'Project') typeTag = '-PRJ'
      else if (currentType === 'Emergency') typeTag = '-EMG'
      else if (currentType === 'Other') typeTag = '-OTH'
      else {
        const clean = currentType.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase()
        if (clean) typeTag = `-${clean}`
      }
    }

    const base = `BUD-${year}-${abbr}${typeTag}`
    let candidate = base
    let seq = 1
    const existingCodes = new Set((budgets || []).map((b) => (b.budget_code || '').toUpperCase()))
    while (existingCodes.has(candidate.toUpperCase())) {
      candidate = `${base}-${String(seq).padStart(2, '0')}`
      seq++
    }
    return candidate
  }

  const openAdd = () => {
    const fy = Number(settingsFiscalYear)
    const defaultFiscalYear = (fy && fy >= CURRENT_YEAR && fy <= MAX_FISCAL_YEAR) ? fy : CURRENT_YEAR
    setForm({ ...EMPTY_FORM, fiscal_year: defaultFiscalYear })
    setCodeIsAuto(true)
    setServerError('')
    setFieldErrors({})
    setDateErrors({ start_date: '', end_date: '' })
    setAmountError('')
    setViewNotice('')
    setPlanFile(null)
    setPlanFileError('')
    setEditPlanFile(null)
    setEditPlanFileError('')
    setModalMode('add')
  }
  const openEdit = (b) => {
    if (b.status === 'Active') return // locked, per UpdateBudgetRequest::authorize()
    const isStandardType = BUDGET_TYPES.includes(b.budget_type)
    setForm({
      department_id: b.department_id,
      budget_code: b.budget_code,
      budget_name: b.budget_name,
      budget_type: isStandardType ? b.budget_type : 'Other',
      budget_type_other: isStandardType ? '' : (b.budget_type || ''),
      fiscal_year: b.fiscal_year,
      allocated_amount: b.allocated_amount,
      warning_percentage: b.warning_percentage ?? '',
      start_date: b.start_date?.slice(0, 10) ?? '',
      end_date: b.end_date?.slice(0, 10) ?? '',
      remarks: b.remarks ?? '',
    })
    setServerError('')
    setFieldErrors({})
    setDateErrors({ start_date: '', end_date: '' })
    setAmountError('')
    setEditPlanFile(null)
    setEditPlanFileError('')
    setViewNotice('')
    setModalMode(b)
  }
  const closeModal = () => {
    setModalMode(null)
    setServerError('')
    setFieldErrors({})
    setDateErrors({ start_date: '', end_date: '' })
    setAmountError('')
    setEditPlanFile(null)
    setEditPlanFileError('')
    setViewNotice('')
  }
  const openDetail = (b) => { setViewNotice(''); setDetailRecord(b) }
  const closeDetail = () => { setDetailRecord(null); setViewNotice('') }
  const isEditing = modalMode !== null && modalMode !== 'add'

  // Shared by both the Add and Edit plan pickers  -  validates a chosen
  // file's extension/size and stores it via whichever mode's setters are
  // passed in.
  const handlePlanFileChange = (file, setFile, setError) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(ext)) {
      setError(`"${file.name}" isn't a supported file type.`)
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`"${file.name}" exceeds the 10MB limit.`)
      return
    }
    setError('')
    setFieldErrors((fe) => ({ ...fe, plan_file: '' }))
    setFile(file)
  }

  // Changing the start date can leave a previously-chosen end date sitting
  // before it  -  the <input min=...> on End Date only stops NEW invalid
  // picks going forward, it doesn't retroactively fix an end_date that was
  // set before start_date changed to something later. Clear it instead of
  // silently letting an inverted range sit in the form.
  const handleStartDateChange = (value) => {
    setFieldErrors((fe) => ({ ...fe, start_date: '' }))
    setForm((f) => ({
      ...f,
      start_date: value,
      end_date: f.end_date && value && f.end_date < value ? '' : f.end_date,
    }))
  }

  // Fiscal Year drives the valid range for both date pickers (see
  // yearBounds() above)  -  if it changes, any already-picked start/end
  // date that no longer falls inside the new year has to be cleared
  // rather than silently left out-of-range until submit fails.
  const handleFiscalYearChange = (value) => {
    setFieldErrors((fe) => ({ ...fe, fiscal_year: '', budget_code: '' }))
    setForm((f) => {
      const year = String(value)
      const startStillValid = f.start_date && f.start_date.slice(0, 4) === year
      const endStillValid = f.end_date && f.end_date.slice(0, 4) === year
      const nextCode = codeIsAuto && f.department_id ? generateBudgetCode(f.department_id, value, f.budget_type) : f.budget_code
      return {
        ...f,
        fiscal_year: value,
        budget_code: nextCode,
        start_date: startStillValid ? f.start_date : '',
        end_date: startStillValid && endStillValid ? f.end_date : '',
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setServerError('')
    const errors = {}

    if (modalMode === 'add') {
      if (!form.department_id) errors.department_id = 'Department is required.'
      if (!form.fiscal_year) {
        errors.fiscal_year = 'Fiscal year is required.'
      } else {
        const fy = Number(form.fiscal_year)
        if (fy < CURRENT_YEAR || fy > MAX_FISCAL_YEAR) {
          errors.fiscal_year = `Fiscal year must be between ${CURRENT_YEAR} and ${MAX_FISCAL_YEAR}.`
        }
      }
      if (!form.budget_code?.trim()) errors.budget_code = 'Budget code is required.'
      if (!form.budget_type) errors.budget_type = 'Budget type is required.'
      if (form.budget_type === 'Other' && !form.budget_type_other?.trim()) {
        errors.budget_type_other = 'Please specify the budget type.'
      }
      if (!form.budget_name?.trim()) errors.budget_name = 'Budget name is required.'
      if (!planFile) errors.plan_file = 'A budget plan file is required to create a budget.'

      // Duplicate budget guards
      if (duplicateBudgetWarning) {
        errors.budget_type = `A ${duplicateBudgetWarning.status} ${duplicateBudgetWarning.budget_type} budget for this department already exists for FY${form.fiscal_year} (${duplicateBudgetWarning.budget_name} [${duplicateBudgetWarning.budget_code}]). Duplicate budgets of the same type are not allowed for the same department and fiscal year.`
      }
      if (duplicateNameWarning) {
        errors.budget_name = `A budget named "${duplicateNameWarning.budget_name}" already exists for FY${form.fiscal_year} (${duplicateNameWarning.budget_code}). Budget names must be unique per fiscal year.`
      }
      if (duplicateCodeWarning) {
        errors.budget_code = `Budget code "${duplicateCodeWarning.budget_code}" is already in use.`
      }
    }

    if (!form.allocated_amount && form.allocated_amount !== 0) {
      errors.allocated_amount = 'Allocated amount is required.'
    } else if (Number(form.allocated_amount) < MIN_INVOICE_AMOUNT) {
      errors.allocated_amount = `Allocated amount must be at least ${formatCurrency(MIN_INVOICE_AMOUNT)}.`
    }

    if (form.warning_percentage !== '' && (Number(form.warning_percentage) < 1 || Number(form.warning_percentage) > 100)) {
      errors.warning_percentage = 'Warning percentage must be between 1 and 100.'
    }

    if (!form.start_date) {
      errors.start_date = 'Start date is required.'
    }
    if (!form.end_date) {
      errors.end_date = 'End date is required.'
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      errors.end_date = 'End date cannot be before start date.'
    }

    const startYear = form.start_date ? Number(form.start_date.slice(0, 4)) : null
    const referenceFiscalYear = isEditing ? modalMode.fiscal_year : Number(form.fiscal_year)
    if (startYear !== null && startYear !== referenceFiscalYear) {
      errors.start_date = 'Date is out of range.'
    }

    if (planFileError || (isEditing && editPlanFileError)) {
      errors.plan_file = 'Fix the budget plan file issue before continuing.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    let result
    if (modalMode === 'add') {
      const resolvedBudgetType = form.budget_type === 'Other' ? form.budget_type_other.trim() : form.budget_type
      result = await createBudget({
        department_id: Number(form.department_id),
        budget_code: form.budget_code,
        budget_name: form.budget_name,
        budget_type: resolvedBudgetType,
        fiscal_year: Number(form.fiscal_year),
        allocated_amount: Number(form.allocated_amount),
        warning_percentage: form.warning_percentage === '' ? undefined : Number(form.warning_percentage),
        start_date: form.start_date,
        end_date: form.end_date,
        remarks: form.remarks || undefined,
      })

      if (result.success && planFile) {
        const planResult = await uploadPlan(result.data.budget_id, planFile)
        if (!planResult.success) {
          fetchStats()
          load()
          closeModal()
          setPageNotice(`Budget created, but the plan failed to attach: ${planResult.message}. You can attach it from the table.`)
          return
        }
      }
    } else {
      result = await updateBudget(modalMode.budget_id, {
        allocated_amount: Number(form.allocated_amount),
        warning_percentage: form.warning_percentage === '' ? undefined : Number(form.warning_percentage),
        start_date: form.start_date,
        end_date: form.end_date,
        remarks: form.remarks || undefined,
      })

      if (result.success && editPlanFile) {
        const planResult = await uploadPlan(modalMode.budget_id, editPlanFile)
        if (!planResult.success) {
          fetchStats()
          load()
          closeModal()
          setPageNotice(`Budget updated, but the replacement plan failed to attach: ${planResult.message}. You can attach it from the table.`)
          return
        }
      }
    }

    if (!result.success) {
      setServerError(result.message)
      if (result.errors) {
        const mapped = {}
        for (const [key, msgs] of Object.entries(result.errors)) {
          mapped[key] = Array.isArray(msgs) ? msgs[0] : msgs
        }
        setFieldErrors((prev) => ({ ...prev, ...mapped }))
      }
      return
    }
    fetchStats()
    load()
    closeModal()
  }

  // ── Auto-dismiss success banner ────────────────────────────────────
  // Call showSuccess(msg) anywhere instead of manually doing
  // setSuccessMessage + setTimeout.  Shows the banner, waits 4 s, then
  // fades it out over 500 ms and removes it from the DOM.
  const showSuccess = (msg) => {
    successTimers.current.forEach(clearTimeout)
    setSuccessMessage(msg)
    setSuccessVisible(true)
    const t1 = setTimeout(() => setSuccessVisible(false), 4000)   // begin fade
    const t2 = setTimeout(() => setSuccessMessage(''), 4500)      // remove DOM node
    successTimers.current = [t1, t2]
  }
  const dismissSuccess = () => {
    successTimers.current.forEach(clearTimeout)
    setSuccessVisible(false)
    setTimeout(() => setSuccessMessage(''), 500)
  }

  const handleApprove = async (budgetOrId) => {
    const b = typeof budgetOrId === 'object' ? budgetOrId : budgets.find((x) => x.budget_id === budgetOrId) || { budget_id: budgetOrId }
    const id = b.budget_id
    setActionBusyId(id)
    setServerError('')
    const result = await approveBudget(id)
    setActionBusyId(null)
    if (result.success) {
      const budgetLabel = b.budget_name ? `Budget "${b.budget_name}" (${b.budget_code})` : 'Budget'
      setSuccessMessage(`${budgetLabel} approved successfully and is now Active.`)
      setTimeout(() => setSuccessMessage(''), 5000)
      showSuccess(`${budgetLabel} approved successfully and is now Active.`)
      fetchStats()
      setDetailRecord((prev) => (prev && prev.budget_id === id ? result.data : prev))
      load()
    } else {
      setServerError(result.message || 'Failed to approve budget.')
    }
  }

  const openReject = (budgetOrId) => {
    const target = typeof budgetOrId === 'object' ? budgetOrId : budgets.find((x) => x.budget_id === budgetOrId) || { budget_id: budgetOrId }
    setRejectTarget(target)
    setRejectReason('')
  }

  const confirmReject = async (e) => {
    if (e) e.preventDefault()
    if (!rejectTarget) return
    const id = rejectTarget.budget_id
    setActionBusyId(id)
    const result = await rejectBudget(id, rejectReason || undefined)
    setActionBusyId(null)
    if (result.success) {
      const budgetLabel = rejectTarget.budget_name ? `Budget "${rejectTarget.budget_name}" (${rejectTarget.budget_code})` : 'Budget'
      setSuccessMessage(`${budgetLabel} has been rejected.`)
      setTimeout(() => setSuccessMessage(''), 5000)
      showSuccess(`${budgetLabel} has been rejected.`)
      fetchStats()
      setDetailRecord((prev) => (prev && prev.budget_id === id ? result.data : prev))
      load()
    } else {
      setServerError(result.message || 'Failed to reject budget.')
    }
    setRejectTarget(null)
  }

  const handleArchiveToggle = async (b) => {
    setActionBusyId(b.budget_id)
    const result = b.deleted_at ? await restoreBudget(b.budget_id) : await archiveBudget(b.budget_id)
    setActionBusyId(null)
    if (result.success) {
      const budgetLabel = b.budget_name ? `Budget "${b.budget_name}" (${b.budget_code})` : 'Budget'
      setSuccessMessage(`${budgetLabel} ${b.deleted_at ? 'restored' : 'archived'} successfully.`)
      setTimeout(() => setSuccessMessage(''), 5000)
      showSuccess(`${budgetLabel} ${b.deleted_at ? 'restored' : 'archived'} successfully.`)
      fetchStats()
      load()
    }
  }

  // Opens the plan in a new tab (inline) instead of forcing a download  - 
  // see useBudgets.js's viewPlan() for how/why. Only PDFs actually
  // render inline in most browsers; Word/Excel plans will still trigger
  // a download regardless, since browsers have no native viewer for those.
  const handleViewPlan = async (b) => {
    // Open the tab SYNCHRONOUSLY, before any await  -  browsers only allow
    // window.open() without triggering the popup blocker when it happens
    // as a direct result of the click event. The previous version awaited
    // the file fetch first and only called window.open() once it
    // resolved, by which point the browser no longer considered it a
    // direct response to the click and could silently block it. The blank
    // tab gets redirected to the real blob URL once viewPlan() resolves  - 
    // or, for a file type with no in-browser viewer (docx/xlsx/etc.),
    // viewPlan() closes this tab itself and downloads the file instead,
    // so nothing stays stuck at about:blank.
    const targetWindow = window.open('', '_blank')
    const result = await viewPlan(b.budget_id, targetWindow)
    if (!result.success) {
      const msg = `Couldn't open the budget plan: ${result.message}`
      // Set BOTH: pageNotice covers the row-level action (table, no modal
      // in the way), viewNotice covers this same click made from inside
      // the Edit or Detail modal, where pageNotice's spot on the page is
      // hidden behind the modal. Whichever one isn't currently visible
      // just goes unused  -  harmless either way.
      setPageNotice(msg)
      setViewNotice(msg)
    } else if (!result.viewedInline) {
      const msg = "This file type can't be previewed in-browser, so it's been downloaded instead."
      setPageNotice(msg)
      setViewNotice(msg)
    } else {
      setViewNotice('')
    }
  }

  const handlePrint = (b) => {
    const m = getBudgetMetrics(b)

    printSlip({
      company,
      profile,
      spec: 'budget',
      title: 'Budget Report',
      subtitle: `${b.department_name || 'All Departments'} · FY${b.fiscal_year}`,
      status: b.status,
      meta: [
        ['Budget Code', b.budget_code],
        ['Fiscal Year', `FY${b.fiscal_year}`],
        ['Department', b.department_name || '—'],
      ],
      groups: [
        {
          heading: 'Budget Details',
          rows: [
            ['Department', b.department_name || '—', 'span'],
            ['Budget Code', b.budget_code],
            ['Fiscal Year', `FY${b.fiscal_year}`],
            ['Budget Type', b.budget_type || '—'],
            ['Budget Plan', b.has_plan ? 'Attached' : 'Not attached'],
            ...(b.remarks ? [['Remarks', b.remarks, 'span']] : []),
          ],
        },
        {
          heading: 'Utilization',
          rows: [
            ['Allocated Amount', money(m.allocated)],
            ['Used / Spent', money(m.used)],
            [
              'Remaining Balance',
              m.remaining < 0
                ? `Deficit (${money(Math.abs(m.remaining))})`
                : money(m.remaining),
              'total',
            ],
            ['Utilization Rate', `${m.displayPct}% (${m.healthLabel})`],
            ['Warning Threshold', `${m.warningPct}%`],
          ],
        },
        {
          heading: 'Approval',
          rows: [
            ['Approval Status', b.status],
            ['Approved By', b.approved_by_name || '—'],
            ...(b.approved_at ? [['Approved At', formatDateTime(b.approved_at)]] : []),
          ],
        },
      ],
      signatureTitle: 'Prepared, Reviewed & Approved',
      signatures: SIGNATURE_PRESETS.internal({
        preparedName: profile?.name,
        preparedRole: profile?.role,
        approvedName: b.approved_by_name || null,
      }),
      disclaimer: 'Utilization figures reflect expense vouchers posted against this budget as of the time of printing. A budget remains "active" only while today falls within its start and end dates and it has been approved.',
    })
  }

  const totalPages = meta.last_page || 1
  const rangeStart = meta.total === 0 ? 0 : (meta.current_page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(meta.current_page * PER_PAGE, meta.total)

  const addDateBounds = yearBounds(form.fiscal_year)
  const editDateBounds = isEditing ? yearBounds(modalMode.fiscal_year) : { min: undefined, max: undefined }
  const dateBounds = isEditing ? editDateBounds : addDateBounds

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Allocate, approve, and monitor department budgets by fiscal year.</p>
        </div>
        {canManageBudgets && (
          <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Budget</Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{error}</div>
      )}

      {successMessage && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border border-status-success-border bg-status-success-bg px-3.5 py-2.5 text-xs text-status-success transition-all duration-500 ${
            successVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-status-success shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={dismissSuccess} className="shrink-0 font-medium underline">Dismiss</button>
        </div>
      )}

      {pageNotice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          <span>{pageNotice}</span>
          <button type="button" onClick={() => setPageNotice('')} className="shrink-0 font-medium underline">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              className={`${PANEL} p-3 flex items-center gap-2.5 text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={15} className={card.iconColor} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs text-muted truncate" title={card.label}>{card.label}</p>
                  {card.subBadge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-ink dark:text-slate-200 shrink-0">
                      {card.subBadge}
                    </span>
                  )}
                </div>
                <p className="text-sm xl:text-[13px] 2xl:text-sm font-bold text-ink truncate tabular-nums tracking-tight mt-0.5" title={card.fullValue || String(card.value)}>
                  {card.value}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* View Tabs: Budget Governance vs. Real-Time Utilization & Health Tracker */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 sm:gap-3 py-2">
          <button
            type="button"
            onClick={() => setActiveTab('budgets')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-sm font-semibold rounded-lg border transition-all duration-150 cursor-pointer active:scale-95 ${
              activeTab === 'budgets'
                ? 'border-primary bg-primary/10 text-primary dark:text-primary-light shadow-sm ring-1 ring-primary/20'
                : 'border-border bg-surface text-muted hover:bg-muted/10 hover:text-ink hover:border-muted/50 hover:shadow-sm'
            }`}
          >
            <Building2 size={15} />
            <span>Budget Management</span>
            <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'budgets'
                ? 'bg-primary/15 text-primary dark:text-primary-light'
                : 'bg-slate-100 dark:bg-slate-800 text-muted'
            }`}>
              {stats?.total ?? budgets.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tracker')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-sm font-semibold rounded-lg border transition-all duration-150 cursor-pointer active:scale-95 relative ${
              activeTab === 'tracker'
                ? 'border-primary bg-primary/10 text-primary dark:text-primary-light shadow-sm ring-1 ring-primary/20'
                : 'border-border bg-surface text-muted hover:bg-muted/10 hover:text-ink hover:border-muted/50 hover:shadow-sm'
            }`}
          >
            <Activity size={15} />
            <span>Utilization & Health Tracker</span>
            {healthDistribution.warning > 0 || healthDistribution.over > 0 ? (
              <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold bg-status-warning text-white leading-none">
                {healthDistribution.warning + healthDistribution.over}
              </span>
            ) : (
              <span className={`ml-0.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === 'tracker'
                  ? 'bg-status-success-bg text-status-success'
                  : 'bg-status-success-bg text-status-success'
              }`}>
                {healthDistribution.healthy} Active
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── TAB 1: BUDGET MANAGEMENT & GOVERNANCE ─────────────────────── */}
      {activeTab === 'budgets' && (
        <div className="space-y-4 animate-fadeIn">
          <div className={`${PANEL} ${PANEL_PAD}`}>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Search</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by budget name or code..."
                    className={`${INPUT} pl-9 pr-9`}
                    style={{ ...INPUT_TEXT_STYLE, minWidth: 0 }}
                    autoComplete="off"
                  />
                  {search && (
                    <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-border hover:text-ink transition-colors duration-150">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              {/* Status */}
              <div className="w-full sm:w-48 shrink-0">
                <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Status</label>
                <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={INPUT} style={INPUT_TEXT_STYLE}>
                  <option value="all">All Approval States</option>
                  <option value="Draft">Pending</option>
                  <option value="Active">Approved</option>
                  <option value="Cancelled">Rejected</option>
                </select>
              </div>
              {/* Date From */}
              <div className="shrink-0">
                <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                  max={dateTo || undefined}
                  aria-label="Filter budget start date from"
                  className={`${INPUT} scheme-light dark:scheme-dark`}
                  style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
                />
              </div>
              {/* Date To */}
              <div className="shrink-0">
                <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                  min={dateFrom || undefined}
                  aria-label="Filter budget end date to"
                  className={`${INPUT} scheme-light dark:scheme-dark`}
                  style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
                />
              </div>
              {/* Reset */}
              {(search || statusFilter !== 'all' || hasDateFilter) && (
                <div className="shrink-0">
                  <Button variant="secondary" size="sm" icon={RotateCcw} iconPosition="left" onClick={() => { setSearch(''); setStatusFilter('all'); clearDateFilter(); setPage(1) }}>Reset</Button>
                </div>
              )}
            </div>
          </div>

          {showArchived && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <Archive size={14} className="shrink-0" /> Showing archived budgets
              </span>
              <button
                type="button"
                onClick={() => { setShowArchived(false); setPage(1) }}
                className="font-semibold underline hover:text-ink"
              >
                Return to active budgets
              </button>
            </div>
          )}

          <div className={PANEL}>
            <div className="overflow-hidden rounded-t-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Budget</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Fiscal Year</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Allocated / Remaining</th>
                    <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Approval</th>
                    <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                      <Loader2 size={16} className="inline animate-spin mr-2" /> Loading budgets...
                    </td></tr>
                  ) : budgets.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">No budgets match your filters.</td></tr>
                  ) : budgets.map((b) => {
                    const isPending = b.status === 'Draft'
                    const isOverspent = Number(b.remaining_amount) < 0
                    return (
                      <tr
                        key={b.budget_id}
                        data-row-id={b.budget_id}
                        className={`border-b border-border last:border-0 transition-colors duration-300
                          ${highlightedId === b.budget_id ? 'bg-primary/10' : 'hover:bg-bg'}`}
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-ink">{b.budget_name}</p>
                          <p className="text-xs text-muted">{b.department_name || '—'} · {b.budget_code} · {b.budget_type}</p>
                          {isPending && !b.has_plan && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-status-warning">
                              <AlertTriangle size={11} />
                              No budget plan attached
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-ink">{b.fiscal_year}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <p className="font-semibold text-ink tabular-nums">{formatCurrency(b.allocated_amount)}</p>
                          <p className={`text-xs tabular-nums mt-0.5 ${isOverspent ? 'text-status-danger font-semibold' : 'text-muted'}`}>
                            {isOverspent ? `Deficit: -${formatCurrency(Math.abs(b.remaining_amount))}` : `Remaining: ${formatCurrency(b.remaining_amount)}`}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap"><ApprovalBadge status={b.status} /></td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPending && canApproveBudgets && (
                              <>
                                <Tooltip label={b.has_plan ? 'Approve budget & set Active' : 'Attach a budget plan before approving'} align="start">
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(b)}
                                    disabled={!b.has_plan || actionBusyId === b.budget_id}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                  >
                                    <CheckCircle2 size={13} className={actionBusyId === b.budget_id ? 'animate-spin' : ''} />
                                    <span>{actionBusyId === b.budget_id ? 'Approving…' : 'Approve'}</span>
                                  </button>
                                </Tooltip>
                                <Tooltip label="Reject budget" align="start">
                                  <button
                                    type="button"
                                    onClick={() => openReject(b)}
                                    disabled={actionBusyId === b.budget_id}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                  >
                                    <XCircle size={13} />
                                    <span>Reject</span>
                                  </button>
                                </Tooltip>
                                {!b.has_plan && (
                                  <Tooltip label="Attach budget plan" align="start">
                                    <button type="button" onClick={() => setUploadTarget(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                      <Paperclip size={15} />
                                    </button>
                                  </Tooltip>
                                )}
                              </>
                            )}
                            {b.has_plan && (
                              <>
                                <Tooltip label="View current plan" align="start">
                                  <button type="button" onClick={() => handleViewPlan(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                    <FileText size={15} />
                                  </button>
                                </Tooltip>
                                <Tooltip label="View plan history" align="start">
                                  <button type="button" onClick={() => setHistoryTarget(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                    <History size={15} />
                                  </button>
                                </Tooltip>
                              </>
                            )}
                            <Tooltip label="View full record" align="start">
                              <button type="button" onClick={() => openDetail(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                <Info size={15} />
                              </button>
                            </Tooltip>
                            {!b.deleted_at && (
                            <Tooltip label="Print budget report" align="start">
                              <button type="button" onClick={() => handlePrint(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                <Printer size={15} />
                              </button>
                            </Tooltip>
                            )}
                            {canManageBudgets && b.status !== 'Active' && !b.deleted_at && (
                              <Tooltip label="Edit budget" align="start">
                                <button type="button" onClick={() => openEdit(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                  <Pencil size={15} />
                                </button>
                              </Tooltip>
                            )}
                            {isAdmin && (
                              <Tooltip label={b.deleted_at ? 'Restore budget' : 'Archive budget'} align="end">
                                <button type="button" onClick={() => handleArchiveToggle(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                                  {b.deleted_at ? <RotateCcw size={15} /> : <Archive size={15} />}
                                </button>
                              </Tooltip>
                            )}
                            {b.deleted_at && (
                              <>
                              <RetentionCountdown deletedAt={b.deleted_at} compact />
                              {isAdmin && (
                                <DeletePermanentButton
                                  endpoint={`/api/budgets/${b.budget_id}/permanent`}
                                  label="budget"
                                  name={b.budget_name || ''}
                                  onDeleted={() => { fetchBudgets(); fetchStats() }}
                                />
                              )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              total={meta.total}
              label="budgets"
              showRange
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              bordered
            />
          </div>
        </div>
      )}

      {/* ── TAB 2: DEDICATED UTILIZATION & HEALTH TRACKER ─────────────── */}
      {activeTab === 'tracker' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Health Distribution Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted mr-1">Filter by Health:</span>
            <button
              type="button"
              onClick={() => setTrackerHealthFilter('all')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer active:scale-95 ${
                trackerHealthFilter === 'all'
                  ? 'border-primary bg-primary/10 text-primary-dark dark:text-primary-light shadow-sm ring-1 ring-primary/30'
                  : 'border-border bg-surface text-muted hover:bg-muted/10 hover:text-ink hover:border-muted/50 hover:shadow-sm'
              }`}
            >
              All Active ({healthDistribution.total})
            </button>
            <button
              type="button"
              onClick={() => setTrackerHealthFilter('healthy')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer active:scale-95 ${
                trackerHealthFilter === 'healthy'
                  ? 'border-status-success-border bg-status-success-bg text-status-success shadow-sm ring-1 ring-status-success-border'
                  : 'border-border bg-surface text-muted hover:bg-status-success-bg hover:text-status-success hover:border-status-success-border hover:shadow-sm'
              }`}
            >
              <CheckCircle2 size={13} className={trackerHealthFilter === 'healthy' ? 'text-status-success' : 'text-status-success'} />
              Healthy ({healthDistribution.healthy})
            </button>
            <button
              type="button"
              onClick={() => setTrackerHealthFilter('warning')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer active:scale-95 ${
                trackerHealthFilter === 'warning'
                  ? 'border-status-warning-border bg-status-warning-bg text-status-warning shadow-sm ring-1 ring-status-warning-border'
                  : 'border-border bg-surface text-muted hover:bg-status-warning-bg hover:text-status-warning hover:border-status-warning-border hover:shadow-sm'
              }`}
            >
              <Clock size={13} className={trackerHealthFilter === 'warning' ? 'text-status-warning' : 'text-status-warning'} />
              Near Limit ({healthDistribution.warning})
            </button>
            <button
              type="button"
              onClick={() => setTrackerHealthFilter('over')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer active:scale-95 ${
                trackerHealthFilter === 'over'
                  ? 'border-status-danger-border bg-status-danger-bg text-status-danger shadow-sm ring-1 ring-status-danger-border'
                  : 'border-border bg-surface text-muted hover:bg-status-danger-bg hover:text-status-danger hover:border-status-danger-border hover:shadow-sm'
              }`}
            >
              <AlertTriangle size={13} className={trackerHealthFilter === 'over' ? 'text-status-danger' : 'text-status-danger'} />
              Over Budget ({healthDistribution.over})
            </button>
          </div>

          {/* Dedicated Tracker Filter Toolbar */}
          <div className={`${PANEL} ${PANEL_PAD}`}>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end flex-wrap">
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Search</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
                  <input
                    type="text"
                    value={trackerSearch}
                    onChange={(e) => setTrackerSearch(e.target.value)}
                    placeholder="Search active budgets by name, code, or department..."
                    className={`${INPUT} pl-9 pr-9`}
                    style={{ ...INPUT_TEXT_STYLE, minWidth: 0 }}
                    autoComplete="off"
                  />
                  {trackerSearch && (
                    <button type="button" onClick={() => setTrackerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-border hover:text-ink transition-colors duration-150">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              {/* Department Filter */}
              <div className="w-full sm:w-52 shrink-0">
                <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Department</label>
                <select
                  value={trackerDeptFilter}
                  onChange={(e) => setTrackerDeptFilter(e.target.value)}
                  className={INPUT}
                  style={INPUT_TEXT_STYLE}
                >
                  <option value="all">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={String(d.id)}>{d.department_name}</option>
                  ))}
                </select>
              </div>
              {/* View Mode Switcher (Cards vs Table) */}
              <div className="shrink-0">
                <div className="flex items-center rounded-lg border border-border bg-bg p-0.5">
                  <button
                    type="button"
                    onClick={() => setTrackerViewMode('cards')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      trackerViewMode === 'cards'
                        ? 'bg-surface text-primary shadow-sm'
                        : 'text-muted hover:text-ink'
                    }`}
                    title="Cards Visualizer"
                  >
                    <LayoutGrid size={14} />
                    <span>Cards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackerViewMode('table')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      trackerViewMode === 'table'
                        ? 'bg-surface text-primary shadow-sm'
                        : 'text-muted hover:text-ink'
                    }`}
                    title="Table Comparison"
                  >
                    <List size={14} />
                    <span>Table</span>
                  </button>
                </div>
              </div>
              {/* Reset */}
              {(trackerSearch || trackerDeptFilter !== 'all') && (
                <div className="shrink-0">
                  <Button variant="secondary" size="sm" icon={RotateCcw} iconPosition="left" onClick={() => { setTrackerSearch(''); setTrackerDeptFilter('all') }}>Reset</Button>
                </div>
              )}
            </div>
          </div>

          {/* Cards View */}
          {trackerViewMode === 'cards' && (
            trackerBudgets.length === 0 ? (
              <div className={`${PANEL} p-12 text-center text-muted space-y-2`}>
                <Activity size={32} className="mx-auto text-muted/50" />
                <p className="text-sm font-semibold text-ink">No active budgets match your filters.</p>
                <p className="text-xs text-muted">Try clearing the search or changing the health status.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {trackerBudgets.map((b) => (
                  <BudgetHealthCard
                    key={b.budget_id}
                    budget={b}
                    onOpenDetail={openDetail}
                    onPrint={handlePrint}
                  />
                ))}
              </div>
            )
          )}

          {/* Table View */}
          {trackerViewMode === 'table' && (
            <div className={PANEL}>
              <div className="overflow-hidden rounded-t-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Department & Budget</th>
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Ceiling</th>
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Used / Spent</th>
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Remaining Balance</th>
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Utilization & Health</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackerBudgets.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No active budgets match your filters.</td></tr>
                    ) : (
                      trackerBudgets.map((b) => {
                        const m = getBudgetMetrics(b)
                        return (
                          <tr key={b.budget_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                            <td className="px-4 py-3.5">
                              <p className="font-medium text-ink">{b.budget_name}</p>
                              <p className="text-xs text-muted">{b.department_name || '—'} · {b.budget_code} · FY{b.fiscal_year}</p>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-ink tabular-nums">{formatCurrency(m.allocated)}</td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium text-ink tabular-nums">{formatCurrency(m.used)}</td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums">
                              <span className={m.isOver ? 'text-status-danger font-bold' : 'text-status-success'}>
                                {m.remaining < 0 ? `-${formatCurrency(Math.abs(m.remaining))} (Deficit)` : formatCurrency(m.remaining)}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <TableUtilizationCell budget={b} />
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip label="View full record" align="start">
                                  <button type="button" onClick={() => openDetail(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 cursor-pointer">
                                    <Info size={15} />
                                  </button>
                                </Tooltip>
                                <Tooltip label="Print budget report" align="start">
                                  <button type="button" onClick={() => handlePrint(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 cursor-pointer">
                                    <Printer size={15} />
                                  </button>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={modalMode !== null}
        onClose={closeModal}
        title={isEditing ? 'Edit Budget' : 'Add Budget'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={saving || (modalMode === 'add' && (!planFile || Boolean(duplicateBudgetWarning) || Boolean(duplicateNameWarning) || Boolean(duplicateCodeWarning)))}
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Budget'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {serverError && (
            <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{serverError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Department {!isEditing && <span className="text-status-danger">*</span>}</label>
              {isEditing ? (
                <div className={INPUT_LOCKED}><span className="truncate">{modalMode.department_name || '—'}</span></div>
              ) : (
                <>
                  <select
                    value={form.department_id}
                    onChange={(e) => {
                      const deptId = e.target.value
                      setFieldErrors((fe) => ({ ...fe, department_id: '', fiscal_year: '', budget_code: '' }))
                      setForm((f) => {
                        const nextCode = codeIsAuto && deptId ? generateBudgetCode(deptId, f.fiscal_year, f.budget_type) : f.budget_code
                        return { ...f, department_id: deptId, budget_code: nextCode }
                      })
                    }}
                    className={`${INPUT} ${fieldErrors.department_id ? 'border-status-danger-border' : ''}`}
                    style={INPUT_TEXT_STYLE}
                  >
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d.department_id || d.id} value={d.department_id || d.id}>
                        {d.department_name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.department_id && <p className="mt-1 text-xs text-status-danger">{fieldErrors.department_id}</p>}
                </>
              )}
            </div>
            <div>
              <label className={LABEL}>Fiscal Year {!isEditing && <span className="text-status-danger">*</span>}</label>
              {isEditing ? (
                <div className={INPUT_LOCKED}><span>{form.fiscal_year}</span></div>
              ) : (
                <>
                  <input
                    type="number"
                    min={CURRENT_YEAR}
                    max={MAX_FISCAL_YEAR}
                    value={form.fiscal_year}
                    onChange={(e) => handleFiscalYearChange(e.target.value)}
                    className={`${INPUT} ${fieldErrors.fiscal_year ? 'border-status-danger-border' : ''}`}
                    style={INPUT_TEXT_STYLE}
                    placeholder={String(CURRENT_YEAR)}
                  />
                  {fieldErrors.fiscal_year ? (
                    <p className="mt-1 text-xs text-status-danger">{fieldErrors.fiscal_year}</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">Must be {CURRENT_YEAR} - {MAX_FISCAL_YEAR}  -  new budgets can't be backdated to a past fiscal year.</p>
                  )}
                </>
              )}
            </div>
          </div>

          {!isEditing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={LABEL} style={{ marginBottom: 0 }}>
                    Budget Code <span className="text-status-danger">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const code = generateBudgetCode(form.department_id, form.fiscal_year, form.budget_type)
                      setForm((f) => ({ ...f, budget_code: code }))
                      setCodeIsAuto(true)
                      setFieldErrors((fe) => ({ ...fe, budget_code: '' }))
                    }}
                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary-dark font-medium transition-colors cursor-pointer"
                    title="Auto-generate budget code based on department, year, and type"
                  >
                    <Sparkles size={11} />
                    Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={form.budget_code}
                    onChange={(e) => {
                      setCodeIsAuto(false)
                      setFieldErrors((fe) => ({ ...fe, budget_code: '' }))
                      setForm((f) => ({ ...f, budget_code: e.target.value }))
                    }}
                    className={`${INPUT} ${(fieldErrors.budget_code || duplicateCodeWarning) ? 'border-status-danger-border' : ''}`}
                    style={INPUT_TEXT_STYLE}
                    placeholder="e.g. BUD-2026-FIN-OP"
                  />
                  {codeIsAuto && form.budget_code && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded pointer-events-none">
                      Auto
                    </span>
                  )}
                </div>
                {fieldErrors.budget_code && <p className="mt-1 text-xs text-status-danger">{fieldErrors.budget_code}</p>}
                {!fieldErrors.budget_code && duplicateCodeWarning && (
                  <p className="mt-1 text-xs text-status-warning flex items-center gap-1">
                    <AlertTriangle size={12} className="shrink-0" />
                    Code &quot;{duplicateCodeWarning.budget_code}&quot; is already in use.
                  </p>
                )}
              </div>
              <div>
                <label className={LABEL}>Budget Type <span className="text-status-danger">*</span></label>
                <select
                  value={form.budget_type}
                  onChange={(e) => {
                    const val = e.target.value
                    setFieldErrors((fe) => ({ ...fe, budget_type: '', budget_type_other: '' }))
                    setForm((f) => {
                      const nextCode = codeIsAuto && f.department_id ? generateBudgetCode(f.department_id, f.fiscal_year, val) : f.budget_code
                      return {
                        ...f,
                        budget_type: val,
                        budget_code: nextCode,
                        budget_type_other: val === 'Other' ? f.budget_type_other : '',
                      }
                    })
                  }}
                  className={`${INPUT} ${fieldErrors.budget_type ? 'border-status-danger-border' : ''}`}
                  style={INPUT_TEXT_STYLE}
                >
                  <option value="">Select type</option>
                  {BUDGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {fieldErrors.budget_type && <p className="mt-1 text-xs text-status-danger">{fieldErrors.budget_type}</p>}
              </div>
            </div>
          )}

          {/* Optimized Custom Budget Type Specification Container */}
          {!isEditing && form.budget_type === 'Other' && (
            <div className="rounded-xl border border-primary/25 bg-linear-to-r from-primary/5 via-primary/2 to-transparent p-3.5 space-y-2 animate-fadeIn shadow-xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-ink dark:text-white flex items-center gap-1.5">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold">✎</span>
                  Specify Custom Budget Type <span className="text-status-danger">*</span>
                </label>
                <span className="text-[10px] text-muted">Max 100 characters</span>
              </div>
              <input
                type="text"
                autoFocus
                value={form.budget_type_other}
                onChange={(e) => {
                  setFieldErrors((fe) => ({ ...fe, budget_type_other: '' }))
                  setForm((f) => ({ ...f, budget_type_other: e.target.value }))
                }}
                className={`${INPUT} ${fieldErrors.budget_type_other ? 'border-status-danger-border' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="e.g. Research & Development, IT Infrastructure, Training & Seminar"
                maxLength={100}
              />
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Enter a descriptive category name for this budget.</span>
                <span>{form.budget_type_other?.length || 0}/100</span>
              </div>
              {fieldErrors.budget_type_other && (
                <p className="text-xs text-status-danger">{fieldErrors.budget_type_other}</p>
              )}
            </div>
          )}

          {/* Duplicate Budget Warning Banner */}
          {!isEditing && duplicateBudgetWarning && (
            <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-3 text-xs text-status-warning flex items-start gap-2.5 animate-fadeIn">
              <AlertTriangle size={16} className="text-status-warning shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="font-bold">Existing {duplicateBudgetWarning.budget_type} Budget Detected for FY{form.fiscal_year}</p>
                <p className="text-xs">
                  This department already has an active <strong className="font-semibold">{duplicateBudgetWarning.budget_type}</strong> budget for FY{form.fiscal_year}:
                  <br />
                  <span className="font-semibold text-ink dark:text-white">
                    {duplicateBudgetWarning.budget_name} ({duplicateBudgetWarning.budget_code})
                  </span>
                  {' '}Allocated: {formatCurrency(duplicateBudgetWarning.allocated_amount)}
                </p>
                <p className="text-[11px] text-status-warning">
                  A department can have multiple budgets for different purposes (e.g. Capital, Project, Operational), but duplicate budgets of the same type are not permitted in the same fiscal year.
                </p>
              </div>
            </div>
          )}

          {!isEditing && (
            <div>
              <label className={LABEL}>Budget Name <span className="text-status-danger">*</span></label>
              <input
                type="text"
                value={form.budget_name}
                onChange={(e) => {
                  setFieldErrors((fe) => ({ ...fe, budget_name: '' }))
                  setForm((f) => ({ ...f, budget_name: e.target.value }))
                }}
                className={`${INPUT} ${(fieldErrors.budget_name || duplicateNameWarning) ? 'border-status-danger-border' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="e.g. IT Infrastructure FY2026"
              />
              {fieldErrors.budget_name && <p className="mt-1 text-xs text-status-danger">{fieldErrors.budget_name}</p>}
              {!fieldErrors.budget_name && duplicateNameWarning && (
                <p className="mt-1 text-xs text-status-warning flex items-center gap-1">
                  <AlertTriangle size={12} className="shrink-0" />
                  A budget named &quot;{duplicateNameWarning.budget_name}&quot; already exists for FY{form.fiscal_year}.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Allocated Amount <span className="text-status-danger">*</span></label>
              <input
                type="number"
                min={MIN_INVOICE_AMOUNT}
                step="any"
                value={form.allocated_amount}
                onChange={(e) => {
                  const val = e.target.value
                  setFieldErrors((fe) => ({ ...fe, allocated_amount: '' }))
                  setForm((f) => ({ ...f, allocated_amount: val }))
                  if (val === '') {
                    setAmountError('')
                  } else if (Number(val) < 0) {
                    setAmountError('Allocated amount cannot be negative.')
                  } else if (Number(val) < MIN_INVOICE_AMOUNT) {
                    setAmountError(`Allocated amount must be at least ${formatCurrency(MIN_INVOICE_AMOUNT)}.`)
                  } else {
                    setAmountError('')
                  }
                }}
                className={`${INPUT} ${(amountError || fieldErrors.allocated_amount) ? 'border-status-danger-border' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder={minHint(MIN_INVOICE_AMOUNT)}
              />
              {(amountError || fieldErrors.allocated_amount) && (
                <p className="mt-1 text-xs text-status-danger">{amountError || fieldErrors.allocated_amount}</p>
              )}
            </div>
            <div>
              <label className={LABEL}>Warning % (optional)</label>
              <input
                type="number"
                min="1"
                max="100"
                value={form.warning_percentage}
                onChange={(e) => {
                  setFieldErrors((fe) => ({ ...fe, warning_percentage: '' }))
                  setForm((f) => ({ ...f, warning_percentage: e.target.value }))
                }}
                className={`${INPUT} ${fieldErrors.warning_percentage ? 'border-status-danger-border' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="e.g. 80"
              />
              {fieldErrors.warning_percentage && <p className="mt-1 text-xs text-status-danger">{fieldErrors.warning_percentage}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Start Date <span className="text-status-danger">*</span></label>
              <input
                type="date"
                value={form.start_date}
                min="2017-01-01"
                max={dateBounds.max}
                onChange={(e) => handleStartDateChange(e.target.value)}
                onBlur={(e) => validateDate('start_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${(fieldErrors.start_date || dateErrors.start_date) ? 'border-status-danger-border' : ''}`}
                style={INPUT_TEXT_STYLE}
              />
              {(fieldErrors.start_date || dateErrors.start_date) ? (
                <p className="mt-1 text-xs text-status-danger">{fieldErrors.start_date || dateErrors.start_date}</p>
              ) : (
                <p className="mt-1 text-[11px] text-muted">Must fall within fiscal year {isEditing ? modalMode.fiscal_year : (form.fiscal_year || '—')}.</p>
              )}
            </div>
            <div>
              <label className={LABEL}>End Date <span className="text-status-danger">*</span></label>
              <input
                type="date"
                value={form.end_date}
                min="2017-01-01"
                max={dateBounds.max}
                onChange={(e) => {
                  setFieldErrors((fe) => ({ ...fe, end_date: '' }))
                  setForm((f) => ({ ...f, end_date: e.target.value }))
                }}
                onBlur={(e) => validateDate('end_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${(fieldErrors.end_date || dateErrors.end_date) ? 'border-status-danger-border' : ''}`}
                style={INPUT_TEXT_STYLE}
              />
              {(fieldErrors.end_date || dateErrors.end_date) && (
                <p className="mt-1 text-xs text-status-danger">{fieldErrors.end_date || dateErrors.end_date}</p>
              )}
            </div>
          </div>

          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="Optional notes" />
          </div>

          {/* Budget Plan  -  required file picker when adding; when editing,
              shows what's currently attached (if anything) plus an
              optional "replace" picker. Editing is only reachable while
              status === 'Draft' (see openEdit's guard and
              BudgetService::update()'s own check), so a Draft budget here
              may or may not have a plan yet either way. */}
          <div>
            <label className={LABEL}>
              Budget Plan {!isEditing && <span className="text-status-danger">*</span>}
            </label>

            {isEditing && modalMode.has_plan && !editPlanFile && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs text-ink">
                  <FileText size={13} className="text-muted" />
                  Current plan on file
                </span>
                <button type="button" onClick={() => handleViewPlan(modalMode)} className="shrink-0 text-xs font-medium text-primary hover:underline">
                  View
                </button>
              </div>
            )}

            {/* Shown here, not just via pageNotice, because pageNotice
                renders in the page body  -  which this modal is sitting on
                top of and hiding. Without a copy inside the modal itself,
                a "downloaded instead of previewed" result from clicking
                View above is invisible until the modal is closed. */}
            {isEditing && viewNotice && (
              <div className="mb-2 rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
                {viewNotice}
              </div>
            )}

            {!(isEditing ? editPlanFile : planFile) ? (
              <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-3 text-xs text-amber-700 cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors duration-150 dark:border-amber-500/30 dark:bg-amber-500/5 dark:text-amber-400 dark:hover:bg-amber-500/10">
                <Paperclip size={14} />
                {isEditing
                  ? (modalMode.has_plan ? 'Replace plan (PDF, Word, or Excel  -  up to 10MB)' : 'Attach plan (PDF, Word, or Excel  -  up to 10MB)')
                  : 'Attach plan (PDF, Word, or Excel  -  up to 10MB)'}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (isEditing) {
                      handlePlanFileChange(f, setEditPlanFile, setEditPlanFileError)
                    } else {
                      handlePlanFileChange(f, setPlanFile, setPlanFileError)
                    }
                  }}
                />
              </label>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2">
                <span className="truncate text-xs text-ink" title={(isEditing ? editPlanFile : planFile).name}>
                  {(isEditing ? editPlanFile : planFile).name}
                </span>
                <button
                  type="button"
                  onClick={() => (isEditing ? setEditPlanFile(null) : setPlanFile(null))}
                  className="shrink-0 text-xs font-medium text-muted hover:text-ink"
                >
                  Remove
                </button>
              </div>
            )}

            {(fieldErrors.plan_file || (isEditing ? editPlanFileError : planFileError)) && (
              <p className="mt-1 text-xs text-status-danger">{fieldErrors.plan_file || (isEditing ? editPlanFileError : planFileError)}</p>
            )}

            <p className="mt-1 text-xs text-muted">
              {isEditing
                ? (editPlanFile
                    ? 'This adds a new version  -  the current file stays available in Plan History.'
                    : 'Optional  -  pick a file only if you want to replace the current plan.')
                : 'Required  -  a budget cannot be created without its plan attached.'}
            </p>
          </div>

          {!isEditing && (
            <p className="text-xs text-muted">New budgets start as <span className="font-medium text-ink">Draft</span> and await approval.</p>
          )}

          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <DetailRow label="Remaining amount" value={formatCurrency(modalMode.remaining_amount)} />
              <DetailRow label="Approval status" value={<ApprovalBadge status={modalMode.status} />} />
              <DetailRow label="Created by" value={modalMode.created_by_name || '—'} />
              <DetailRow label="Created at" value={formatDateTime(modalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(modalMode.updated_at)} />
            </div>
          )}
        </form>
      </Modal>

      {/* Reject reason modal */}
      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Reject Budget"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="danger" size="md" icon={XCircle} onClick={confirmReject} loading={actionBusyId === rejectTarget?.budget_id}>
              Reject Budget
            </Button>
          </>
        }
      >
        {rejectTarget && (
          <p className="mb-3 text-sm text-muted">
            Rejecting <span className="font-medium text-ink">{rejectTarget.budget_name}</span>{' '}
            <span className="text-xs">({rejectTarget.budget_code})</span>. This will set the status to{' '}
            <span className="font-medium text-ink">Cancelled</span>.
          </p>
        )}
        <label className={LABEL}>Reason (optional)</label>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-bg text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          style={INPUT_TEXT_STYLE}
          placeholder="Explain why this budget is being rejected..."
          maxLength={2000}
        />
      </Modal>

      {/* Attach budget plan modal */}
      <BudgetPlanUploadModal
        open={!!uploadTarget}
        onClose={() => setUploadTarget(null)}
        budget={uploadTarget}
        onUpload={async (file) => {
          const result = await uploadPlan(uploadTarget.budget_id, file)
          if (result.success) {
            fetchStats()
            setDetailRecord((prev) => (prev && prev.budget_id === uploadTarget.budget_id ? result.data : prev))
            load()
          }
          return result
        }}
      />

      {/* Budget plan version history modal */}
      <BudgetPlanHistoryModal
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        budget={historyTarget}
        fetchHistory={fetchPlanHistory}
        onView={viewPlanVersion}
      />

      {/* Detail modal */}
      <Modal
        // Hidden (not unmounted  -  detailRecord itself is untouched) while
        // the History, Attach-Plan or full-screen Ledger overlay is open on
        // top of it. Both of those are triggered from buttons INSIDE this
        // modal, so without this they end up stacked behind it rather than in
        // front  -  this makes Budget Details step out of the way and reappear
        // once whichever nested modal closes, instead of fixing z-index (both
        // overlays share the same stacking context either way; the real
        // problem was two overlays being visible at once, not draw order).
        // SlideOver is z-50 vs Modal's z-60, so it genuinely would be behind.
        open={!!detailRecord && !historyTarget && !uploadTarget && !ledgerTarget}
        onClose={closeDetail}
        title="Budget Details"
        maxWidth="max-w-4xl"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && detailRecord.status === 'Draft' && canApproveBudgets && (
              <>
                <button
                  type="button"
                  onClick={() => openReject(detailRecord)}
                  disabled={actionBusyId === detailRecord?.budget_id}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <XCircle size={15} />
                  Reject
                </button>
                <Tooltip label={detailRecord.has_plan ? 'Approve budget & set Active' : 'Attach a budget plan before approving'}>
                  <Button
                    variant="primary"
                    size="md"
                    icon={CheckCircle2}
                    disabled={!detailRecord.has_plan || actionBusyId === detailRecord?.budget_id}
                    loading={actionBusyId === detailRecord?.budget_id}
                    onClick={() => handleApprove(detailRecord)}
                  >
                    Approve
                  </Button>
                </Tooltip>
              </>
            )}
            {detailRecord && detailRecord.status !== 'Draft' && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Report</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.budget_name}</p>
                <p className="text-xs text-muted">{detailRecord.department_name || '—'} · FY{detailRecord.fiscal_year} · {detailRecord.budget_code}</p>
              </div>
              <ApprovalBadge status={detailRecord.status} />
            </div>

            {viewNotice && (
              <div className="rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
                {viewNotice}
              </div>
            )}

            {detailRecord.status === 'Draft' && (
              <div className="flex items-center gap-2 rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2.5 text-xs text-status-warning">
                <AlertTriangle size={14} className="shrink-0" />
                <span>This budget is <span className="font-semibold">pending approval</span>. It cannot be used for disbursements until approved.</span>
              </div>
            )}

            {detailRecord.status === 'Draft' && !detailRecord.has_plan && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
                <span className="flex items-center gap-2"><AlertTriangle size={14} className="shrink-0" /> No budget plan attached yet.</span>
                <button type="button" onClick={() => setUploadTarget(detailRecord)} className="inline-flex items-center gap-1 font-medium underline shrink-0">
                  Attach file
                </button>
              </div>
            )}

            {/* Visual Real-Time Budget Utilization & Health Tracker Card */}
            {detailRecord.status === 'Active' && (() => {
              const m = getBudgetMetrics(detailRecord)
              return (
                <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3.5 shadow-sm">
                  {/* Alert Banner if Overbudget or Nearing Limit */}
                  {m.isOver && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-status-danger-border bg-status-danger-bg px-3.5 py-2.5">
                      <AlertTriangle size={17} className="mt-0.5 shrink-0 text-status-danger" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-status-danger">Budget Ceiling Exceeded</p>
                        <p className="text-xs text-status-danger mt-0.5">
                          Total expenditures of <strong>{formatCurrency(m.used)}</strong> exceed the allocated ceiling of <strong>{formatCurrency(m.allocated)}</strong> by <span className="font-semibold text-status-danger">{formatCurrency(Math.abs(m.remaining))}</span> ({m.displayPct}% utilized).
                        </p>
                      </div>
                    </div>
                  )}

                  {!m.isOver && m.isWarning && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-status-warning-border bg-status-warning-bg px-3.5 py-2.5">
                      <AlertTriangle size={17} className="mt-0.5 shrink-0 text-status-warning" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-status-warning">Budget Warning: Near Limit</p>
                        <p className="text-xs text-status-warning mt-0.5">
                          Utilization has reached <strong>{m.displayPct}%</strong>, exceeding the <strong>{m.warningPct}%</strong> warning threshold. Available: <strong>{formatCurrency(m.remaining)}</strong>.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 3 KPI metric tiles */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-lg border border-border bg-bg/70 p-2.5">
                      <span className="text-[11px] font-medium text-muted block">Allocated Budget</span>
                      <p className="text-sm font-bold text-ink mt-0.5 tabular-nums truncate">{formatCurrency(m.allocated)}</p>
                      <span className="text-[10px] text-muted block mt-0.5">Total approved</span>
                    </div>

                    <div className="rounded-lg border border-border bg-bg/70 p-2.5">
                      <span className="text-[11px] font-medium text-muted block">Total Utilized</span>
                      <p className={`text-sm font-bold mt-0.5 tabular-nums truncate ${m.isOver ? 'text-status-danger' : m.isWarning ? 'text-status-warning' : 'text-ink'}`}>
                        {formatCurrency(m.used)}
                      </p>
                      <span className={`text-[10px] font-medium block mt-0.5 ${m.isOver ? 'text-status-danger' : m.isWarning ? 'text-status-warning' : 'text-muted'}`}>
                        {m.displayPct}% spent
                      </span>
                    </div>

                    <div className="rounded-lg border border-border bg-bg/70 p-2.5">
                      <span className="text-[11px] font-medium text-muted block">Remaining Balance</span>
                      <p className={`text-sm font-bold mt-0.5 tabular-nums truncate ${m.remaining < 0 ? 'text-status-danger' : 'text-status-success'}`}>
                        {formatCurrency(m.remaining)}
                      </p>
                      <span className={`text-[10px] font-medium block mt-0.5 ${m.remaining < 0 ? 'text-status-danger' : 'text-status-success'}`}>
                        {m.remaining < 0 ? 'Budget deficit' : `${m.allocated > 0 ? Math.max(0, Math.round((m.remaining / m.allocated) * 100)) : 0}% left`}
                      </span>
                    </div>
                  </div>

                  {/* Visual Progress Meter */}
                  <div className="space-y-1.5 pt-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink flex items-center gap-1.5">
                        <Activity size={14} className="text-primary" />
                        Real-Time Utilization
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        m.isOver
                          ? 'bg-status-danger-bg text-status-danger border-status-danger-border'
                          : m.isWarning
                          ? 'bg-status-warning-bg text-status-warning border-status-warning-border'
                          : 'bg-status-success-bg text-status-success border-status-success-border'
                      }`}>
                        {m.healthLabel} · {m.displayPct}%
                      </span>
                    </div>

                    <div className="relative h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shadow-inner">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          m.isOver
                            ? 'bg-linear-to-r from-rose-500 to-red-600'
                            : m.isWarning
                            ? 'bg-linear-to-r from-amber-400 to-amber-500'
                            : 'bg-linear-to-r from-emerald-400 to-emerald-500'
                        }`}
                        style={{ width: `${m.barPct}%` }}
                      />
                      {m.warningPct > 0 && m.warningPct < 100 && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-slate-500/70 dark:bg-slate-300/70 z-10"
                          style={{ left: `${m.warningPct}%` }}
                          title={`Warning threshold: ${m.warningPct}%`}
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>0%</span>
                      <span className="flex items-center gap-1 font-medium text-status-warning">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-warning" />
                        Warning threshold: {m.warningPct}%
                      </span>
                      <span>100% ceiling</span>
                    </div>
                  </div>
                </div>
              )
            })()}

            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Allocated Amount" value={formatCurrency(detailRecord.allocated_amount)} />
                <DetailRow label="Used / Spent" value={formatCurrency(detailRecord.used_amount ?? (detailRecord.allocated_amount - detailRecord.remaining_amount))} />
                <DetailRow
                  label="Remaining Balance"
                  value={
                    <span className={Number(detailRecord.remaining_amount) < 0 ? 'text-status-danger font-semibold' : 'text-status-success font-medium'}>
                      {Number(detailRecord.remaining_amount) < 0 ? `-${formatCurrency(Math.abs(detailRecord.remaining_amount))} (Deficit)` : formatCurrency(detailRecord.remaining_amount)}
                    </span>
                  }
                />
                <DetailRow
                  label="Utilization Rate"
                  value={
                    detailRecord.status === 'Active' ? (
                      (() => {
                        const m = getBudgetMetrics(detailRecord)
                        return `${m.displayPct}% (${m.healthLabel})`
                      })()
                    ) : (
                      'Not yet active'
                    )
                  }
                />
                <DetailRow label="Warning Threshold" value={`${detailRecord.warning_percentage || 80}%`} />
              </div>

              {/* Explains the "Used / Spent" figure above. `used_amount` is a
                  denormalized running total, so without this the bar and the
                  number are an assertion with nothing behind them. */}
              <div className="px-3 py-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-ink">
                    <Activity size={13} className="text-primary" />
                    What Drove This Total
                  </h4>
                  <span className="text-[10px] text-muted">Transactions behind the utilization figure</span>
                </div>
                <BudgetUtilizationLedger
                  budgetId={detailRecord.budget_id ?? detailRecord.id}
                  fetchUtilization={fetchUtilization}
                  currency={getActiveCurrency()}
                  previewLimit={6}
                  onExpand={() => setLedgerTarget(detailRecord)}
                />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Budget Type" value={detailRecord.budget_type} />
                <DetailRow
                  label="Budget Plan"
                  value={
                    detailRecord.has_plan ? (
                      <span className="inline-flex items-center gap-3">
                        <button type="button" onClick={() => handleViewPlan(detailRecord)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                          <FileText size={12} /> View file
                        </button>
                        <button type="button" onClick={() => setHistoryTarget(detailRecord)} className="inline-flex items-center gap-1 font-medium text-muted hover:underline">
                          <History size={12} /> History
                        </button>
                      </span>
                    ) : (
                      <span className="text-status-warning">Not attached</span>
                    )
                  }
                />
                <DetailRow label="Remarks" value={detailRecord.remarks || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={detailRecord.created_by_name || '—'} />
                <DetailRow label="Approved by" value={detailRecord.approved_by_name || '—'} />
                <DetailRow label="Approved at" value={formatDateTime(detailRecord.approved_at)} />
                <DetailRow label="Created at" value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(detailRecord.updated_at)} />
                {detailRecord.deleted_at && <DetailRow label="Archived at" value={formatDateTime(detailRecord.deleted_at)} />}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Full-screen utilization ledger. Rendered outside the detail modal so
          the table gets the whole viewport instead of a 4xl column. */}
      <SlideOver
        open={!!ledgerTarget}
        onClose={() => setLedgerTarget(null)}
        widthClass="max-w-full"
        title={ledgerTarget ? `Utilization Ledger — ${ledgerTarget.budget_name || ledgerTarget.budget_code}` : 'Utilization Ledger'}
        subtitle={ledgerTarget ? `${ledgerTarget.budget_code} · every expense and payroll run charged against this budget` : null}
      >
        {ledgerTarget && (
          <BudgetUtilizationLedger
            budgetId={ledgerTarget.budget_id ?? ledgerTarget.id}
            fetchUtilization={fetchUtilization}
            currency={getActiveCurrency()}
          />
        )}
      </SlideOver>
    </div>
  )
}
