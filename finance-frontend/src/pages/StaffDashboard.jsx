import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users2,
  Building2,
  Wallet,
  Receipt,
  TrendingDown,
  Loader2,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  FileWarning,
  Send,
  PiggyBank,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useStaffDashboard } from '../hooks/useStaffDashboard'

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

// Staff has view/manage on these five modules — no approve on any of them
// (see RolesAndPermissionsSeeder). Routes are guesses matching the
// crumb/breadcrumb conventions used elsewhere (Budgets.jsx uses
// 'Financial Transactions' > 'Budgets') — adjust the `to` paths below to
// match your actual router config in App.jsx if they differ.
const QUICK_LINKS = [
  { key: 'customers', label: 'Customers', icon: Users2, to: '/accounts-receivable/customers' },
  { key: 'suppliers', label: 'Suppliers', icon: Building2, to: '/accounts-payable/suppliers' },
  { key: 'ar', label: 'Accounts Receivable', icon: Wallet, to: '/accounts-receivable' },
  { key: 'ap', label: 'Accounts Payable', icon: Receipt, to: '/accounts-payable' },
  { key: 'expenses', label: 'Expenses', icon: TrendingDown, to: '/accounting/expenses' },
  { key: 'disbursements', label: 'Disbursements', icon: Send, to: '/budget-management/disbursements' },
  { key: 'budgets', label: 'Budgets', icon: PiggyBank, to: '/financial-transactions/budgets' },
]

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor, loading }) {
  return (
    <div className={`${PANEL} ${PANEL_PAD} flex items-center gap-3`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted truncate">{label}</p>
        <p className="text-lg font-bold text-ink truncate">{loading ? '—' : value}</p>
      </div>
    </div>
  )
}

// One row inside a "needs attention" list — same shape for AR/AP/Expenses/
// Disbursements/Budgets, just different label/amount fields per section.
function AttentionRow({ title, subtitle, amount, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg transition-colors duration-150"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {amount != null && <p className="shrink-0 text-sm font-medium text-ink tabular-nums">{formatCurrency(amount)}</p>}
    </button>
  )
}

function AttentionSection({ title, icon: Icon, items, emptyLabel, renderItem }) {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={15} className="text-muted" />
        <p className="text-sm font-semibold text-ink">{title}</p>
        {items?.length > 0 && (
          <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            {items.length}
          </span>
        )}
      </div>
      <div className="divide-y divide-border">
        {!items || items.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">{emptyLabel}</p>
        ) : (
          items.slice(0, 5).map(renderItem)
        )}
      </div>
    </div>
  )
}

export default function StaffDashboard({ title = 'Dashboard', crumbs = ['Dashboard'] }) {
  const navigate = useNavigate()
  const { data, loading, error, fetchDashboard } = useStaffDashboard()

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  const summary = data?.summary
  const attention = data?.attention || {}
  const recentActivity = data?.recent_activity || []

  const statCards = [
    { key: 'customers', label: 'Customers', value: summary?.customers ?? '—', icon: Users2, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark' },
    { key: 'suppliers', label: 'Suppliers', value: summary?.suppliers ?? '—', icon: Building2, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
    { key: 'ar', label: 'AR Outstanding', value: summary?.ar_outstanding != null ? formatCurrency(summary.ar_outstanding) : '—', icon: Wallet, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'ap', label: 'AP Outstanding', value: summary?.ap_outstanding != null ? formatCurrency(summary.ap_outstanding) : '—', icon: Receipt, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
    { key: 'expenses', label: 'Expenses This Month', value: summary?.expenses_this_month != null ? formatCurrency(summary.expenses_this_month) : '—', icon: TrendingDown, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400' },
  ]

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">Your day-to-day overview.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((card) => (
          <StatCard key={card.key} {...card} loading={loading} />
        ))}
      </div>

      {/* Quick links to every module Staff has access to */}
      <div className={`${PANEL} ${PANEL_PAD}`}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Quick Links</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <button
                key={link.key}
                type="button"
                onClick={() => navigate(link.to)}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-bg px-3 py-2.5 text-left text-sm font-medium text-ink hover:border-primary/40 hover:bg-primary/5 transition-colors duration-150"
              >
                <Icon size={16} className="shrink-0 text-muted" />
                <span className="truncate">{link.label}</span>
                <ArrowUpRight size={13} className="ml-auto shrink-0 text-muted" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Needs Your Attention — pulled from the same modules Staff can
          manage but not approve, so this doubles as "what's waiting on
          someone else" (AR/AP/Expenses/Disbursements pending Admin
          approval) plus "what YOU still need to finish" (Draft budgets
          with no plan attached, since that blocks approval entirely). */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Needs Attention</p>
        {loading ? (
          <div className={`${PANEL} ${PANEL_PAD} flex items-center justify-center gap-2 py-10 text-sm text-muted`}>
            <Loader2 size={16} className="animate-spin" /> Loading...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AttentionSection
              title="AR Awaiting Follow-up"
              icon={Wallet}
              items={attention.ar}
              emptyLabel="Nothing overdue right now."
              renderItem={(item) => (
                <AttentionRow
                  key={item.id}
                  title={item.customer_name}
                  subtitle={item.due_date ? `Due ${formatDateTime(item.due_date)}` : undefined}
                  amount={item.amount}
                  onClick={() => navigate('/accounts-receivable')}
                />
              )}
            />

            <AttentionSection
              title="AP Pending Approval"
              icon={Receipt}
              items={attention.ap}
              emptyLabel="Nothing waiting on approval."
              renderItem={(item) => (
                <AttentionRow
                  key={item.id}
                  title={item.supplier_name}
                  subtitle={item.due_date ? `Due ${formatDateTime(item.due_date)}` : undefined}
                  amount={item.amount}
                  onClick={() => navigate('/accounts-payable')}
                />
              )}
            />

            <AttentionSection
              title="Expenses Pending Approval"
              icon={FileWarning}
              items={attention.expenses}
              emptyLabel="No expenses waiting on approval."
              renderItem={(item) => (
                <AttentionRow
                  key={item.id}
                  title={item.description}
                  subtitle={item.submitted_at ? `Submitted ${formatDateTime(item.submitted_at)}` : undefined}
                  amount={item.amount}
                  onClick={() => navigate('/accounting/expenses')}
                />
              )}
            />

            <AttentionSection
              title="Disbursements Pending Approval"
              icon={Send}
              items={attention.disbursements}
              emptyLabel="No disbursements waiting on approval."
              renderItem={(item) => (
                <AttentionRow
                  key={item.id}
                  title={item.reference}
                  subtitle={item.submitted_at ? `Submitted ${formatDateTime(item.submitted_at)}` : undefined}
                  amount={item.amount}
                  onClick={() => navigate('/budget-management/disbursements')}
                />
              )}
            />

            <AttentionSection
              title="Budgets Missing a Plan"
              icon={AlertTriangle}
              items={attention.budgets}
              emptyLabel="Every draft budget has a plan attached."
              renderItem={(item) => (
                <AttentionRow
                  key={item.id}
                  title={item.budget_name}
                  subtitle={item.reason || 'No budget plan attached'}
                  onClick={() => navigate('/financial-transactions/budgets')}
                />
              )}
            />
          </div>
        )}
      </div>

      {/* Recent activity — a lightweight feed, not per-section, since
          Staff doesn't need an audit trail, just "what changed lately". */}
      <div className={PANEL}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Clock size={15} className="text-muted" />
          <p className="text-sm font-semibold text-ink">Recent Activity</p>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <p className="px-4 py-6 text-center text-xs text-muted">Loading...</p>
          ) : recentActivity.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">No recent activity yet.</p>
          ) : (
            recentActivity.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{item.description}</p>
                  <p className="truncate text-xs text-muted">{item.actor_name}</p>
                </div>
                <p className="shrink-0 text-xs text-muted whitespace-nowrap">{formatDateTime(item.created_at)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}