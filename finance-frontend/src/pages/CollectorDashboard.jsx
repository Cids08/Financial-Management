import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wallet, AlertTriangle, HandCoins, Clock3, Users as UsersIcon,
  ArrowRight, Receipt, ChevronRight,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import { formatCurrency } from '../utils/formatters'
import { useAccountsReceivable } from '../hooks/useAccountsReceivable'
import { apiFetch } from '../utils/api'

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

const AR_STATUS_STYLES = {
  Pending: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  'Partially Paid': 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Paid: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Overdue: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  Cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const COLLECTION_STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Confirmed: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Voided: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function isThisMonth(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

// Simple stat card, matches the pattern used across every other page in
// this app (Collectors.jsx, TaxObligations.jsx, etc).
function StatCard({ label, value, icon: Icon, iconBg, iconColor }) {
  return (
    <div className={`${PANEL} ${PANEL_PAD} flex items-center gap-3`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-bold text-ink">{value}</p>
      </div>
    </div>
  )
}

// One of the three permitted-access shortcut tiles at the top — routes
// match App.jsx's existing paths for these pages.
function QuickLinkCard({ label, description, icon: Icon, iconBg, iconColor, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md active:translate-y-0`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </button>
  )
}

export default function CollectorDashboard({ title = 'Dashboard', crumbs = ['Dashboard'] }) {
  const navigate = useNavigate()

  // Accounts Receivable — reuses the same hook AccountsReceivable.jsx
  // itself uses, so this page's numbers can never drift from that page's.
  const { records: arRecords, loading: arLoading, error: arError, fetchRecords } = useAccountsReceivable()

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // Collections — no dedicated hook exists yet (Collections.jsx is still
  // mock-only as of this page being built), so this fetches the real
  // endpoint directly. If/when a useCollections hook gets built, swap
  // this block for that instead of duplicating the fetch logic twice.
  const [collections, setCollections] = useState([])
  const [collectionsLoading, setCollectionsLoading] = useState(true)
  const [collectionsError, setCollectionsError] = useState('')

  const fetchCollections = useCallback(async () => {
    setCollectionsLoading(true)
    setCollectionsError('')
    try {
      const res = await apiFetch('/api/collections')
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed to load collections.')
      setCollections(json.data || [])
    } catch (err) {
      setCollectionsError(err.message || 'Failed to load collections.')
    } finally {
      setCollectionsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCollections()
  }, [fetchCollections])

  // Customers — just the stats endpoint (already built for Customers.jsx),
  // no need for the full list here.
  const [customerStats, setCustomerStats] = useState({ total: 0, active: 0 })

  useEffect(() => {
    apiFetch('/api/customers/stats')
      .then((res) => res.json())
      .then((json) => { if (json.success) setCustomerStats(json.data) })
      .catch(() => {}) // non-fatal — the stat card just shows 0 if this fails
  }, [])

  const activeAR = useMemo(() => arRecords.filter((r) => !r.is_archived), [arRecords])
  const activeCollections = useMemo(() => collections.filter((c) => !c.is_archived), [collections])

  const stats = useMemo(() => {
    const outstanding = activeAR
      .filter((r) => r.status !== 'Paid' && r.status !== 'Cancelled')
      .reduce((sum, r) => sum + Number(r.balance || 0), 0)

    const overdueCount = activeAR.filter((r) => r.status === 'Overdue').length

    const collectedThisMonth = activeCollections
      .filter((c) => c.status === 'Confirmed' && isThisMonth(c.collection_date))
      .reduce((sum, c) => sum + Number(c.amount_received || 0), 0)

    const pendingCollections = activeCollections.filter((c) => c.status === 'Pending').length

    return { outstanding, overdueCount, collectedThisMonth, pendingCollections }
  }, [activeAR, activeCollections])

  // Top of the "needs attention" list — unpaid balances, soonest due date first.
  const outstandingInvoices = useMemo(() => {
    return [...activeAR]
      .filter((r) => r.status !== 'Paid' && r.status !== 'Cancelled')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 8)
  }, [activeAR])

  const recentCollections = useMemo(() => {
    return [...activeCollections]
      .sort((a, b) => new Date(b.collection_date) - new Date(a.collection_date))
      .slice(0, 8)
  }, [activeCollections])

  const loading = arLoading || collectionsLoading

  const statCards = [
    { key: 'outstanding', label: 'Outstanding Balance', value: formatCurrency(stats.outstanding), icon: Wallet, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400' },
    { key: 'overdue', label: 'Overdue Invoices', value: stats.overdueCount, icon: AlertTriangle, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400' },
    { key: 'collected', label: 'Collected This Month', value: formatCurrency(stats.collectedThisMonth), icon: HandCoins, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'pending', label: 'Pending Collections', value: stats.pendingCollections, icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
  ]

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">Outstanding balances and collection activity across your assigned accounts.</p>
      </div>

      {(arError || collectionsError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {arError || collectionsError}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => (
          <StatCard key={card.key} label={card.label} value={loading ? '—' : card.value} icon={card.icon} iconBg={card.iconBg} iconColor={card.iconColor} />
        ))}
      </div>

      {/* Quick links — exactly the three pages this role has access to */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickLinkCard
          label="Customers"
          description={`${customerStats.total} total, ${customerStats.active} active`}
          icon={UsersIcon}
          iconBg="bg-primary/15"
          iconColor="text-primary-dark"
          onClick={() => navigate('/master-data/customers')}
        />
        <QuickLinkCard
          label="Accounts Receivable"
          description={`${activeAR.length} invoice${activeAR.length === 1 ? '' : 's'} on file`}
          icon={Receipt}
          iconBg="bg-blue-50 dark:bg-blue-500/10"
          iconColor="text-blue-600 dark:text-blue-400"
          onClick={() => navigate('/transactions/receivable')}
        />
        <QuickLinkCard
          label="Collections"
          description="Record a new payment"
          icon={HandCoins}
          iconBg="bg-emerald-50 dark:bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          onClick={() => navigate('/transactions/collections')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Outstanding invoices needing attention */}
        <div className={PANEL}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Needs Attention</p>
            <button
              type="button"
              onClick={() => navigate('/transactions/receivable')}
              className="flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-border">
            {loading && <p className="px-4 py-6 text-center text-sm text-muted">Loading…</p>}
            {!loading && outstandingInvoices.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">No outstanding invoices — everything's settled.</p>
            )}
            {!loading && outstandingInvoices.map((r) => (
              <div key={r.ar_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{r.customer_name || `Invoice ${r.invoice_number}`}</p>
                  <p className="text-xs text-muted">{r.invoice_number} &middot; Due {formatDate(r.due_date)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-ink">{formatCurrency(r.balance)}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${AR_STATUS_STYLES[r.status] || ''}`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent collection activity */}
        <div className={PANEL}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Recent Collections</p>
            <button
              type="button"
              onClick={() => navigate('/transactions/collections')}
              className="flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-border">
            {loading && <p className="px-4 py-6 text-center text-sm text-muted">Loading…</p>}
            {!loading && recentCollections.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">No collections recorded yet.</p>
            )}
            {!loading && recentCollections.map((c) => (
              <div key={c.collection_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.receipt_number}</p>
                  <p className="text-xs text-muted">{formatDate(c.collection_date)} &middot; {c.payment_method}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-ink">{formatCurrency(c.amount_received)}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${COLLECTION_STATUS_STYLES[c.status] || ''}`}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}