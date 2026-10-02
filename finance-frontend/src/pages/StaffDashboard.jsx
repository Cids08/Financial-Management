import KpiValue from '../components/KpiValue'
import { ContentSkeleton } from '../components/LoadingSkeleton'
import { protectedDashboardPdf } from '../utils/secureExport'
import { useEffect, useState } from 'react'
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
  Download,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useStaffDashboard } from '../hooks/useStaffDashboard'
import { usePrivacy } from '../context/PrivacyContext'
import { apiFetch } from '../utils/api'
import { useAllDataUpdates } from '../hooks/useDataUpdates'

const PANEL = 'rounded-2xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4 sm:p-5'

// Staff has view/manage on these five modules  -  no approve on any of them
// (see RolesAndPermissionsSeeder). Routes match the /master-data and
// /transactions convention used by Dashboard.jsx and CollectorDashboard.jsx.
const QUICK_LINKS = [
  { key: 'customers', label: 'Customers', icon: Users2, to: '/master-data/customers' },
  { key: 'suppliers', label: 'Suppliers', icon: Building2, to: '/master-data/suppliers' },
  { key: 'ar', label: 'Accounts Receivable', icon: Wallet, to: '/transactions/receivable' },
  { key: 'ap', label: 'Accounts Payable', icon: Receipt, to: '/transactions/payable' },
  { key: 'expenses', label: 'Expenses', icon: TrendingDown, to: '/transactions/expenses' },
  { key: 'disbursements', label: 'Disbursements', icon: Send, to: '/transactions/disbursements' },
  { key: 'budgets', label: 'Budgets', icon: PiggyBank, to: '/transactions/budgets' },
]

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor, loading, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left transition-all duration-150
        hover:border-primary/40 hover:bg-primary/5 active:scale-[0.99] cursor-pointer w-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg} transition-transform duration-150 group-hover:scale-105`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted group-hover:text-ink truncate transition-colors">{label}</p>
        <p className="mt-1 text-xl font-bold tracking-tight text-ink tabular-nums truncate"><KpiValue loading={loading}>{value}</KpiValue></p>
      </div>
    </button>
  )
}

// One row inside a "needs attention" list  -  same shape for AR/AP/Expenses/
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
          <span className="ml-auto rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-medium text-status-warning">
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

  usePrivacy()

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  // Staff dashboard aggregates the modules staff can see — live-refresh on
  // any data change so figures stay current without manual reloads.
  useAllDataUpdates(fetchDashboard)

  const summary = data?.summary
  const attention = data?.attention || {}
  const recentActivity = data?.recent_activity || []

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const handleExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const res = await protectedDashboardPdf('/api/dashboard/export')
      if (!res) return
      if (!res.ok) throw new Error('Export request failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `staff-dashboard-summary-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setExportError('Could not export the dashboard summary. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const statCards = [
    { key: 'customers', label: 'Customers', value: summary?.customers ?? '—', icon: Users2, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', to: '/master-data/customers' },
    { key: 'suppliers', label: 'Suppliers', value: summary?.suppliers ?? '—', icon: Building2, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', to: '/master-data/suppliers' },
    { key: 'ar', label: 'AR Outstanding', value: summary?.ar_outstanding != null ? formatCurrency(summary.ar_outstanding) : '—', icon: Wallet, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', to: '/transactions/receivable' },
    { key: 'ap', label: 'AP Outstanding', value: summary?.ap_outstanding != null ? formatCurrency(summary.ap_outstanding) : '—', icon: Receipt, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', to: '/transactions/payable' },
    { key: 'expenses', label: 'Expenses This Month', value: summary?.expenses_this_month != null ? formatCurrency(summary.expenses_this_month) : '—', icon: TrendingDown, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', to: '/transactions/expenses' },
  ]

  return (
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className={`${PANEL} flex flex-col gap-5 border-t-4 border-t-primary p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6`}>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-dark">Your daily workspace</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">Your accounts, activity, and next steps in one place.</p>
          {exportError && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle size={12} className="shrink-0" /> {exportError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">
          {error}
        </div>
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(({ key, to, ...card }) => (
          <StatCard key={key} {...card} loading={loading} onClick={() => navigate(to)} />
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

      {/* Needs Your Attention  -  pulled from the same modules Staff can
          manage but not approve, so this doubles as "what's waiting on
          someone else" (AR/AP/Expenses/Disbursements pending Admin
          approval) plus "what YOU still need to finish" (Draft budgets
          with no plan attached, since that blocks approval entirely). */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Needs Attention</p>
        {loading ? (
          <ContentSkeleton rows={4} />
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
                  onClick={() => navigate('/transactions/receivable')}
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
                  onClick={() => navigate('/transactions/payable')}
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
                  onClick={() => navigate('/transactions/expenses')}
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
                  onClick={() => navigate('/transactions/disbursements')}
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
                  onClick={() => navigate('/transactions/budgets')}
                />
              )}
            />
          </div>
        )}
      </div>

      {/* Recent activity  -  a lightweight feed, not per-section, since
          Staff doesn't need an audit trail, just "what changed lately". */}
      <div className={PANEL}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Clock size={15} className="text-muted" />
          <p className="text-sm font-semibold text-ink">Recent Activity</p>
        </div>
        <div className="divide-y divide-border">
          {loading ? (
            <ContentSkeleton />
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
