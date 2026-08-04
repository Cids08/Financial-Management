import { useMemo, useState } from 'react'
import { Search, BookOpen, Scale, TrendingUp, TrendingDown, Info, ListTree, Rows3 } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'

// Simplified chart of accounts for display purposes
const ACCOUNTS = [
  { account_code: '1000', account_name: 'Cash on Hand', type: 'Asset' },
  { account_code: '1010', account_name: 'BDO Operating Account', type: 'Asset' },
  { account_code: '1011', account_name: 'BPI Payroll Account', type: 'Asset' },
  { account_code: '1012', account_name: 'Metrobank Reserve Fund', type: 'Asset' },
  { account_code: '1100', account_name: 'Accounts Receivable', type: 'Asset' },
  { account_code: '2000', account_name: 'Accounts Payable', type: 'Liability' },
  { account_code: '2100', account_name: 'Taxes Payable', type: 'Liability' },
  { account_code: '4000', account_name: 'Sales Revenue', type: 'Revenue' },
  { account_code: '5100', account_name: 'Operating Expenses', type: 'Expense' },
  { account_code: '5200', account_name: 'Collection Commission Expense', type: 'Expense' },
  { account_code: '5300', account_name: 'Tax Expense', type: 'Expense' },
]

// O(1) lookups instead of a fresh Array.find() scan on every call
const ACCOUNTS_MAP = new Map(ACCOUNTS.map((a) => [a.account_code, a]))
const accountLabel = (code) => {
  const a = ACCOUNTS_MAP.get(code)
  return a ? `${a.account_code} — ${a.account_name}` : code
}
const accountName = (code) => ACCOUNTS_MAP.get(code)?.account_name || '—'

const REFERENCE_TYPES = ['Collections', 'Disbursements', 'Accounts Receivable', 'Accounts Payable', 'Budgets', 'Expenses', 'Tax Obligations']

const REFERENCE_STYLES = {
  Collections: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Disbursements: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  'Accounts Receivable': 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  'Accounts Payable': 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  Budgets: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Expenses: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Tax Obligations': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

// Each real-world transaction posts as a matched pair of lines sharing reference_type + reference_id.
// Every entry here is system-generated the moment its source transaction (a Collection,
// Disbursement, Budget release, Expense, or Tax Obligation payment) is saved — there is no
// manual posting path, so the ledger can never fall out of balance from a one-sided entry.
const initialEntries = [
  { journal_id: 1, reference_type: 'Collections', reference_id: 1, account_code: '1012', debit: 60000, credit: 0, description: 'OR-10021 — Delacruz Trading collection', transaction_date: '2026-07-15', created_at: '2026-07-15T09:30:00' },
  { journal_id: 2, reference_type: 'Collections', reference_id: 1, account_code: '1100', debit: 0, credit: 60000, description: 'OR-10021 — Delacruz Trading collection', transaction_date: '2026-07-15', created_at: '2026-07-15T09:30:00' },

  { journal_id: 3, reference_type: 'Collections', reference_id: 2, account_code: '1010', debit: 49000, credit: 0, description: 'OR-10022 — Meridian Retail Corp. collection', transaction_date: '2026-07-20', created_at: '2026-07-20T11:10:00' },
  { journal_id: 4, reference_type: 'Collections', reference_id: 2, account_code: '1100', debit: 0, credit: 49000, description: 'OR-10022 — Meridian Retail Corp. collection', transaction_date: '2026-07-20', created_at: '2026-07-20T11:10:00' },

  { journal_id: 5, reference_type: 'Disbursements', reference_id: 1, account_code: '2000', debit: 84500, credit: 0, description: 'Payment to Northgate Supplies Inc.', transaction_date: '2026-07-18', created_at: '2026-07-18T14:00:00' },
  { journal_id: 6, reference_type: 'Disbursements', reference_id: 1, account_code: '1010', debit: 0, credit: 84500, description: 'Payment to Northgate Supplies Inc.', transaction_date: '2026-07-18', created_at: '2026-07-18T14:00:00' },

  { journal_id: 7, reference_type: 'Expenses', reference_id: 1, account_code: '5200', debit: 1500, credit: 0, description: 'Collector commission — Ramon Torres', transaction_date: '2026-07-15', created_at: '2026-07-15T09:35:00' },
  { journal_id: 8, reference_type: 'Expenses', reference_id: 1, account_code: '1000', debit: 0, credit: 1500, description: 'Collector commission — Ramon Torres', transaction_date: '2026-07-15', created_at: '2026-07-15T09:35:00' },

  { journal_id: 9, reference_type: 'Tax Obligations', reference_id: 101, account_code: '5300', debit: 84500, credit: 0, description: 'BIR VAT payment — June 2026 (BIR-VAT-0620)', transaction_date: '2026-07-18', created_at: '2026-07-18T10:15:00' },
  { journal_id: 10, reference_type: 'Tax Obligations', reference_id: 101, account_code: '1010', debit: 0, credit: 84500, description: 'BIR VAT payment — June 2026 (BIR-VAT-0620)', transaction_date: '2026-07-18', created_at: '2026-07-18T10:15:00' },
]

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

// bg-surface + !text-ink (Tailwind important) instead of bg-bg/text-ink, so this
// can't lose a specificity fight against a parent panel's own background/text
// tinting. INPUT_TEXT_STYLE + outline:'none' are the belt-and-suspenders layer.
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }

// Search field — same rounded-lg box/height as the filter dropdowns (not a pill),
// just with left padding for the icon.
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

export default function GeneralLedger({ title = 'General Ledger', crumbs = ['Financial Transactions', 'General Ledger'] }) {
  const [entries] = useState(initialEntries)
  const [view, setView] = useState('journal') // 'journal' | 'trial-balance'
  const [search, setSearch] = useState(EMPTY_FILTERS.search)
  const [referenceFilter, setReferenceFilter] = useState(EMPTY_FILTERS.referenceFilter)
  const [accountFilter, setAccountFilter] = useState(EMPTY_FILTERS.accountFilter)
  const [dateFrom, setDateFrom] = useState(EMPTY_FILTERS.dateFrom)
  const [dateTo, setDateTo] = useState(EMPTY_FILTERS.dateTo)
  // 'all' | 'debit' | 'credit' — which side of the ledger to show; driven by the stat cards
  const [lineFilter, setLineFilter] = useState(EMPTY_FILTERS.lineFilter)

  const [detailGroup, setDetailGroup] = useState(null) // reference_type + reference_id group shown in detail modal

  // AUTOMATION: grand totals and the balance check are recomputed live from the entries
  // themselves — there's nothing to toggle or refresh. If debits ever stop equaling
  // credits (e.g. a source module posted a one-sided pair), the ledger flags it immediately.
  const grandTotals = useMemo(() => {
    const debit = entries.reduce((sum, e) => sum + e.debit, 0)
    const credit = entries.reduce((sum, e) => sum + e.credit, 0)
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005, difference: debit - credit }
  }, [entries])

  const filtered = useMemo(() => {
    return entries
      .filter((e) => {
        if (lineFilter === 'debit' && !e.debit) return false
        if (lineFilter === 'credit' && !e.credit) return false
        if (referenceFilter !== 'all' && e.reference_type !== referenceFilter) return false
        if (accountFilter !== 'all' && e.account_code !== accountFilter) return false
        if (dateFrom && e.transaction_date < dateFrom) return false
        if (dateTo && e.transaction_date > dateTo) return false
        const q = search.toLowerCase()
        if (search && !e.description.toLowerCase().includes(q) && !accountName(e.account_code).toLowerCase().includes(q) && !e.account_code.includes(q)) {
          return false
        }
        return true
      })
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date) || a.journal_id - b.journal_id)
  }, [entries, search, referenceFilter, accountFilter, dateFrom, dateTo, lineFilter])

  const filteredTotals = useMemo(() => ({
    debit: filtered.reduce((sum, e) => sum + e.debit, 0),
    credit: filtered.reduce((sum, e) => sum + e.credit, 0),
  }), [filtered])

  // Trial balance: one row per account with summed debits/credits and a net balance
  const trialBalance = useMemo(() => {
    const byAccount = new Map()
    for (const e of filtered) {
      if (!byAccount.has(e.account_code)) byAccount.set(e.account_code, { account_code: e.account_code, debit: 0, credit: 0 })
      const row = byAccount.get(e.account_code)
      row.debit += e.debit
      row.credit += e.credit
    }
    return Array.from(byAccount.values())
      .map((row) => ({ ...row, net: row.debit - row.credit }))
      .sort((a, b) => a.account_code.localeCompare(b.account_code))
  }, [filtered])

  const resetFilters = () => {
    setSearch(EMPTY_FILTERS.search)
    setReferenceFilter(EMPTY_FILTERS.referenceFilter)
    setAccountFilter(EMPTY_FILTERS.accountFilter)
    setDateFrom(EMPTY_FILTERS.dateFrom)
    setDateTo(EMPTY_FILTERS.dateTo)
    setLineFilter(EMPTY_FILTERS.lineFilter)
  }

  // Each card is now a real quick-filter, mirroring the pattern used on Users/Roles:
  // clicking it narrows (or reveals) the relevant view, and highlights while active.
  const statCards = [
    {
      key: 'entries',
      label: 'Total Line Entries',
      value: entries.length,
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

  const openGroupDetail = (e) => {
    const group = entries.filter((x) => x.reference_type === e.reference_type && x.reference_id === e.reference_id)
    setDetailGroup(group)
  }
  const closeDetail = () => setDetailGroup(null)

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">
          Every posted Collection, Disbursement, Budget, Expense, and Tax Obligation lands here automatically as a balanced debit/credit pair. This ledger is system-generated and view-only.
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          Ledger is out of balance by {formatCurrency(Math.abs(grandTotals.difference))}. Check the source transaction that posted a one-sided entry.
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
            {ACCOUNTS.map((a) => <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</option>)}
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
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted whitespace-nowrap">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted whitespace-nowrap">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE} />
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

      {view === 'journal' ? (
        <div className={PANEL}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
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
                {filtered.map((e) => (
                  <tr
                    key={e.journal_id}
                    onClick={() => openGroupDetail(e)}
                    className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(e.transaction_date)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{accountLabel(e.account_code)}</td>
                    <td className="px-4 py-3.5 text-ink max-w-70 truncate">{e.description}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${REFERENCE_STYLES[e.reference_type]}`}>{e.reference_type}</span>
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
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No journal entries match your filters.</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td colSpan={4} className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Filtered Totals</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(filteredTotals.debit)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(filteredTotals.credit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div className={PANEL}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Account</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Total Debit</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Total Credit</th>
                  <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.map((row) => (
                  <tr
                    key={row.account_code}
                    onClick={() => { setAccountFilter(row.account_code); setView('journal') }}
                    className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
                  >
                    <td className="px-4 py-3.5 text-ink">{accountLabel(row.account_code)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{row.debit ? formatCurrency(row.debit) : '—'}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{row.credit ? formatCurrency(row.credit) : '—'}</td>
                    <td className={`px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-medium ${row.net > 0 ? 'text-blue-600 dark:text-blue-400' : row.net < 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted'}`}>
                      {row.net === 0 ? '—' : formatCurrency(Math.abs(row.net)) + (row.net > 0 ? ' Dr' : ' Cr')}
                    </td>
                  </tr>
                ))}
                {trialBalance.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">No entries match your filters.</td></tr>
                )}
              </tbody>
              {trialBalance.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Totals</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(filteredTotals.debit)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(filteredTotals.credit)}</td>
                    <td className={`px-4 py-3 whitespace-nowrap text-right tabular-nums ${Math.abs(filteredTotals.debit - filteredTotals.credit) < 0.005 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {Math.abs(filteredTotals.debit - filteredTotals.credit) < 0.005 ? 'Balanced' : formatCurrency(Math.abs(filteredTotals.debit - filteredTotals.credit)) + ' off'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <Modal open={!!detailGroup} onClose={closeDetail} title="Transaction Detail" footer={<Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>}>
        {detailGroup && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{detailGroup[0].description}</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${REFERENCE_STYLES[detailGroup[0].reference_type]}`}>{detailGroup[0].reference_type}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              {detailGroup.map((line) => (
                <div key={line.journal_id} className="px-3 py-2">
                  <DetailRow label="Account" value={accountLabel(line.account_code)} />
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