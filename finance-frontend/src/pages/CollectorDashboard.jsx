import { ContentSkeleton } from '../components/LoadingSkeleton'
import { protectedDashboardPdf } from '../utils/secureExport'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wallet, AlertTriangle, HandCoins, Clock3, Users as UsersIcon,
  ArrowRight, Receipt, ChevronRight, Download, CalendarRange,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import { formatCurrency, maskedAmount } from '../utils/formatters'
import { useAccountsReceivable } from '../hooks/useAccountsReceivable'
import { usePrivacy } from '../context/PrivacyContext'
import { apiFetch } from '../utils/api'
import { useDataUpdates } from '../hooks/useDataUpdates'

const PANEL = 'rounded-2xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4 sm:p-5'

const AR_STATUS_STYLES = {
  Pending: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  'Partially Paid': 'bg-status-warning-bg text-status-warning border-status-warning-border',
  Paid: 'bg-status-success-bg text-status-success border-status-success-border',
  Overdue: 'bg-status-danger-bg text-status-danger border-status-danger-border',
  Cancelled: 'bg-status-neutral-bg text-status-neutral border-status-neutral-border',
}

const COLLECTION_STATUS_STYLES = {
  Pending: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  Confirmed: 'bg-status-success-bg text-status-success border-status-success-border',
  Voided: 'bg-status-neutral-bg text-status-neutral border-status-neutral-border',
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

// Clickable interactive stat card that routes to filtered collections
function StatCard({ label, value, subtitle, icon: Icon, iconBg, iconColor, onClick, tooltip }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 cursor-pointer w-full group focus:outline-none focus:ring-2 focus:ring-primary/40`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg} transition-transform duration-200 group-hover:scale-105`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted group-hover:text-ink transition-colors">{label}</p>
        <p className="mt-1 text-xl font-bold tracking-tight text-ink tabular-nums break-words">{value}</p>
        {subtitle && <p className="text-[11px] text-muted truncate mt-0.5">{subtitle}</p>}
      </div>
      <ChevronRight size={15} className="text-muted/40 group-hover:text-primary transition-all duration-200 shrink-0 group-hover:translate-x-0.5" />
    </button>
  )
}

// One of the three permitted-access shortcut tiles at the top
function QuickLinkCard({ label, description, icon: Icon, iconBg, iconColor, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 cursor-pointer group`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg} transition-transform duration-200 group-hover:scale-105`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>
      <ChevronRight size={16} className="text-muted/50 group-hover:text-primary transition-all duration-200 shrink-0 group-hover:translate-x-0.5" />
    </button>
  )
}

export default function CollectorDashboard({ title = 'Dashboard', crumbs = ['Dashboard'] }) {
  const navigate = useNavigate()
  const { privacyOn: privacyMode } = usePrivacy()

  // Calendar year scoping & export (mirrors Dashboard.jsx)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  // Accounts Receivable  -  reuses the same hook AccountsReceivable.jsx uses
  const { records: arRecords, loading: arLoading, error: arError, fetchRecords } = useAccountsReceivable()

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // Collections
  const [collections, setCollections] = useState([])
  const [collectionsLoading, setCollectionsLoading] = useState(true)
  const [collectionsError, setCollectionsError] = useState('')

  const fetchCollections = useCallback(async () => {
    setCollectionsLoading(true)
    setCollectionsError('')
    try {
      const res = await apiFetch('/api/collections?per_page=500')
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

  // Customers stats
  const [customerStats, setCustomerStats] = useState({ total: 0, active: 0 })

  useEffect(() => {
    apiFetch('/api/customers/stats')
      .then((res) => res.json())
      .then((json) => { if (json.success) setCustomerStats(json.data) })
      .catch(() => {})
  }, [])

  // Live updates for the collector's own view: AR, collections and customer
  // stats all refresh in place when anything in those modules changes.
  const refreshAll = useCallback(() => {
    fetchRecords()
    fetchCollections()
    apiFetch('/api/customers/stats')
      .then((res) => res.json())
      .then((json) => { if (json.success) setCustomerStats(json.data) })
      .catch(() => {})
  }, [fetchRecords, fetchCollections])

  useDataUpdates(['accounts-receivable', 'collections', 'customers'], refreshAll)

  const activeAR = useMemo(() => arRecords.filter((r) => !r.is_archived), [arRecords])
  const activeCollections = useMemo(() => collections.filter((c) => !c.is_archived), [collections])

  // Derive available years from collection dates and AR dates
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const set = new Set([currentYear])
    collections.forEach((c) => {
      if (c.collection_date) {
        const y = new Date(c.collection_date).getFullYear()
        if (y && !isNaN(y)) set.add(y)
      }
    })
    arRecords.forEach((r) => {
      if (r.due_date) {
        const y = new Date(r.due_date).getFullYear()
        if (y && !isNaN(y)) set.add(y)
      }
    })
    return Array.from(set).sort((a, b) => b - a)
  }, [collections, arRecords])

  const stats = useMemo(() => {
    const isPastDue = (r) => r.status === 'Overdue' || (r.status !== 'Paid' && r.status !== 'Cancelled' && r.due_date && new Date(r.due_date) < new Date(new Date().toDateString()))

    const outstanding = activeAR
      .filter((r) => r.status !== 'Paid' && r.status !== 'Cancelled')
      .reduce((sum, r) => sum + Number(r.balance || 0), 0)

    const overdueCount = activeAR.filter(isPastDue).length

    const isSelectedYear = (dateStr) => {
      if (!dateStr) return false
      return new Date(dateStr).getFullYear() === year
    }

    const collectedInYear = activeCollections
      .filter((c) => c.status === 'Confirmed' && isSelectedYear(c.collection_date))
      .reduce((sum, c) => sum + Number(c.amount_received || 0), 0)

    const collectedThisMonth = activeCollections
      .filter((c) => c.status === 'Confirmed' && isThisMonth(c.collection_date))
      .reduce((sum, c) => sum + Number(c.amount_received || 0), 0)

    const pendingCollections = activeCollections.filter((c) => c.status === 'Pending').length

    return { outstanding, overdueCount, collectedInYear, collectedThisMonth, pendingCollections }
  }, [activeAR, activeCollections, year])

  // Invoices needing attention  -  unpaid balances, soonest due date first
  const outstandingInvoices = useMemo(() => {
    return [...activeAR]
      .filter((r) => r.status !== 'Paid' && r.status !== 'Cancelled')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 8)
  }, [activeAR])

  // Recent collections, scoped to selected year
  const recentCollections = useMemo(() => {
    return [...activeCollections]
      .filter((c) => {
        if (!c.collection_date) return true
        return new Date(c.collection_date).getFullYear() === year
      })
      .sort((a, b) => new Date(b.collection_date) - new Date(a.collection_date))
      .slice(0, 8)
  }, [activeCollections, year])

  const loading = arLoading || collectionsLoading

  const uniqueCustomersCount = useMemo(() => {
    if (customerStats.total > 0) return customerStats.total
    const set = new Set(activeAR.map((r) => r.customer_name).filter(Boolean))
    return set.size
  }, [customerStats.total, activeAR])

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
      link.download = `collector-dashboard-summary-${year}-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setExportError('Could not export the collector dashboard. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const MASKED = maskedAmount()
  const isCurrentYear = year === new Date().getFullYear()

  // All 4 stat cards are clickable with clear destinations
  const statCards = [
    {
      key: 'outstanding',
      label: 'Outstanding Balance',
      value: privacyMode ? MASKED : formatCurrency(stats.outstanding),
      subtitle: `${activeAR.filter((r) => r.status !== 'Paid' && r.status !== 'Cancelled').length} assigned accounts`,
      icon: Wallet,
      iconBg: 'bg-blue-50 dark:bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
      tooltip: 'Click to view invoices awaiting collection',
      onClick: () => navigate('/transactions/collections?status=Awaiting+Collection'),
    },
    {
      key: 'overdue',
      label: 'Overdue Invoices',
      value: stats.overdueCount,
      subtitle: stats.overdueCount > 0 ? 'Requires immediate follow-up' : 'All accounts within terms',
      icon: AlertTriangle,
      iconBg: 'bg-red-50 dark:bg-red-500/10',
      iconColor: 'text-red-600 dark:text-red-400',
      tooltip: 'Click to view overdue invoices needing collection',
      onClick: () => navigate('/transactions/collections?status=Awaiting+Collection&search=Overdue'),
    },
    {
      key: 'collected',
      label: isCurrentYear ? 'Collected This Year' : `Collected (${year})`,
      value: privacyMode ? MASKED : formatCurrency(stats.collectedInYear),
      subtitle: isCurrentYear ? `${privacyMode ? '•••' : formatCurrency(stats.collectedThisMonth)} this month` : `Total confirmed in ${year}`,
      icon: HandCoins,
      iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      tooltip: 'Click to view confirmed collection records',
      onClick: () => navigate('/transactions/collections?status=Confirmed'),
    },
    {
      key: 'pending',
      label: 'Awaiting Confirmation',
      value: stats.pendingCollections,
      subtitle: stats.pendingCollections > 0 ? 'Submitted for supervisor verification' : 'No collections pending approval',
      icon: Clock3,
      iconBg: 'bg-amber-50 dark:bg-amber-500/10',
      iconColor: 'text-amber-600 dark:text-amber-400',
      tooltip: 'Click to view collections awaiting confirmation',
      onClick: () => navigate('/transactions/collections?status=Pending'),
    },
  ]

  return (
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      {/* Header section with Year selector & Export button (matching Admin Dashboard) */}
      <div className={`${PANEL} flex flex-col gap-5 border-t-4 border-t-primary p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between`}>
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-dark">Your collections workspace</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">Outstanding balances and collection activity across your assigned accounts.</p>
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
        </div>
      </div>

      {(arError || collectionsError) && (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">
          {arError || collectionsError}
        </div>
      )}

      {/* Stat cards — ALL CLICKABLE with instant filter deep-link */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={loading ? '—' : card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            iconBg={card.iconBg}
            iconColor={card.iconColor}
            onClick={card.onClick}
            tooltip={card.tooltip}
          />
        ))}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickLinkCard
          label="Customers"
          description={customerStats.total > 0 ? `${customerStats.total} total, ${customerStats.active} active` : (uniqueCustomersCount > 0 ? `${uniqueCustomersCount} assigned client${uniqueCustomersCount === 1 ? '' : 's'}` : 'Directory & contacts')}
          icon={UsersIcon}
          iconBg="bg-primary/15"
          iconColor="text-primary-dark"
          onClick={() => navigate('/master-data/customers')}
        />
        <QuickLinkCard
          label="Awaiting Collection"
          description={`${outstandingInvoices.length} assigned invoice${outstandingInvoices.length === 1 ? '' : 's'} to collect`}
          icon={Receipt}
          iconBg="bg-violet-50 dark:bg-violet-500/10"
          iconColor="text-violet-600 dark:text-violet-400"
          onClick={() => navigate('/transactions/collections?status=Awaiting+Collection')}
        />
        <QuickLinkCard
          label="Collections"
          description={`${activeCollections.length} recorded payment${activeCollections.length === 1 ? '' : 's'}`}
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
            <div>
              <p className="text-sm font-semibold text-ink">Invoices to Collect</p>
              <p className="text-xs text-muted">Assigned invoices with balance</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/transactions/collections?status=Awaiting+Collection')}
              className="flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-border">
            {loading && <ContentSkeleton />}
            {!loading && outstandingInvoices.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">No outstanding invoices — all assigned accounts are settled.</p>
            )}
            {!loading && outstandingInvoices.map((r) => {
              const isOverdue = r.status === 'Overdue' || (r.status !== 'Paid' && r.status !== 'Cancelled' && r.due_date && new Date(r.due_date) < new Date(new Date().toDateString()))
              return (
                <div key={r.ar_id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg/40 transition-colors">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{r.customer_name || `Invoice ${r.invoice_number}`}</p>
                    <p className="text-xs text-muted">
                      {r.invoice_number} &middot;{' '}
                      {isOverdue ? (
                        <span className="text-status-danger font-medium">Due {formatDate(r.due_date)} · Overdue</span>
                      ) : (
                        r.due_date ? `Due ${formatDate(r.due_date)}` : 'No due date'
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2.5">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-ink">{formatCurrency(r.balance)}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${isOverdue ? AR_STATUS_STYLES.Overdue : (AR_STATUS_STYLES[r.status] || '')}`}>
                        {isOverdue ? 'Overdue' : r.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/transactions/collections')}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 text-xs font-semibold transition-all duration-150 active:scale-95 shrink-0"
                      title="Collect payment in Collections"
                    >
                      <HandCoins size={12} />
                      Collect
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent collection activity for selected year */}
        <div className={PANEL}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Recent Collections ({year})</p>
              <p className="text-xs text-muted">Latest collection records for {year}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/transactions/collections')}
              className="flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-border">
            {loading && <ContentSkeleton />}
            {!loading && recentCollections.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">No collections recorded for {year}.</p>
            )}
            {!loading && recentCollections.map((c) => (
              <div key={c.collection_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.receipt_number}</p>
                  <p className="text-xs text-muted">{formatDate(c.collection_date)} &middot; {c.payment_method}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-ink">{formatCurrency(c.amount_received)}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${COLLECTION_STATUS_STYLES[c.status] || ''}`}>{c.status === 'Pending' ? 'Awaiting Confirmation' : c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
