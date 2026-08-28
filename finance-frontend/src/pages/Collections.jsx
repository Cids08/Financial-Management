import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, HandCoins, CheckCircle2, Clock3, Wallet, Info, Printer, TrendingUp } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { apiFetch } from '../utils/api'

// Lookups
const AR_RECORDS = [
  { ar_id: 1, invoice_number: 'INV-2026-0001', customer_name: 'Delacruz Trading' },
  { ar_id: 2, invoice_number: 'INV-2026-0002', customer_name: 'Meridian Retail Corp.' },
  { ar_id: 3, invoice_number: 'INV-2026-0003', customer_name: 'Northgate Traders' },
  { ar_id: 4, invoice_number: 'INV-2026-0004', customer_name: 'Bayview Logistics' },
  { ar_id: 5, invoice_number: 'INV-2026-0005', customer_name: 'Sierra Hardware Supply' },
]
const COLLECTORS = [
  { collector_id: 1, name: 'Ramon Torres' },
  { collector_id: 2, name: 'Bea Navarro' },
  { collector_id: 3, name: 'Efren Domingo' },
  { collector_id: 4, name: 'Josie Ramirez' },
  { collector_id: 5, name: 'Nestor Villa' },
]
const CASH_ACCOUNTS = [
  { cash_account_id: 1, account_name: 'BDO Operating Account' },
  { cash_account_id: 2, account_name: 'BPI Payroll Account' },
  { cash_account_id: 3, account_name: 'Metrobank Reserve Fund' },
  { cash_account_id: 4, account_name: 'Head Office Petty Cash' },
]
// Users (created_by / archived_by on the ERD)
const USERS = [
  { user_id: 1, first_name: 'Ana', last_name: 'Reyes' },
  { user_id: 2, first_name: 'Marco', last_name: 'Santos' },
  { user_id: 3, first_name: 'Liza', last_name: 'Fernandez' },
]
const arInfo = (id) => AR_RECORDS.find((a) => a.ar_id === Number(id))
const collectorName = (id) => COLLECTORS.find((c) => c.collector_id === Number(id))?.name || 'Unknown'
const accountName = (id) => CASH_ACCOUNTS.find((a) => a.cash_account_id === Number(id))?.account_name || 'Unknown'
const userName = (id) => {
  const u = USERS.find((u) => u.user_id === Number(id))
  return u ? `${u.first_name} ${u.last_name}` : '—'
}

const initialCollections = [
  { collection_id: 1, ar_id: 1, collector_id: 1, receipt_number: 'OR-10021', collection_date: '2026-07-15', amount_received: 60000, payment_method: 'Cash', reference_number: 'REF-COL-001', cash_account_id: 4, status: 'Confirmed', remarks: '', created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-15T09:30:00', updated_at: '2026-07-15T09:30:00' },
  { collection_id: 2, ar_id: 2, collector_id: 2, receipt_number: 'OR-10022', collection_date: '2026-07-20', amount_received: 49000, payment_method: 'Check', reference_number: 'REF-COL-002', cash_account_id: 1, status: 'Confirmed', remarks: '', created_by: 2, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-20T11:10:00', updated_at: '2026-07-20T11:10:00' },
  { collection_id: 3, ar_id: 3, collector_id: 3, receipt_number: 'OR-10023', collection_date: '2026-07-25', amount_received: 20000, payment_method: 'Bank Transfer', reference_number: 'REF-COL-003', cash_account_id: 2, status: 'Pending', remarks: 'Awaiting bank confirmation', created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-25T08:45:00', updated_at: '2026-07-25T08:45:00' },
  { collection_id: 4, ar_id: 4, collector_id: 1, receipt_number: 'OR-10024', collection_date: '2026-06-10', amount_received: 210000, payment_method: 'Bank Transfer', reference_number: 'REF-COL-004', cash_account_id: 1, status: 'Confirmed', remarks: 'Full settlement', created_by: 3, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-06-10T14:00:00', updated_at: '2026-06-10T14:00:00' },
  { collection_id: 5, ar_id: 5, collector_id: 5, receipt_number: 'OR-10018', collection_date: '2026-05-02', amount_received: 15000, payment_method: 'Cash', reference_number: 'REF-COL-005', cash_account_id: 4, status: 'Voided', remarks: 'Receipt voided due to error', created_by: 2, is_archived: true, archived_at: '2026-07-28T10:00:00', archived_by: 2, created_at: '2026-05-02T09:00:00', updated_at: '2026-07-28T10:00:00' },
]

const PAYMENT_METHODS = ['Cash', 'Check', 'Bank Transfer', 'GCash', 'Credit Card']
const STATUS_OPTIONS = ['Pending', 'Confirmed', 'Voided']

const EMPTY_FORM = { ar_id: AR_RECORDS[0].ar_id, collector_id: COLLECTORS[0].collector_id, receipt_number: '', collection_date: '', amount_received: '', payment_method: 'Cash', reference_number: '', cash_account_id: CASH_ACCOUNTS[0].cash_account_id, status: 'Pending', remarks: '' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Confirmed: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Voided: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

// Matches CollectionService::efficiency()'s $granularity allow-list —
// day/week/month/year, no quarter.
const EFFICIENCY_PERIODS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
]

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

/**
 * Collection Efficiency panel — per collector, fetches
 * GET /api/collectors/{collectorId}/efficiency?period=X&limit=12.
 * Matches CollectionService::efficiency(): efficiency% = collected ÷
 * the collector's monthly_target (prorated to the bucket length), NOT
 * AR due amounts. Response is ordered most-recent-bucket-first; reversed
 * here for a chronological left-to-right chart.
 *
 * ASSUMPTION: GET /api/collectors returns objects shaped like
 * { id, first_name, last_name, ... }, matching the 'collector:id,
 * first_name,last_name' eager-load already used in DashboardService.php.
 * If the real shape differs, adjust the .map() below.
 */
function CollectionEfficiencyPanel() {
  const [period, setPeriod] = useState('month')
  const [collectorId, setCollectorId] = useState(null)
  const [collectors, setCollectors] = useState([])
  const [collectorsLoading, setCollectorsLoading] = useState(true)
  const [buckets, setBuckets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/collectors')
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.message || 'Failed to load collectors.')
        setCollectors(json.data)
        if (json.data.length > 0) setCollectorId(json.data[0].id)
      })
      .catch((err) => setError(err.message))
      .finally(() => setCollectorsLoading(false))
  }, [])

  useEffect(() => {
    if (!collectorId) return
    let cancelled = false
    setLoading(true)
    setError('')
    apiFetch(`/api/collectors/${collectorId}/efficiency?period=${period}&limit=12`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (!json.success) throw new Error(json.message || 'Failed to load efficiency data.')
        // Backend returns most-recent-first; reverse for a chronological chart.
        setBuckets([...json.data].reverse())
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [collectorId, period])

  const avgEfficiency = useMemo(() => {
    if (buckets.length === 0) return null
    return Math.round((buckets.reduce((sum, b) => sum + b.efficiency, 0) / buckets.length) * 10) / 10
  }, [buckets])

  return (
    <div className={`${PANEL} ${PANEL_PAD} space-y-3`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
            <TrendingUp size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Collection Efficiency</p>
            <p className="text-xs text-muted">
              Collected vs. target{avgEfficiency !== null && <> · avg <span className="font-medium text-ink">{avgEfficiency}%</span></>}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={collectorId ?? ''}
            onChange={(e) => setCollectorId(Number(e.target.value))}
            disabled={collectorsLoading || collectors.length === 0}
            className={`${INPUT} sm:w-56`}
          >
            {collectors.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {EFFICIENCY_PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150
                  ${period === p.key ? 'border-primary bg-primary/10 text-primary-dark' : 'border-border text-muted hover:border-primary/40'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

      {collectorsLoading || loading ? (
        <p className="text-sm text-muted py-8 text-center">Loading efficiency data…</p>
      ) : collectors.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">No collectors found.</p>
      ) : buckets.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">No data for this period yet.</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 'dataMax + 10']} />
              <RechartsTooltip
                formatter={(value, name) => (name === 'efficiency' ? [`${value}%`, 'Efficiency'] : [formatCurrency(value), name === 'collected' ? 'Collected' : 'Target'])}
              />
              <Bar dataKey="efficiency" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export default function Collections({ title = 'Collections', crumbs = ['Financial Transactions', 'Collections'] }) {
  const [collections, setCollections] = useState(initialCollections)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)

  const filtered = useMemo(() => {
    return collections.filter((c) => {
      if (!showArchived && c.is_archived) return false
      if (showArchived && !c.is_archived) return false
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      const info = arInfo(c.ar_id)
      const q = search.toLowerCase()
      if (search && !c.receipt_number.toLowerCase().includes(q) && !(info?.customer_name.toLowerCase().includes(q)) && !collectorName(c.collector_id).toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [collections, search, statusFilter, showArchived])

  const stats = useMemo(() => {
    const active = collections.filter((c) => !c.is_archived)
    return {
      total: active.length,
      collected: active.filter((c) => c.status === 'Confirmed').reduce((sum, c) => sum + c.amount_received, 0),
      pending: active.filter((c) => c.status === 'Pending').length,
      archived: collections.filter((c) => c.is_archived).length,
    }
  }, [collections])

  const toggleArchive = (id) => {
    setCollections((prev) => prev.map((c) => {
      if (c.collection_id !== id) return c
      const nextArchived = !c.is_archived
      return { ...c, is_archived: nextArchived, archived_at: nextArchived ? new Date().toISOString() : null, archived_by: nextArchived ? 1 : null, updated_at: new Date().toISOString() }
    }))
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (c) => {
    setForm({ ar_id: c.ar_id, collector_id: c.collector_id, receipt_number: c.receipt_number, collection_date: c.collection_date, amount_received: c.amount_received, payment_method: c.payment_method, reference_number: c.reference_number, cash_account_id: c.cash_account_id, status: c.status, remarks: c.remarks })
    setFormError('')
    setModalMode(c)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const openDetail = (c) => setDetailRecord(c)
  const closeDetail = () => setDetailRecord(null)

  const handlePrint = (c) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const info = arInfo(c.ar_id)
    const rows = [
      ['Invoice', info?.invoice_number || '—'],
      ['Customer', info?.customer_name || '—'],
      ['Collector', collectorName(c.collector_id)],
      ['Collection Date', formatDate(c.collection_date)],
      ['Amount Received', formatCurrency(c.amount_received)],
      ['Payment Method', c.payment_method],
      ['Deposited To', accountName(c.cash_account_id)],
      ['Reference No.', c.reference_number || '—'],
      ['Status', c.status],
      ...(c.remarks ? [['Remarks', c.remarks]] : []),
    ]
    win.document.write(`
      <html>
        <head>
          <title>${c.receipt_number}</title>
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
            <div><h1>Official Receipt ${c.receipt_number}</h1><p>${info?.customer_name || ''}</p></div>
            <span class="status">${c.status}</span>
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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.receipt_number.trim() || !form.collection_date || !form.amount_received) {
      setFormError('Receipt number, collection date, and amount are required.')
      return
    }
    const payload = { ...form, ar_id: Number(form.ar_id), collector_id: Number(form.collector_id), cash_account_id: Number(form.cash_account_id), amount_received: Number(form.amount_received) || 0 }
    const now = new Date().toISOString()
    if (modalMode === 'add') {
      const nextId = Math.max(0, ...collections.map((c) => c.collection_id)) + 1
      setCollections((prev) => [...prev, { collection_id: nextId, ...payload, created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: now, updated_at: now }])
    } else if (modalMode) {
      const editingId = modalMode.collection_id
      setCollections((prev) => prev.map((c) => (c.collection_id === editingId ? { ...c, ...payload, updated_at: now } : c)))
    }
    closeModal()
  }

  const statCards = [
    { key: 'total', label: 'Total Collections', value: stats.total, icon: HandCoins, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'collected', label: 'Confirmed Amount', value: formatCurrency(stats.collected), icon: Wallet, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Confirmed' && !showArchived, onClick: () => { setStatusFilter('Confirmed'); setShowArchived(false) } },
    { key: 'pending', label: 'Pending', value: stats.pending, icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: statusFilter === 'Pending' && !showArchived, onClick: () => { setStatusFilter('Pending'); setShowArchived(false) } },
    { key: 'archived', label: 'Archived', value: stats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: showArchived, onClick: () => setShowArchived(true) },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Record customer payments received against outstanding invoices.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Collection</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => {
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

      <CollectionEfficiencyPanel />

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by receipt no., customer, or collector..." className={`${INPUT} pl-9`} />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${INPUT} lg:w-56! shrink-0`}
        >
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      
      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Receipt</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Invoice / Customer</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Collector</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const info = arInfo(c.ar_id)
                return (
                  <tr key={c.collection_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{c.receipt_number}</p>
                      <p className="text-xs text-muted">{formatDate(c.collection_date)} &middot; {accountName(c.cash_account_id)}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink">{info?.invoice_number}</p>
                      <p className="text-xs text-muted">{info?.customer_name}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{collectorName(c.collector_id)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(c.amount_received)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="View full record" align="start">
                          <button type="button" onClick={() => openDetail(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Info size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Print receipt" align="start">
                          <button type="button" onClick={() => handlePrint(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Printer size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Edit collection" align="start">
                          <button type="button" onClick={() => openEdit(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label={c.is_archived ? 'Restore collection' : 'Archive collection'} align="end">
                          <button type="button" onClick={() => toggleArchive(c.collection_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            {c.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No collections match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Collection' : 'Add Collection'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Collection'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Invoice</label>
              <select value={form.ar_id} onChange={(e) => setForm((f) => ({ ...f, ar_id: e.target.value }))} className={INPUT}>
                {AR_RECORDS.map((a) => <option key={a.ar_id} value={a.ar_id}>{a.invoice_number} — {a.customer_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Collector</label>
              <select value={form.collector_id} onChange={(e) => setForm((f) => ({ ...f, collector_id: e.target.value }))} className={INPUT}>
                {COLLECTORS.map((c) => <option key={c.collector_id} value={c.collector_id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Receipt Number</label>
              <input type="text" value={form.receipt_number} onChange={(e) => setForm((f) => ({ ...f, receipt_number: e.target.value }))} className={INPUT} placeholder="OR-10021" />
            </div>
            <div>
              <label className={LABEL}>Collection Date</label>
              <input type="date" value={form.collection_date} onChange={(e) => setForm((f) => ({ ...f, collection_date: e.target.value }))} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Amount Received</label>
              <input type="number" value={form.amount_received} onChange={(e) => setForm((f) => ({ ...f, amount_received: e.target.value }))} className={INPUT} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className={INPUT}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Deposit To (Cash Account)</label>
              <select value={form.cash_account_id} onChange={(e) => setForm((f) => ({ ...f, cash_account_id: e.target.value }))} className={INPUT}>
                {CASH_ACCOUNTS.map((a) => <option key={a.cash_account_id} value={a.cash_account_id}>{a.account_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Reference Number</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))} className={INPUT} placeholder="REF-COL-001" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} placeholder="Optional notes" />
          </div>

          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <p className="text-xs font-medium text-muted mb-1">Record Info (read-only)</p>
              <DetailRow label="Created by" value={userName(modalMode.created_by)} />
              <DetailRow label="Created at" value={formatDateTime(modalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(modalMode.updated_at)} />
              {modalMode.is_archived && (
                <>
                  <DetailRow label="Archived by" value={userName(modalMode.archived_by)} />
                  <DetailRow label="Archived at" value={formatDateTime(modalMode.archived_at)} />
                </>
              )}
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!detailRecord}
        onClose={closeDetail}
        title="Collection Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Receipt</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.receipt_number}</p>
                <p className="text-xs text-muted">{arInfo(detailRecord.ar_id)?.customer_name}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status]}`}>{detailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Invoice" value={arInfo(detailRecord.ar_id)?.invoice_number} />
                <DetailRow label="Collector" value={collectorName(detailRecord.collector_id)} />
                <DetailRow label="Collection Date" value={formatDate(detailRecord.collection_date)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Amount Received" value={formatCurrency(detailRecord.amount_received)} />
                <DetailRow label="Payment Method" value={detailRecord.payment_method} />
                <DetailRow label="Deposited To" value={accountName(detailRecord.cash_account_id)} />
                <DetailRow label="Reference No." value={detailRecord.reference_number} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Remarks" value={detailRecord.remarks || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={userName(detailRecord.created_by)} />
                <DetailRow label="Created at" value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(detailRecord.updated_at)} />
                <DetailRow label="Archived" value={detailRecord.is_archived ? 'Yes' : 'No'} />
                {detailRecord.is_archived && (
                  <>
                    <DetailRow label="Archived by" value={userName(detailRecord.archived_by)} />
                    <DetailRow label="Archived at" value={formatDateTime(detailRecord.archived_at)} />
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