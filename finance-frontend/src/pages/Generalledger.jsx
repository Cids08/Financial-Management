import { useEffect, useMemo, useState } from 'react'
import { Search, BookOpen, Scale, TrendingUp, TrendingDown, Info, ListTree, Rows3, Loader2, AlertTriangle } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { apiFetch } from '../utils/api'

const REFERENCE_TYPES = ['Collections', 'Disbursements', 'Accounts Receivable', 'Accounts Payable', 'Expenses', 'Tax Obligations']

const REFERENCE_STYLES = {
  Collections: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Disbursements: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  'Accounts Receivable': 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  'Accounts Payable': 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  Expenses: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Tax Obligations': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }

const SEARCH_INPUT = `w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`

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

const EMPTY_FILTERS = { search: '', referenceFilter: 'all', accountFilter: 'all', dateFrom: '', dateTo: '', lineFilter: 'all' }

const DATE_PRESETS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom Range' },
]

const toISODate = (d) => d.toISOString().slice(0, 10)

/** Returns { from, to } (either can be '') for a given preset key, anchored to now. */
function resolveDatePreset(key) {
  const now = new Date()
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  switch (key) {
    case 'today': {
      const day = startOfDay(now)
      return { from: toISODate(day), to: toISODate(day) }
    }
    case 'week': {
      const day = startOfDay(now)
      const start = new Date(day)
      start.setDate(day.getDate() - day.getDay()) // Sunday
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
      const start = new Date(now.getFullYear(), quarterStartMonth, 1)
      const end = new Date(now.getFullYear(), quarterStartMonth + 3, 0)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'all':
    default:
      return { from: '', to: '' }
  }
}

export default function GeneralLedger({ title = 'General Ledger', crumbs = ['Financial Transactions', 'General Ledger'] }) {
  const [view, setView] = useState('journal') // 'journal' | 'trial-balance'
  const [search, setSearch] = useState(EMPTY_FILTERS.search)
  const [debouncedSearch, setDebouncedSearch] = useState(EMPTY_FILTERS.search)
  const [referenceFilter, setReferenceFilter] = useState(EMPTY_FILTERS.referenceFilter)
  const [accountFilter, setAccountFilter] = useState(EMPTY_FILTERS.accountFilter)
  const [dateFrom, setDateFrom] = useState(EMPTY_FILTERS.dateFrom)
  const [dateTo, setDateTo] = useState(EMPTY_FILTERS.dateTo)
  const [datePreset, setDatePreset] = useState('all')
  const [lineFilter, setLineFilter] = useState(EMPTY_FILTERS.lineFilter) // 'all' | 'debit' | 'credit'
  const [page, setPage] = useState(1)

  const [detailGroup, setDetailGroup] = useState(null) // lines for the journal entry shown in the detail modal
  const [detailLoading, setDetailLoading] = useState(false)

  const [accounts, setAccounts] = useState([])
  const [lines, setLines] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, grand_totals: { debit: 0, credit: 0, balanced: true, difference: 0 } })
  const [trialBalance, setTrialBalance] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Debounce free-text search so it doesn't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  // Chart of accounts for the filter dropdown — fetched once.
  // FIX: was hitting /api/chart-of-accounts, which doesn't exist — the
  // route is nested under the general-ledger prefix in routes/api.php
  // (Route::prefix('general-ledger')->group(...) -> '/chart-of-accounts'
  // resolves to /api/general-ledger/chart-of-accounts).
  useEffect(() => {
    apiFetch('/api/general-ledger/chart-of-accounts')
      .then((res) => res.json())
      .then((json) => setAccounts(json.data || []))
      .catch(() => setAccounts([]))
  }, [])

  const filterParams = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (referenceFilter !== 'all') params.set('reference_type', referenceFilter)
    if (accountFilter !== 'all') params.set('account_id', accountFilter)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    if (lineFilter !== 'all') params.set('side', lineFilter)
    return params
  }, [debouncedSearch, referenceFilter, accountFilter, dateFrom, dateTo, lineFilter])

  // Reset to page 1 whenever a filter changes (not on page changes themselves).
  useEffect(() => { setPage(1) }, [filterParams])

  // Journal lines — depends on filters + page.
  useEffect(() => {
    if (view !== 'journal') return
    setLoading(true)
    setError(null)
    const params = new URLSearchParams(filterParams)
    params.set('page', String(page))

    apiFetch(`/api/general-ledger/lines?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        setLines(json.data || [])
        setMeta(json.meta || meta)
      })
      .catch(() => setError('Could not load journal entries. Please try again.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filterParams, page])

  // Trial balance — depends on filters only (no pagination).
  useEffect(() => {
    if (view !== 'trial-balance') return
    setLoading(true)
    setError(null)
    apiFetch(`/api/general-ledger/trial-balance?${filterParams.toString()}`)
      .then((res) => res.json())
      .then((json) => setTrialBalance(json.data || []))
      .catch(() => setError('Could not load the trial balance. Please try again.'))
      .finally(() => setLoading(false))
  }, [view, filterParams])

  const trialTotals = useMemo(() => ({
    debit: trialBalance.reduce((sum, r) => sum + Number(r.total_debit || 0), 0),
    credit: trialBalance.reduce((sum, r) => sum + Number(r.total_credit || 0), 0),
  }), [trialBalance])

  const grandTotals = meta.grand_totals || { debit: 0, credit: 0, balanced: true, difference: 0 }

  const applyDatePreset = (key) => {
    setDatePreset(key)
    if (key === 'custom') return // leave dateFrom/dateTo as the user last set them
    const { from, to } = resolveDatePreset(key)
    setDateFrom(from)
    setDateTo(to)
  }

  const resetFilters = () => {
    setSearch(EMPTY_FILTERS.search)
    setReferenceFilter(EMPTY_FILTERS.referenceFilter)
    setAccountFilter(EMPTY_FILTERS.accountFilter)
    setDateFrom(EMPTY_FILTERS.dateFrom)
    setDateTo(EMPTY_FILTERS.dateTo)
    setDatePreset('all')
    setLineFilter(EMPTY_FILTERS.lineFilter)
  }

  const statCards = [
    {
      key: 'entries',
      label: 'Total Line Entries',
      value: meta.total ?? 0,
      icon: BookOpen,
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary-dark',
      isActive: lineFilter === 'all' && view === 'journal',
      onClick: () => { resetFilters(); setView('journal') },
    },
    {
      key: 'debit',
      label: 'Total Debits',
      value: formatCurrency(grandTotals.debit),
      icon: TrendingUp,
      iconBg: 'bg-blue-50 dark:bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
      isActive: lineFilter === 'debit',
      onClick: () => { setLineFilter('debit'); setView('journal') },
    },
    {
      key: 'credit',
      label: 'Total Credits',
      value: formatCurrency(grandTotals.credit),
      icon: TrendingDown,
      iconBg: 'bg-purple-50 dark:bg-purple-500/10',
      iconColor: 'text-purple-600 dark:text-purple-400',
      isActive: lineFilter === 'credit',
      onClick: () => { setLineFilter('credit'); setView('journal') },
    },
    {
      key: 'balance',
      label: 'Books Balanced',
      value: grandTotals.balanced ? 'Yes' : 'No',
      icon: Scale,
      iconBg: grandTotals.balanced ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-red-50 dark:bg-red-500/10',
      iconColor: grandTotals.balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      isActive: view === 'trial-balance',
      onClick: () => setView('trial-balance'),
    },
  ]

  const openGroupDetail = (line) => {
    setDetailLoading(true)
    setDetailGroup({ journal_entry_id: line.journal_entry_id }) // open modal immediately with a loading state
    apiFetch(`/api/general-ledger/entries/${line.journal_entry_id}`)
      .then((res) => res.json())
      .then((json) => setDetailGroup(json.data))
      .catch(() => setDetailGroup(null))
      .finally(() => setDetailLoading(false))
  }
  const closeDetail = () => setDetailGroup(null)

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">
          Every posted Collection, Disbursement, Expense, and Tax Obligation lands here automatically as a balanced debit/credit pair. This ledger is system-generated and view-only.
        </p>
      </div>

      {/* Stat cards — clickable quick filters */}
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
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={15} className={card.iconColor} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted truncate" title={card.label}>{card.label}</p>
                <p className="text-lg font-bold text-ink truncate" title={String(card.value)}>{card.value}</p>
              </div>
            </button>
          )
        })}
      </div>

      {!grandTotals.balanced && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle size={15} className="shrink-0" />
          Ledger is out of balance by {formatCurrency(Math.abs(grandTotals.difference))}. Check the source transaction that posted a one-sided entry.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1 min-w-0 basis-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by description or account..."
              className={SEARCH_INPUT}
              style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0 }}
              autoComplete="off"
            />
          </div>
          <select value={referenceFilter} onChange={(e) => setReferenceFilter(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE}>
            <option value="all">All Sources</option>
            {REFERENCE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE}>
            <option value="all">All Accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
          {lineFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setLineFilter('all')}
              className="whitespace-nowrap text-xs font-medium text-primary-dark hover:underline"
            >
              Clear {lineFilter} filter
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <select
            value={datePreset}
            onChange={(e) => applyDatePreset(e.target.value)}
            className={INPUT}
            style={{ ...INPUT_TEXT_STYLE, maxWidth: '11rem' }}
          >
            {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted whitespace-nowrap">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value) }}
              className={INPUT}
              style={INPUT_TEXT_STYLE}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted whitespace-nowrap">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value) }}
              className={INPUT}
              style={INPUT_TEXT_STYLE}
            />
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-bg p-1">
            <button
              type="button"
              onClick={() => setView('journal')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${view === 'journal' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              <Rows3 size={13} /> Journal
            </button>
            <button
              type="button"
              onClick={() => setView('trial-balance')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${view === 'trial-balance' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              <ListTree size={13} /> Trial Balance
            </button>
          </div>
        </div>

      </div>

      {loading && (
        <div className={`${PANEL} ${PANEL_PAD} flex items-center justify-center gap-2 py-10 text-sm text-muted`}>
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}

      {!loading && view === 'journal' && (
        <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface" border-border rounded-lg>
                <tr className="border-b border-border">
                  <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Account</th>
                  <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Description</th>
                  <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Source</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Debit</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Credit</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Details</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((e) => (
                  <tr
                    key={e.journal_id}
                    onClick={() => openGroupDetail(e)}
                    className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(e.transaction_date)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{e.account_code} — {e.account_name}</td>
                    <td className="px-4 py-3.5 text-ink max-w-70 truncate">{e.description}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {e.reference_type && (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${REFERENCE_STYLES[e.reference_type] || 'bg-slate-100 text-slate-600'}`}>{e.reference_type}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{e.debit ? formatCurrency(e.debit) : '—'}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{e.credit ? formatCurrency(e.credit) : '—'}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <Tooltip label="View transaction pair" position="left">
                        <button
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); openGroupDetail(e) }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink transition-colors duration-150 ml-auto"
                        >
                          <Info size={15} />
                        </button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No journal entries match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {meta.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
              <span>Page {meta.current_page} of {meta.last_page} · {meta.total} lines</span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={meta.current_page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <Button variant="secondary" size="sm" disabled={meta.current_page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && view === 'trial-balance' && (
        <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface" border-border rounded-lg>
                <tr className="border-b border-border">
                  <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Account</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Total Debit</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Total Credit</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.map((row) => {
                  const net = Number(row.net_balance || 0)
                  return (
                    <tr
                      key={row.account_id}
                      onClick={() => { setAccountFilter(String(row.account_id)); setView('journal') }}
                      className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
                    >
                      <td className="px-4 py-3.5 text-ink">{row.account_code} — {row.account_name}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{row.total_debit ? formatCurrency(row.total_debit) : '—'}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{row.total_credit ? formatCurrency(row.total_credit) : '—'}</td>
                      <td className={`px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-medium ${net > 0 ? 'text-blue-600 dark:text-blue-400' : net < 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted'}`}>
                        {net === 0 ? '—' : formatCurrency(Math.abs(net)) + (net > 0 ? ' Dr' : ' Cr')}
                      </td>
                    </tr>
                  )
                })}
                {trialBalance.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">No entries match your filters.</td></tr>
                )}
              </tbody>
              {trialBalance.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Totals</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(trialTotals.debit)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(trialTotals.credit)}</td>
                    <td className={`px-4 py-3 whitespace-nowrap text-right tabular-nums ${Math.abs(trialTotals.debit - trialTotals.credit) < 0.005 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {Math.abs(trialTotals.debit - trialTotals.credit) < 0.005 ? 'Balanced' : formatCurrency(Math.abs(trialTotals.debit - trialTotals.credit)) + ' off'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <Modal open={!!detailGroup} onClose={closeDetail} title="Transaction Detail" footer={<Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>}>
        {detailLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}
        {!detailLoading && detailGroup?.lines && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{detailGroup.description}</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${detailGroup.is_balanced ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}`}>
                {detailGroup.is_balanced ? 'Balanced' : 'Out of Balance'}
              </span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              {detailGroup.lines.map((line) => (
                <div key={line.id} className="px-3 py-2">
                  <DetailRow label="Account" value={`${line.account_code} — ${line.account_name}`} />
                  <DetailRow label="Debit" value={line.debit ? formatCurrency(line.debit) : '—'} />
                  <DetailRow label="Credit" value={line.credit ? formatCurrency(line.credit) : '—'} />
                  <DetailRow label="Posted" value={formatDateTime(line.created_at)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}