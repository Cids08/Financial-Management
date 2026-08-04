import { useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  TrendingDown,
  HandCoins,
  PiggyBank,
  Download,
  Plus,
  BarChart3,
  PieChart,
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
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import DashboardCard from '../components/DashboardCard'
import Table from '../components/Table'
import Button from '../components/Button'
import { formatCurrency, formatDate } from '../utils/formatters'

/* ---------------------------------------------------------------------- */
/* Dummy data                                                              */
/* ---------------------------------------------------------------------- */

const user = {
  name: 'Juan Dela Cruz',
  role: 'Finance Manager',
  company: 'crane and trucking operations',
}

const moduleCards = [
  { title: 'Total Customers', value: '1,284', icon: Users, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', route: '/master-data/customers' },
  { title: 'Total Suppliers', value: '312', icon: Truck, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', route: '/master-data/suppliers' },
  { title: 'Active Collectors', value: '24', icon: UserCheck, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', route: '/master-data/collectors' },
  { title: 'Receivable', value: formatCurrency(3820400), icon: FileText, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', route: '/transactions/receivable' },
  { title: 'Collections Today', value: formatCurrency(185000), icon: HandCoins, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', route: '/transactions/collections' },
  { title: 'Cash Balance', value: formatCurrency(6240900), icon: PiggyBank, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', route: '/master-data/cash-accounts' },
  { title: 'Payable', value: formatCurrency(1940200), icon: CreditCard, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', route: '/transactions/payable' },
  { title: 'Disbursements', value: formatCurrency(96500), icon: Banknote, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', route: '/transactions/disbursements' },
  { title: 'Tax Obligations', value: formatCurrency(412700), icon: Percent, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', route: '/transactions/tax-obligations' },
  { title: 'Active Budgets', value: '18', icon: Wallet, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', route: '/transactions/budgets' },
]

const overviewCards = [
  { title: 'Total Revenue', value: formatCurrency(4820500), icon: TrendingUp, trend: 12.4, iconBg: 'bg-primary/15', route: '/reports' },
  { title: 'Total Expenses', value: formatCurrency(2185300), icon: TrendingDown, trend: -4.1, iconBg: 'bg-red-50 dark:bg-red-500/10', route: '/transactions/expenses' },
  { title: 'Available Cash', value: formatCurrency(6240900), icon: PiggyBank, trend: 5.6, iconBg: 'bg-amber-50 dark:bg-amber-500/10', route: '/master-data/cash-accounts' },
  { title: 'Net Cash Flow', value: formatCurrency(920250), icon: Activity, trend: 6.9, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', route: '/analytics/forecasting' },
]

const chartPlaceholders = [
  { title: 'Revenue Trend', subtitle: 'Last 6 months', icon: BarChart3, route: '/reports' },
  { title: 'Expense Trend', subtitle: 'Last 6 months', icon: TrendingDown, route: '/transactions/expenses' },
  { title: 'Collections Trend', subtitle: 'Daily, 30 days', icon: HandCoins, route: '/transactions/collections' },
  { title: 'Cash Flow', subtitle: 'Inflow vs. outflow', icon: Activity, route: '/analytics/forecasting' },
  { title: 'Budget Utilization', subtitle: 'By department', icon: PieChart, route: '/transactions/budgets' },
  { title: 'Receivable Aging', subtitle: '0-30 / 31-60 / 61-90 / 90+', icon: FileText, route: '/transactions/receivable' },
  { title: 'Payable Aging', subtitle: '0-30 / 31-60 / 61-90 / 90+', icon: CreditCard, route: '/transactions/payable' },
]

const columns = [
  { key: 'date', label: 'Date' },
  { key: 'reference', label: 'Reference No.' },
  { key: 'transaction', label: 'Transaction' },
  { key: 'party', label: 'Customer / Supplier' },
  { key: 'amount', label: 'Amount' },
  { key: 'status', label: 'Status' },
]

const transactions = [
  { date: formatDate('2026-07-28'), reference: 'COL-10234', transaction: 'Customer Collection', party: 'Meridian Retail Corp.', amount: formatCurrency(185000), status: 'Completed', route: '/transactions/collections' },
  { date: formatDate('2026-07-27'), reference: 'DIS-08812', transaction: 'Supplier Disbursement', party: 'Northgate Supplies Inc.', amount: formatCurrency(96500), status: 'Processing', route: '/transactions/disbursements' },
  { date: formatDate('2026-07-27'), reference: 'AR-20391', transaction: 'Invoice Issued', party: 'Delacruz Trading', amount: formatCurrency(320000), status: 'Pending', route: '/transactions/receivable' },
  { date: formatDate('2026-07-26'), reference: 'AP-11045', transaction: 'Supplier Payment', party: 'Pinnacle Freight Co.', amount: formatCurrency(74250), status: 'Overdue', route: '/transactions/payable' },
  { date: formatDate('2026-07-25'), reference: 'TAX-00931', transaction: 'Tax Remittance', party: 'BIR - Regional Office', amount: formatCurrency(58900), status: 'Paid', route: '/transactions/tax-obligations' },
  { date: formatDate('2026-07-24'), reference: 'EXP-30217', transaction: 'Expense Voucher', party: 'Marketing Department', amount: formatCurrency(12750), status: 'Failed', route: '/transactions/expenses' },
]

const approvals = [
  { title: 'Q3 Marketing Budget Approval', date: formatDate('2026-07-26'), status: 'Pending', icon: Wallet, route: '/transactions/budgets' },
  { title: 'Supplier Payment - Northgate Supplies', date: formatDate('2026-07-27'), status: 'Pending', icon: CreditCard, route: '/transactions/payable' },
  { title: 'Travel Expense - Ops Team', date: formatDate('2026-07-25'), status: 'Escalated', icon: Receipt, route: '/transactions/expenses' },
]

const approvalBadge = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  Escalated: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  Approved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
}

const notifications = [
  { text: 'Invoice AR-20391 for Delacruz Trading is overdue.', time: '10 minutes ago', icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10', route: '/transactions/receivable' },
  { text: 'Supplier payment to Pinnacle Freight Co. is due tomorrow.', time: '1 hour ago', icon: CalendarClock, color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10', route: '/transactions/payable' },
  { text: 'Marketing budget is 92% utilized and nearly exhausted.', time: '3 hours ago', icon: Wallet, color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10', route: '/transactions/budgets' },
  { text: 'Q3 cash flow forecast generated successfully.', time: 'Yesterday', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10', route: '/analytics/forecasting' },
  { text: 'New AI recommendation available for review.', time: 'Yesterday', icon: Sparkles, color: 'text-violet-600 bg-violet-50 dark:text-violet-400 dark:bg-violet-500/10', route: '/analytics/ai-recommendations' },
]

const deadlines = [
  { title: 'Due Accounts Receivable', detail: formatCurrency(320000) + ' from Delacruz Trading', date: 'Aug 3, 2026', icon: FileText, route: '/transactions/receivable' },
  { title: 'Upcoming Supplier Payments', detail: formatCurrency(74250) + ' to Pinnacle Freight Co.', date: 'Jul 31, 2026', icon: CreditCard, route: '/transactions/payable' },
  { title: 'Tax Filing Deadline', detail: 'Quarterly VAT remittance', date: 'Aug 10, 2026', icon: Percent, route: '/transactions/tax-obligations' },
  { title: 'Budget Review Schedule', detail: 'Q3 department budget review', date: 'Aug 15, 2026', icon: ClipboardList, route: '/transactions/budgets' },
]

const aiInsights = [
  { text: 'Collections increased by 12% compared to last month.', icon: TrendingUp },
  { text: 'Expenses exceeded the Marketing budget by 5%.', icon: AlertTriangle },
  { text: 'Cash flow is projected to remain stable over the next 3 months.', icon: Activity },
  { text: 'Three customers have a high probability of late payment.', icon: Users },
]

const forecastCards = [
  { title: 'Predicted Revenue', value: formatCurrency(5120000), trend: 6.2, icon: TrendingUp, route: '/analytics/forecasting' },
  { title: 'Predicted Expenses', value: formatCurrency(2340000), trend: 3.1, icon: TrendingDown, route: '/analytics/forecasting' },
  { title: 'Predicted Cash Flow', value: formatCurrency(1980000), trend: 4.8, icon: PiggyBank, route: '/analytics/forecasting' },
]

/* ---------------------------------------------------------------------- */
/* Shared style tokens                                                     */
/* ---------------------------------------------------------------------- */
const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const HIGHLIGHT_PANEL = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 shadow-card'
const PANEL_PAD = 'p-4'
const SECTION_TITLE = 'text-sm font-semibold text-ink'
const SECTION_SUBTITLE = 'text-xs text-muted'
const CLICKABLE_ROW = 'w-full text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-card'

export default function Dashboard() {
  const navigate = useNavigate()

  const handleModuleClick = (route) => {
    if (route) navigate(route)
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={['Dashboard']} />

      {/* 1. Welcome section */}
      <div className={`${PANEL} flex flex-col gap-3 ${PANEL_PAD} sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Welcome back, {user.role}!</h1>
          <p className="mt-1 text-xs text-muted">
            Here's your financial snapshot for {user.company}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Download}>
            Export
          </Button>
          <Button variant="primary" size="sm" icon={Plus}>
            New Transaction
          </Button>
        </div>
      </div>

      {/* 3. Financial overview */}
      <div>
        <h2 className={`mb-2 ${SECTION_TITLE}`}>Financial Overview</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {overviewCards.map(({ route, ...card }) => (
            <DashboardCard
              key={card.title}
              {...card}
              onClick={route ? () => navigate(route) : undefined}
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
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {aiInsights.map((insight, idx) => {
            const Icon = insight.icon
            return (
              <button
                key={idx}
                type="button"
                onClick={() => navigate('/analytics/ai-recommendations')}
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
      </div>

      {/* Forecast Summary — cards now clickable */}
      <div className={`${HIGHLIGHT_PANEL} ${PANEL_PAD}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary-dark">
              <Target size={18} />
            </div>
            <div>
              <h2 className={SECTION_TITLE}>Forecast Summary</h2>
              <p className={SECTION_SUBTITLE}>Next quarter projection</p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/analytics/forecasting')}>
            View Detailed Forecast
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {forecastCards.map((card) => {
            const Icon = card.icon
            const TrendIcon = card.trend >= 0 ? ArrowUpRight : ArrowDownRight
            return (
              <button
                key={card.title}
                type="button"
                onClick={() => navigate(card.route)}
                className={`rounded-lg border border-border bg-surface p-3 text-left ${CLICKABLE_ROW}`}
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary-dark">
                  <Icon size={15} />
                </div>
                <p className="text-xs text-muted">{card.title}</p>
                <p className="mt-0.5 text-base font-bold text-ink">{card.value}</p>
                <p className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${card.trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  <TrendIcon size={12} /> {Math.abs(card.trend)}% vs. last quarter
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Financial summary / module cards */}
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

      {/* 4. Charts section — now clickable */}
      <div>
        <h2 className={`mb-2 ${SECTION_TITLE}`}>Charts &amp; Trends</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {chartPlaceholders.map((chart) => {
            const Icon = chart.icon
            return (
              <button
                key={chart.title}
                type="button"
                onClick={() => navigate(chart.route)}
                className={`${PANEL} ${PANEL_PAD} text-left ${CLICKABLE_ROW}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">{chart.title}</p>
                    <p className={`mt-0.5 ${SECTION_SUBTITLE}`}>{chart.subtitle}</p>
                  </div>
                  <Icon size={16} className="text-muted" />
                </div>
                <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-bg">
                  <div className="text-center">
                    <Icon size={22} className="mx-auto mb-1.5 text-border" />
                    <p className="text-xs font-medium text-muted">Chart coming soon</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* 6. Recent transactions — rows now clickable via Table's onRowClick */}
      <div className={PANEL}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className={SECTION_TITLE}>Recent Transactions</p>
            <p className={`mt-0.5 ${SECTION_SUBTITLE}`}>Latest financial activity across all accounts</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}>
            View all
          </Button>
        </div>
        <Table
          columns={columns}
          data={transactions}
          onRowClick={(row) => row.route && navigate(row.route)}
        />
      </div>

      {/* 7, 9 & 8: Approvals, Deadlines and Notifications — all clickable */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className={`${PANEL} ${PANEL_PAD}`}>
          <h2 className={`mb-3 ${SECTION_TITLE}`}>Pending Approvals</h2>
          <div className="space-y-2">
            {approvals.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.title}
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
                  <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${approvalBadge[item.status]}`}>
                    {item.status}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className={`${PANEL} ${PANEL_PAD}`}>
          <h2 className={`mb-3 ${SECTION_TITLE}`}>Upcoming Deadlines</h2>
          <div className="space-y-2">
            {deadlines.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.title}
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
                  <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-ink">{item.date}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className={`${PANEL} ${PANEL_PAD}`}>
          <div className="mb-3 flex items-center gap-2">
            <BellRing size={16} className="text-muted" />
            <h2 className={SECTION_TITLE}>Notifications</h2>
          </div>
          <div className="divide-y divide-border">
            {notifications.slice(0, 4).map((note, idx) => {
              const Icon = note.icon
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => navigate(note.route)}
                  className="flex w-full items-start gap-2.5 py-2 text-left transition-colors duration-150 hover:bg-bg first:pt-0 last:pb-0"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${note.color}`}>
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
        </div>
      </div>
    </div>
  )
}