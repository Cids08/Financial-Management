import { PageSkeleton, ContentSkeleton } from '../components/LoadingSkeleton'
import AiLogo from '../components/AiLogo'
import { protectedDashboardPdf } from '../utils/secureExport'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  TrendingDown,
  HandCoins,
  PiggyBank,
  Download,
  Plus,
  Users,
  Truck,
  UserCheck,
  Receipt,
  CreditCard,
  Banknote,
  Wallet,
  Percent,
  FileText,
  ClipboardList,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BellRing,
  CalendarClock,
  ChevronRight,
  Activity,
  Loader2,
  CalendarRange,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import DashboardCard from '../components/DashboardCard'
import Table from '../components/Table'
import Button from '../components/Button'
import { formatCurrency, formatDate, maskedAmount, normalizeAiCurrencyText } from '../utils/formatters'
import { apiFetch } from '../utils/api'
import { useAllDataUpdates } from '../hooks/useDataUpdates'
import { usePrivacy } from '../context/PrivacyContext'
import { useProfile } from '../hooks/useProfile'
import { usePermissions } from '../context/PermissionsContext'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'

/* ---------------------------------------------------------------------- */
/* Presentation config  -  icons/colors/routes per API field, since the API */
/* returns raw numbers/labels and doesn't know about lucide-react.        */
/* ---------------------------------------------------------------------- */

const MODULE_CARD_CONFIG = [
  { key: 'total_customers', title: 'Total Customers', icon: Users, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', route: '/master-data/customers', format: 'count' },
  { key: 'total_suppliers', title: 'Total Suppliers', icon: Truck, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', route: '/master-data/suppliers', format: 'count' },
  { key: 'active_collectors', title: 'Active Collectors', icon: UserCheck, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', route: '/master-data/collectors', format: 'count' },
  { key: 'receivable', title: 'Receivable', icon: FileText, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', route: '/transactions/receivable', format: 'currency' },
  { key: 'collections_today', title: 'Collections Today', icon: HandCoins, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', route: '/transactions/collections', format: 'currency' },
  { key: 'cash_balance', title: 'Cash Balance', icon: PiggyBank, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', route: '/master-data/cash-accounts', format: 'currency' },
  { key: 'payable', title: 'Payable', icon: CreditCard, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', route: '/transactions/payable', format: 'currency' },
  { key: 'disbursements_today', title: 'Disbursements', icon: Banknote, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', route: '/transactions/disbursements', format: 'currency' },
  { key: 'tax_obligations', title: 'Tax Obligations', icon: Percent, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', route: '/transactions/tax-obligations', format: 'currency' },
  { key: 'active_budgets', title: 'Active Budgets', icon: Wallet, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', route: '/transactions/budgets', format: 'count' },
]

const OVERVIEW_CARD_CONFIG = [
  { key: 'total_revenue', title: 'Cash Collected', icon: TrendingUp, iconBg: 'bg-primary/15', route: '/reports' },
  { key: 'total_expenses', title: 'Total Expenses', icon: TrendingDown, iconBg: 'bg-red-50 dark:bg-red-500/10', route: '/transactions/expenses' },
  { key: 'available_cash', title: 'Available Cash', icon: PiggyBank, iconBg: 'bg-amber-50 dark:bg-amber-500/10', route: '/master-data/cash-accounts' },
  { key: 'net_cash_flow', title: 'Net Cash Flow', icon: Activity, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', route: '/analytics/forecasting' },
]

const CHART_ROUTES = {
  revenue_trend: '/reports',
  expense_trend: '/transactions/expenses',
  collections_trend: '/transactions/collections',
  cash_flow_trend: '/analytics/forecasting',
  budget_utilization: '/transactions/budgets',
  receivable_aging: '/transactions/receivable',
  payable_aging: '/transactions/payable',
}

const CHART_COLORS = {
  revenue: '#2563eb',
  expense: '#d97706',
  inflow: '#0d9488',
  outflow: '#d97706',
  net: '#7c3aed',
  collections: '#0d9488',
  allocated: '#2563eb',
  used: '#7c3aed',
  aging: '#2563eb',
}

const AXIS_STYLE = { fontSize: 11, fill: 'var(--color-muted, #737373)' }
const CHART_MARGIN = { top: 5, right: 24, left: 0, bottom: 0 }
const PIE_COLORS = ['#2563eb', '#0d9488', '#d97706', '#7c3aed', '#db2777']
const shortMonthTick = (label) => (typeof label === 'string' ? label.split(' ')[0] : label)

/** Compact Y-axis tick: ₱1.2M, ₱148.5K, ₱500 — prevents the full peso label from being clipped */
function compactPeso(v) {
  if (v === 0) return '₱0'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `₱${(v / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`
  if (abs >= 1_000) return `₱${(v / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`
  return `₱${v}`
}

/** Evenly-spaced tick labels (both endpoints included) for a dense series like 30 daily points. */
function evenTicks(data, count = 7) {
  if (!data || data.length === 0) return []
  if (data.length <= count) return data.map((d) => d.label)
  const step = (data.length - 1) / (count - 1)
  const indices = [...new Set(Array.from({ length: count }, (_, i) => Math.round(i * step)))]
  return indices.map((i) => data[i].label)
}
const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 12,
  border: '1px solid var(--color-border, #e5e5e5)',
  backgroundColor: 'var(--color-surface, #fff)',
  color: 'var(--color-ink, #171717)',
  boxShadow: '0 8px 24px rgb(0 0 0 / 0.1)',
}

const COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'reference', label: 'Reference No.' },
  { key: 'transaction', label: 'Transaction' },
  { key: 'party', label: 'Customer / Supplier' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
]

const APPROVAL_ICON = { expense: Receipt, budget: Wallet, disbursement: CreditCard }
const APPROVAL_BADGE = {
  Pending: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  Escalated: 'bg-status-danger-bg text-status-danger border-status-danger-border',
  Approved: 'bg-status-success-bg text-status-success border-status-success-border',
}

const DEADLINE_ICON = {
  'Due Accounts Receivable': FileText,
  'Upcoming Supplier Payment': CreditCard,
  'Tax Filing Deadline': Percent,
  'Budget Period Ending': ClipboardList,
}

const NOTIFICATION_STYLE = {
  receivable: { icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10' },
  payable: { icon: CalendarClock, color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10' },
  budget: { icon: Wallet, color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10' },
  forecast: { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10' },
  ai_recommendation: { icon: AiLogo, color: 'text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-500/10' },
}
const DEFAULT_NOTIFICATION_STYLE = { icon: BellRing, color: 'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800' }

// Insight cards lead with the AI logo, so priority is carried by a corner dot
// instead. The icons these replace encoded urgency (a red triangle for High),
// so the dot keeps that signal rather than letting branding erase it.
const INSIGHT_PRIORITY = { High: 'bg-status-danger-bg text-status-danger border-status-danger-border', Medium: 'bg-status-warning-bg text-status-warning border-status-warning-border', Low: 'bg-bg text-muted border-border' }

const FORECAST_ICON = { revenue: TrendingUp, expense: TrendingDown, expenses: TrendingDown, cash: PiggyBank }

// Each entry maps to a real create-form route for that transaction type, and
// the backend permission (see routes/api.php) required to actually submit
// that form. The menu only shows options the current user holds the
// permission for  -  otherwise they'd reach a form just to get a 403 on submit.
const NEW_TRANSACTION_OPTIONS = [
  { label: 'Receivable Invoice', icon: FileText, route: '/transactions/receivable?new=1', permission: 'ar.manage' },
  { label: 'Payable Invoice', icon: CreditCard, route: '/transactions/payable?new=1', permission: 'ap.manage' },
  { label: 'Expense', icon: Receipt, route: '/transactions/expenses?new=1', permission: 'expenses.manage' },
  { label: 'Collection', icon: HandCoins, route: '/transactions/collections?new=1', permission: 'collections.manage' },
  { label: 'Disbursement', icon: Banknote, route: '/transactions/disbursements?new=1', permission: 'disbursements.manage' },
]

/* ---------------------------------------------------------------------- */
/* Shared style tokens                                                     */
/* ---------------------------------------------------------------------- */
const PANEL = 'rounded-2xl border border-border bg-surface shadow-card'
const HIGHLIGHT_PANEL = 'rounded-2xl border border-primary/20 bg-primary/5 shadow-card'
const PANEL_PAD = 'p-4 sm:p-5'
const SECTION_TITLE = 'text-sm font-semibold tracking-tight text-ink'
const SECTION_SUBTITLE = 'text-xs text-muted'
const CLICKABLE_ROW = 'w-full text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-card'

function iconForDeadline(title) {
  return DEADLINE_ICON[title] || CalendarClock
}
function iconForForecast(target) {
  const key = (target || '').toLowerCase()
  for (const [needle, Icon] of Object.entries(FORECAST_ICON)) {
    if (key.includes(needle)) return Icon
  }
  return Target
}

function ChartCard({ title, subtitle, route, navigate, empty, contentClassName = 'h-44', children }) {
  return (
    <div
      role={route ? 'button' : undefined}
      tabIndex={route ? 0 : undefined}
      onClick={route ? () => navigate(route) : undefined}
      onKeyDown={route ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          navigate(route)
        }
      } : undefined}
      className={`${PANEL} ${PANEL_PAD} min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${route ? CLICKABLE_ROW : ''}`}
    >
      <div className="mb-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className={`mt-0.5 ${SECTION_SUBTITLE}`}>{subtitle}</p>
      </div>
      {empty ? (
        <div className={`flex ${contentClassName} items-center justify-center rounded-lg border border-dashed border-border bg-bg`}>
          <p className="text-xs font-medium text-muted">No data for this period yet.</p>
        </div>
      ) : (
        <div className={contentClassName}>{children}</div>
      )}
    </div>
  )
}

/**
 * "New Transaction" split button  -  picks a transaction type, then routes to
 * its create form. Options are filtered to whatever the current user has
 * the corresponding *.manage permission for; the whole button hides itself
 * if the user can't create any transaction type at all.
 */
function NewTransactionMenu({ navigate }) {
  const { hasPermission } = usePermissions()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  const visibleOptions = NEW_TRANSACTION_OPTIONS.filter((opt) => hasPermission(opt.permission))

  useEffect(() => {
    if (!open) return undefined
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (visibleOptions.length === 0) return null

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="primary"
        size="sm"
        icon={Plus}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        New Transaction
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {visibleOptions.map((opt) => {
            const Icon = opt.icon
            return (
              <button
                key={opt.route}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  navigate(opt.route)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-ink transition-colors duration-150 hover:bg-bg"
              >
                <Icon size={14} className="text-muted" />
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}


function DistributionChart({ items, otherLabel, privacyMode, formatCurrency }) {
  const MASKED = maskedAmount()
  const sorted = items.map(item => ({ ...item, value: Number(item.value) || 0 })).filter(item => item.value > 0).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((sum, item) => sum + item.value, 0)
  const grouped = sorted.length > 5
    ? [...sorted.slice(0, 4), { label: `Other ${otherLabel} (${sorted.length - 4})`, value: sorted.slice(4).reduce((sum, item) => sum + item.value, 0) }]
    : sorted
  const data = grouped.map(item => ({ ...item, percent: total ? Number((item.value / total * 100).toFixed(1)) : 0 }))
  if (!data.length) return <p className="py-12 text-center text-xs text-muted">No positive balances to display.</p>
  return (
    <div className="flex min-h-44 items-center gap-2">
      <div className="h-44 w-24 shrink-0 sm:w-32">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={28}
              outerRadius={44}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry, idx) => (
                <Cell key={entry.label} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [
                privacyMode ? MASKED : formatCurrency(value),
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-1.5 min-w-0 pr-1">
        {data.map((item, idx) => {
          const color = PIE_COLORS[idx % PIE_COLORS.length]
          return (
            <div
              key={item.label}
              className="flex items-center justify-between text-xs gap-1.5 min-w-0"
              title={`${item.label}: ${privacyMode ? MASKED : formatCurrency(item.value)} (${item.percent}%)`}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="min-w-0 wrap-anywhere text-[11px] font-medium text-ink">
                  {item.label}
                </span>
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-muted">
                {item.percent}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Charts load separately from the cards/lists above  -  heavier grouped
  // queries on the backend, and there's no reason the rest of the
  // dashboard should wait on them.
  const [chartData, setChartData] = useState(null)
  const [chartsLoading, setChartsLoading] = useState(true)
  const [chartsError, setChartsError] = useState(null)

  // "Export" downloads a full PDF snapshot of the dashboard from the backend.
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  // Privacy Mode  -  hides all currency figures when enabled.
  // Defaults to ON and remembers the choice between visits. The state now
  // lives in PrivacyContext (shared with the Header toggle + every other
  // page) instead of a local copy, so toggling it here or up top stays in
  // sync everywhere.
  const { privacyOn: privacyMode } = usePrivacy()

  // Which calendar year the period figures (revenue, expenses, net cash flow,
  // and the monthly trends) are scoped to. Defaults to this year; the
  // selectable list comes from the backend, which derives it from the actual
  // range of transaction dates rather than a hardcoded span.
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [availableYears, setAvailableYears] = useState([])
  // Guards against out-of-order responses when the year is switched quickly:
  // each in-flight request captures the year it was fired for; if the user
  // has moved on by the time it resolves, the stale payload is dropped.
  const yearRef = useRef(year)
  useEffect(() => { yearRef.current = year }, [year])

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiFetch(`/api/dashboard?year=${year}`)
      .then((res) => res.json())
      .then((json) => {
        if (yearRef.current !== year) return
        setData(json.data)
        if (json.data?.available_years?.length) setAvailableYears(json.data.available_years)
      })
      .catch(() => setError('Could not load the dashboard. Please try again.'))
      .finally(() => setLoading(false))
  }, [year])

  useEffect(() => {
    setChartsLoading(true)
    setChartsError(null)
    apiFetch(`/api/dashboard/charts?year=${year}`)
      .then((res) => res.json())
      .then((json) => {
        if (yearRef.current !== year) return
        setChartData(json.data)
      })
      .catch(() => setChartsError('Could not load charts.'))
      .finally(() => setChartsLoading(false))
  }, [year])

  // Live updates: the dashboard aggregates every module, so any data.updated
  // event on the shared channel triggers a silent refetch of both the KPIs
  // and the charts  -  no manual refresh required.
  const refresh = useCallback(() => {
    setLoading(true)
    apiFetch(`/api/dashboard?year=${year}`)
      .then((res) => res.json())
      .then((json) => {
        if (yearRef.current === year) setData(json.data)
      })
      .catch(() => setError('Could not load the dashboard. Please try again.'))
      .finally(() => setLoading(false))

    setChartsLoading(true)
    apiFetch(`/api/dashboard/charts?year=${year}`)
      .then((res) => res.json())
      .then((json) => {
        if (yearRef.current === year) setChartData(json.data)
      })
      .catch(() => setChartsError('Could not load charts.'))
      .finally(() => setChartsLoading(false))
  }, [year])

  useAllDataUpdates(refresh)

  const handleModuleClick = (route) => {
    if (route) navigate(route)
  }

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const res = await protectedDashboardPdf(`/api/dashboard/export?year=${year}`)
      if (!res) return
      if (!res.ok) throw new Error('Export request failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dashboard-summary-${year}-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setExportError('Could not export the dashboard. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="space-y-6"><Breadcrumb items={['Dashboard']} /><PageSkeleton /></div>

  if (error || !data) {
    return (
      <div className="space-y-5 animate-fadeIn">
        <Breadcrumb items={['Dashboard']} />
        <div className="flex items-center gap-2 rounded-lg border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
          <AlertTriangle size={15} className="shrink-0" />
          {error || 'Something went wrong loading the dashboard.'}
        </div>
      </div>
    )
  }

  const {
    overview = {},
    module_cards: moduleCardValues = {},
    recent_transactions: transactions = [],
    pending_approvals: approvals = [],
    upcoming_deadlines: deadlines = [],
    notifications = [],
    ai_insights: aiInsights = [],
    forecast_summary: forecastSummary = [],
  } = data

  const MASKED = maskedAmount()

  // Chart helpers respect Privacy Mode too  -  otherwise the Y-axis ticks and
  // hover tooltips would still leak the real figures the cards are hiding.
  const chartTick = (v) => (privacyMode ? '•••' : compactPeso(v))
  const chartTooltip = (v) => (privacyMode ? MASKED : formatCurrency(v))

  const overviewCards = OVERVIEW_CARD_CONFIG.map((cfg) => {
    const entry = overview[cfg.key] || {}
    return {
      title: cfg.title,
      value: privacyMode ? MASKED : formatCurrency(entry.value || 0),
      icon: cfg.icon,
      trend: entry.trend,
      trendLabel: cfg.key === 'available_cash' ? 'Current balance' : `vs. ${year - 1}`,
      trendPreference: cfg.key === 'total_expenses' ? 'decrease' : 'increase',
      iconBg: cfg.iconBg,
      route: cfg.route,
    }
  })

  const moduleCards = MODULE_CARD_CONFIG.map((cfg) => ({
    title: cfg.title,
    value: cfg.format === 'currency'
      ? (privacyMode ? MASKED : formatCurrency(moduleCardValues[cfg.key] || 0))
      : String(moduleCardValues[cfg.key] ?? 0),
    icon: cfg.icon,
    iconBg: cfg.iconBg,
    iconColor: cfg.iconColor,
    route: cfg.route,
  }))


  return (
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb items={['Dashboard']} />

      {/* 1. Welcome section */}
      <div className={`${PANEL} relative flex flex-col gap-5 border-t-4 border-t-primary p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between`}>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-dark">Your financial workspace</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Welcome back{profile?.name ? `, ${[profile.role, profile.name.split(' ')[0]].filter(Boolean).join('-')}` : ''}!
          </h1>
          <p className="mt-2 text-sm text-muted">A clear view of your business, at a glance.</p>
          {exportError && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle size={12} className="shrink-0" /> {exportError}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2">
            <CalendarRange size={14} className="shrink-0 text-muted" />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Dashboard year"
              className="h-9 cursor-pointer bg-transparent pr-1 text-sm font-medium text-ink focus:outline-none"
            >
              {(availableYears.length ? availableYears : [year]).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
          <NewTransactionMenu navigate={navigate} />
        </div>
      </div>

      {/* Financial overview */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className={SECTION_TITLE}>Financial Overview</h2>
          <p className={SECTION_SUBTITLE}>
            Cash collected, expenses &amp; net cash flow for {year} (vs. {year - 1}) &middot; available cash is a live balance
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => (
            <DashboardCard
              key={card.title}
              {...card}
              onClick={card.route ? () => navigate(card.route) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Approvals, Deadlines, Notifications */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className={`${PANEL} ${PANEL_PAD}`}>
          <h2 className={`mb-3 ${SECTION_TITLE}`}>Pending Approvals</h2>
          {approvals.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">Nothing awaiting approval.</p>
          ) : (
            <div className="space-y-2">
              {approvals.map((item, idx) => {
                const Icon = APPROVAL_ICON[item.type] || ClipboardList
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-left ${CLICKABLE_ROW}`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary-dark">
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">{item.title}</p>
                        <p className="text-[11px] text-muted">Submitted {item.date}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${APPROVAL_BADGE[item.status] || APPROVAL_BADGE.Pending}`}>
                      {item.status}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className={`${PANEL} ${PANEL_PAD}`}>
          <h2 className={`mb-3 ${SECTION_TITLE}`}>Upcoming Deadlines</h2>
          {deadlines.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">No deadlines in the next 30 days.</p>
          ) : (
            <div className="space-y-2">
              {deadlines.map((item, idx) => {
                const Icon = iconForDeadline(item.title)
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className={`flex w-full items-start justify-between gap-2 rounded-lg border border-border p-2.5 text-left ${CLICKABLE_ROW}`}
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary-dark">
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">{item.title}</p>
                        <p className="truncate text-[11px] text-muted">{item.detail}</p>
                      </div>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-ink">{formatDate(item.date)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className={`${PANEL} ${PANEL_PAD}`}>
          <div className="mb-3 flex items-center gap-2">
            <BellRing size={16} className="text-muted" />
            <h2 className={SECTION_TITLE}>Notifications</h2>
          </div>
          {notifications.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">You're all caught up.</p>
          ) : (
            <div className="divide-y divide-border">
              {notifications.slice(0, 4).map((note, idx) => {
                const style = NOTIFICATION_STYLE[note.type] || DEFAULT_NOTIFICATION_STYLE
                const Icon = style.icon
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => navigate(note.route)}
                    className="flex w-full items-start gap-2.5 py-2 text-left transition-colors duration-150 hover:bg-bg first:pt-0 last:pb-0"
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${style.color}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink">{note.text}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                        <Clock size={11} /> {note.time}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Module cards */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className={SECTION_TITLE}>Modules</h2>
          <span className={SECTION_SUBTITLE}>Tap a card to open</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {moduleCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.title}
                type="button"
                onClick={() => handleModuleClick(card.route)}
                className={`group relative flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center ${PANEL} p-3 text-left ${CLICKABLE_ROW}`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                  <Icon size={14} className={card.iconColor} />
                </div>
                <div className="min-w-0 w-full flex-1">
                  <p className="truncate text-xs font-medium text-muted">{card.title}</p>
                  <p className="text-sm font-bold tabular-nums break-words text-ink">{card.value}</p>
                </div>
                <ChevronRight
                  size={14}
                  className="absolute right-3 top-4 sm:static shrink-0 text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:text-primary"
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Charts section  -  real data from /api/dashboard/charts */}
      <div>
        <h2 className={`mb-2 ${SECTION_TITLE}`}>Charts &amp; Trends</h2>

        {chartsError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
            <AlertTriangle size={15} className="shrink-0" />
            {chartsError}
          </div>
        )}

        {chartsLoading ? (
          <ContentSkeleton rows={5} />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Revenue Trend" subtitle={`${year}, monthly`} route={CHART_ROUTES.revenue_trend} navigate={navigate} empty={!chartData?.revenue_trend?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData?.revenue_trend} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} tickFormatter={shortMonthTick} />
                  <YAxis domain={[0, (dataMax) => (dataMax > 0 ? dataMax : 1)]} allowDecimals={false} tick={AXIS_STYLE} tickFormatter={chartTick} width={62} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={chartTooltip} />
                  <Line type="monotone" dataKey="value" name="Revenue" stroke={CHART_COLORS.revenue} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Expense Trend" subtitle={`${year}, monthly`} route={CHART_ROUTES.expense_trend} navigate={navigate} empty={!chartData?.expense_trend?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData?.expense_trend} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} tickFormatter={shortMonthTick} />
                  <YAxis domain={[0, (dataMax) => (dataMax > 0 ? dataMax : 1)]} allowDecimals={false} tick={AXIS_STYLE} tickFormatter={chartTick} width={62} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={chartTooltip} />
                  <Line type="monotone" dataKey="value" name="Expenses" stroke={CHART_COLORS.expense} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Collections Trend" subtitle="Daily, 30 days" route={CHART_ROUTES.collections_trend} navigate={navigate} empty={!chartData?.collections_trend?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData?.collections_trend} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} ticks={evenTicks(chartData?.collections_trend, 7)} />
                  <YAxis domain={[0, (dataMax) => (dataMax > 0 ? dataMax : 1)]} allowDecimals={false} tick={AXIS_STYLE} tickFormatter={chartTick} width={62} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={chartTooltip} />
                  <Area type="monotone" dataKey="value" name="Collected" stroke={CHART_COLORS.collections} fill={CHART_COLORS.collections} fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Cash Flow" subtitle="Inflow vs. outflow" route={CHART_ROUTES.cash_flow_trend} navigate={navigate} empty={!chartData?.cash_flow_trend?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.cash_flow_trend} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} tickFormatter={shortMonthTick} />
                  <YAxis domain={[0, (dataMax) => (dataMax > 0 ? dataMax : 1)]} allowDecimals={false} tick={AXIS_STYLE} tickFormatter={chartTick} width={62} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={chartTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => (value?.length > 16 ? `${value.slice(0, 14)}…` : value)} />
                  <Bar dataKey="inflow" name="Inflow" fill={CHART_COLORS.inflow} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="outflow" name="Outflow" fill={CHART_COLORS.outflow} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Cash Account Distribution"
              subtitle="Available cash by account"
              route="/master-data/cash-accounts"
              navigate={navigate}
              empty={!chartData?.cash_distribution?.length}
              contentClassName="min-h-44"
            >
              <DistributionChart items={chartData?.cash_distribution || []} otherLabel="accounts" privacyMode={privacyMode} formatCurrency={formatCurrency} />
            </ChartCard>

            <ChartCard title="Expenses by Category" subtitle={String(year)} route={CHART_ROUTES.expense_trend} navigate={navigate} empty={!chartData?.expense_breakdown?.length} contentClassName="min-h-44">
              <DistributionChart items={chartData?.expense_breakdown || []} otherLabel="categories" privacyMode={privacyMode} formatCurrency={formatCurrency} />
            </ChartCard>

            <ChartCard title="Budget Utilization" subtitle="By department" route={CHART_ROUTES.budget_utilization} navigate={navigate} empty={!chartData?.budget_utilization?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.budget_utilization} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} angle={-15} textAnchor="end" height={40} />
                  <YAxis domain={[0, (dataMax) => (dataMax > 0 ? dataMax : 1)]} allowDecimals={false} tick={AXIS_STYLE} tickFormatter={chartTick} width={62} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={chartTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => (value?.length > 16 ? `${value.slice(0, 14)}…` : value)} />
                  <Bar dataKey="allocated" name="Allocated" fill={CHART_COLORS.allocated} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="used" name="Used" fill={CHART_COLORS.used} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Receivable Aging" subtitle="0-30 / 31-60 / 61-90 / 90+" route={CHART_ROUTES.receivable_aging} navigate={navigate} empty={!chartData?.receivable_aging?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.receivable_aging} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} />
                  <YAxis domain={[0, (dataMax) => (dataMax > 0 ? dataMax : 1)]} allowDecimals={false} tick={AXIS_STYLE} tickFormatter={chartTick} width={62} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={chartTooltip} />
                  <Bar dataKey="value" name="Outstanding" fill={CHART_COLORS.aging} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Payable Aging" subtitle="0-30 / 31-60 / 61-90 / 90+" route={CHART_ROUTES.payable_aging} navigate={navigate} empty={!chartData?.payable_aging?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.payable_aging} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} />
                  <YAxis domain={[0, (dataMax) => (dataMax > 0 ? dataMax : 1)]} allowDecimals={false} tick={AXIS_STYLE} tickFormatter={chartTick} width={62} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={chartTooltip} />
                  <Bar dataKey="value" name="Outstanding" fill={CHART_COLORS.outflow} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div className={PANEL}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className={SECTION_TITLE}>Recent Transactions</p>
            <p className={`mt-0.5 ${SECTION_SUBTITLE}`}>Latest financial activity across all accounts</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>View all</Button>
        </div>
        <Table
          columns={COLUMNS}
          data={transactions.map((t) => ({ ...t, date: formatDate(t.date), amount: privacyMode ? MASKED : formatCurrency(t.amount) }))}
          onRowClick={(row) => row.route && navigate(row.route)}
        />
        {transactions.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted">No recent transactions.</p>
        )}
      </div>

      {/* AI Insights */}
      <div className={`${HIGHLIGHT_PANEL} p-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AiLogo size={48} className="ai-insights-mark" />
            <div>
              <h2 className="text-base font-bold text-ink">AI Insights</h2>
              <p className="text-xs text-muted">Forecast-based guidance for your next financial decisions</p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/analytics/ai-recommendations')}>
            View Recommendations
          </Button>
        </div>
        {aiInsights.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">No AI insights generated yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {aiInsights.map((insight, idx) => {
              const priority = insight.priority || 'Low'
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => navigate(insight.route || '/analytics/ai-recommendations')}
                  className="group flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-left
                    transition-colors hover:border-primary/60 hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <div className="flex w-full flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted">Insight {idx + 1}</span>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${INSIGHT_PRIORITY[priority] || INSIGHT_PRIORITY.Low}`}>
                      {priority} priority
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-ink">{normalizeAiCurrencyText(insight.text)}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-primary-dark">
                    View recommendation <ArrowUpRight size={14} aria-hidden="true" />
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Forecast Summary */}
      <div className={`${HIGHLIGHT_PANEL} ${PANEL_PAD}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary-dark">
              <Target size={18} />
            </div>
            <div>
              <h2 className={SECTION_TITLE}>Forecast Summary</h2>
              <p className={SECTION_SUBTITLE}>Latest generated forecasts</p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/analytics/forecasting')}>
            View Detailed Forecast
          </Button>
        </div>
        {forecastSummary.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">No forecasts generated yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {forecastSummary.map((card) => {
              const Icon = iconForForecast(card.forecast_target)
              const hasTrend = card.trend !== null && card.trend !== undefined
              const favorable = /expense/i.test(card.forecast_target) ? card.trend < 0 : card.trend > 0
              const TrendIcon = hasTrend && card.trend >= 0 ? ArrowUpRight : ArrowDownRight
              return (
                <button
                  key={card.forecast_target}
                  type="button"
                  onClick={() => navigate(card.route)}
                  className={`rounded-lg border border-border bg-surface p-3 text-left ${CLICKABLE_ROW}`}
                >
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary-dark">
                    <Icon size={15} />
                  </div>
                  <p className="text-xs text-muted">Predicted {card.forecast_target}</p>
                  <p className="mt-0.5 text-base font-bold text-ink">{privacyMode ? MASKED : formatCurrency(card.predicted_amount)}</p>
                  {hasTrend && (
                    <p className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${Number(card.trend) === 0 ? 'text-muted' : favorable ? 'text-status-success' : 'text-status-danger'}`}>
                      <TrendIcon size={12} /> {Math.abs(card.trend)}% vs. actual
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
