import { useEffect, useState } from 'react'
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
  Sparkles,
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
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import DashboardCard from '../components/DashboardCard'
import Table from '../components/Table'
import Button from '../components/Button'
import { formatCurrency, formatDate } from '../utils/formatters'
import { apiFetch } from '../utils/api'
import { useProfile } from '../hooks/useProfile'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'

/* ---------------------------------------------------------------------- */
/* Presentation config — icons/colors/routes per API field, since the API */
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
  { key: 'total_revenue', title: 'Total Revenue', icon: TrendingUp, iconBg: 'bg-primary/15', route: '/reports' },
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
  revenue: '#10b981', // emerald
  expense: '#ef4444', // red
  inflow: '#10b981',
  outflow: '#ef4444',
  net: '#3b82f6', // blue
  collections: '#3b82f6',
  allocated: '#94a3b8', // slate
  used: '#f59e0b', // amber
  aging: '#a855f7', // purple
}

const AXIS_STYLE = { fontSize: 11, fill: 'var(--color-muted, #64748b)' }
const CHART_MARGIN = { top: 5, right: 24, left: 0, bottom: 0 }
const shortMonthTick = (label) => (typeof label === 'string' ? label.split(' ')[0] : label)

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
  borderRadius: 8,
  border: '1px solid var(--color-border, #e2e8f0)',
  backgroundColor: 'var(--color-surface, #fff)',
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
  Pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  Escalated: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
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
  ai_recommendation: { icon: Sparkles, color: 'text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-500/10' },
}
const DEFAULT_NOTIFICATION_STYLE = { icon: BellRing, color: 'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800' }

const PRIORITY_ICON = { High: AlertTriangle, Medium: TrendingUp, Low: Activity }

const FORECAST_ICON = { revenue: TrendingUp, expense: TrendingDown, expenses: TrendingDown, cash: PiggyBank }

/* ---------------------------------------------------------------------- */
/* Shared style tokens                                                     */
/* ---------------------------------------------------------------------- */
const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const HIGHLIGHT_PANEL = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 shadow-card'
const PANEL_PAD = 'p-4'
const SECTION_TITLE = 'text-sm font-semibold text-ink'
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

function ChartCard({ title, subtitle, route, navigate, empty, children }) {
  return (
    <div
      role={route ? 'button' : undefined}
      tabIndex={route ? 0 : undefined}
      onClick={route ? () => navigate(route) : undefined}
      className={`${PANEL} ${PANEL_PAD} text-left ${route ? CLICKABLE_ROW : ''}`}
    >
      <div className="mb-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className={`mt-0.5 ${SECTION_SUBTITLE}`}>{subtitle}</p>
      </div>
      {empty ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-bg">
          <p className="text-xs font-medium text-muted">No data for this period yet.</p>
        </div>
      ) : (
        <div className="h-40">{children}</div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Charts load separately from the cards/lists above — heavier grouped
  // queries on the backend, and there's no reason the rest of the
  // dashboard should wait on them.
  const [chartData, setChartData] = useState(null)
  const [chartsLoading, setChartsLoading] = useState(true)
  const [chartsError, setChartsError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiFetch('/api/dashboard')
      .then((res) => res.json())
      .then((json) => setData(json.data))
      .catch(() => setError('Could not load the dashboard. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setChartsLoading(true)
    setChartsError(null)
    apiFetch('/api/dashboard/charts')
      .then((res) => res.json())
      .then((json) => setChartData(json.data))
      .catch(() => setChartsError('Could not load charts.'))
      .finally(() => setChartsLoading(false))
  }, [])

  const handleModuleClick = (route) => {
    if (route) navigate(route)
  }

  if (loading) {
    return (
      <div className="space-y-5 animate-fadeIn">
        <Breadcrumb items={['Dashboard']} />
        <div className={`${PANEL} ${PANEL_PAD} flex items-center justify-center gap-2 py-16 text-sm text-muted`}>
          <Loader2 size={16} className="animate-spin" /> Loading dashboard…
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-5 animate-fadeIn">
        <Breadcrumb items={['Dashboard']} />
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
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

  const overviewCards = OVERVIEW_CARD_CONFIG.map((cfg) => {
    const entry = overview[cfg.key] || {}
    return {
      title: cfg.title,
      value: formatCurrency(entry.value || 0),
      icon: cfg.icon,
      trend: entry.trend,
      iconBg: cfg.iconBg,
      route: cfg.route,
    }
  })

  const moduleCards = MODULE_CARD_CONFIG.map((cfg) => ({
    title: cfg.title,
    value: cfg.format === 'currency' ? formatCurrency(moduleCardValues[cfg.key] || 0) : String(moduleCardValues[cfg.key] ?? 0),
    icon: cfg.icon,
    iconBg: cfg.iconBg,
    iconColor: cfg.iconColor,
    route: cfg.route,
  }))

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={['Dashboard']} />

      {/* 1. Welcome section */}
      <div className={`${PANEL} flex flex-col gap-3 ${PANEL_PAD} sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Welcome back{profile?.name ? `, ${[profile.role, profile.name.split(' ')[0]].filter(Boolean).join('-')}` : ''}!
          </h1>
          <p className="mt-1 text-xs text-muted">Here's your financial snapshot.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Download}>Export</Button>
          <Button variant="primary" size="sm" icon={Plus}>New Transaction</Button>
        </div>
      </div>

      {/* Financial overview */}
      <div>
        <h2 className={`mb-2 ${SECTION_TITLE}`}>Financial Overview</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {overviewCards.map((card) => (
            <DashboardCard
              key={card.title}
              {...card}
              onClick={card.route ? () => navigate(card.route) : undefined}
            />
          ))}
        </div>
      </div>

      {/* AI Insights */}
      <div className={`${HIGHLIGHT_PANEL} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary-dark">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">AI Insights</h2>
              <p className="text-xs text-muted">Powered by predictive analytics</p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/analytics/ai-recommendations')}>
            View Recommendations
          </Button>
        </div>
        {aiInsights.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">No AI insights generated yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {aiInsights.map((insight, idx) => {
              const Icon = PRIORITY_ICON[insight.priority] || Sparkles
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => navigate(insight.route || '/analytics/ai-recommendations')}
                  className="group flex items-start gap-2.5 rounded-lg border border-border bg-surface p-3 text-left
                    transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary-dark">
                    <Icon size={15} />
                  </div>
                  <p className="text-xs leading-snug text-ink">{insight.text}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Forecast Summary */}
      <div className={`${HIGHLIGHT_PANEL} ${PANEL_PAD}`}>
        <div className="mb-3 flex items-center justify-between">
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
                  <p className="mt-0.5 text-base font-bold text-ink">{formatCurrency(card.predicted_amount)}</p>
                  {hasTrend && (
                    <p className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${card.trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      <TrendIcon size={12} /> {Math.abs(card.trend)}% vs. actual
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Module cards */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className={SECTION_TITLE}>Modules</h2>
          <span className={SECTION_SUBTITLE}>Tap a card to open</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {moduleCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.title}
                type="button"
                onClick={() => handleModuleClick(card.route)}
                className={`group flex items-center gap-3 ${PANEL} p-3 text-left ${CLICKABLE_ROW}`}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                  <Icon size={16} className={card.iconColor} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-muted">{card.title}</p>
                  <p className="text-sm font-bold text-ink">{card.value}</p>
                </div>
                <ChevronRight
                  size={14}
                  className="shrink-0 text-border opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:text-primary"
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Charts section — real data from /api/dashboard/charts */}
      <div>
        <h2 className={`mb-2 ${SECTION_TITLE}`}>Charts &amp; Trends</h2>

        {chartsError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={15} className="shrink-0" />
            {chartsError}
          </div>
        )}

        {chartsLoading ? (
          <div className={`${PANEL} ${PANEL_PAD} flex items-center justify-center gap-2 py-16 text-sm text-muted`}>
            <Loader2 size={16} className="animate-spin" /> Loading charts…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Revenue Trend" subtitle="Last 6 months" route={CHART_ROUTES.revenue_trend} navigate={navigate} empty={!chartData?.revenue_trend?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData?.revenue_trend} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} tickFormatter={shortMonthTick} />
                  <YAxis tick={AXIS_STYLE} tickFormatter={(v) => formatCurrency(v)} width={70} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="value" name="Revenue" stroke={CHART_COLORS.revenue} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Expense Trend" subtitle="Last 6 months" route={CHART_ROUTES.expense_trend} navigate={navigate} empty={!chartData?.expense_trend?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData?.expense_trend} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} tickFormatter={shortMonthTick} />
                  <YAxis tick={AXIS_STYLE} tickFormatter={(v) => formatCurrency(v)} width={70} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                  <Line type="monotone" dataKey="value" name="Expenses" stroke={CHART_COLORS.expense} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Collections Trend" subtitle="Daily, 30 days" route={CHART_ROUTES.collections_trend} navigate={navigate} empty={!chartData?.collections_trend?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData?.collections_trend} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} ticks={evenTicks(chartData?.collections_trend, 7)} />
                  <YAxis tick={AXIS_STYLE} tickFormatter={(v) => formatCurrency(v)} width={70} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="value" name="Collected" stroke={CHART_COLORS.collections} fill={CHART_COLORS.collections} fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Cash Flow" subtitle="Inflow vs. outflow" route={CHART_ROUTES.cash_flow_trend} navigate={navigate} empty={!chartData?.cash_flow_trend?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.cash_flow_trend} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} tickFormatter={shortMonthTick} />
                  <YAxis tick={AXIS_STYLE} tickFormatter={(v) => formatCurrency(v)} width={70} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="inflow" name="Inflow" fill={CHART_COLORS.inflow} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="outflow" name="Outflow" fill={CHART_COLORS.outflow} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Budget Utilization" subtitle="By department" route={CHART_ROUTES.budget_utilization} navigate={navigate} empty={!chartData?.budget_utilization?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.budget_utilization} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} angle={-15} textAnchor="end" height={40} />
                  <YAxis tick={AXIS_STYLE} tickFormatter={(v) => formatCurrency(v)} width={70} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="allocated" name="Allocated" fill={CHART_COLORS.allocated} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="used" name="Used" fill={CHART_COLORS.used} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Receivable Aging" subtitle="0-30 / 31-60 / 61-90 / 90+" route={CHART_ROUTES.receivable_aging} navigate={navigate} empty={!chartData?.receivable_aging?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.receivable_aging} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} />
                  <YAxis tick={AXIS_STYLE} tickFormatter={(v) => formatCurrency(v)} width={70} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="value" name="Outstanding" fill={CHART_COLORS.aging} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Payable Aging" subtitle="0-30 / 31-60 / 61-90 / 90+" route={CHART_ROUTES.payable_aging} navigate={navigate} empty={!chartData?.payable_aging?.length}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData?.payable_aging} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e2e8f0)" />
                  <XAxis dataKey="label" tick={AXIS_STYLE} interval={0} />
                  <YAxis tick={AXIS_STYLE} tickFormatter={(v) => formatCurrency(v)} width={70} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
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
          data={transactions.map((t) => ({ ...t, date: formatDate(t.date), amount: formatCurrency(t.amount) }))}
          onRowClick={(row) => row.route && navigate(row.route)}
        />
        {transactions.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted">No recent transactions.</p>
        )}
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
    </div>
  )
}