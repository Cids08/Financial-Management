import DetailRow from '../components/DetailRow'
import { Skeleton, TableSkeleton } from '../components/LoadingSkeleton'
import KpiValue from '../components/KpiValue'
import ResponsiveTable from '../components/ResponsiveTable'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, BookOpen, Scale, TrendingUp, TrendingDown, Info, ExternalLink, ListTree, Layers, Rows3, Loader2, AlertTriangle, ChevronDown, ChevronRight, X, RotateCcw, Filter, Printer, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDataUpdates } from '../hooks/useDataUpdates'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { usePrivacy } from '../context/PrivacyContext'
import { apiFetch } from '../utils/api'
import { DATE_PRESETS, resolveDatePreset } from '../utils/datePresets'
import { useCompany } from '../context/CompanyContext'
import { useProfileContext } from '../context/ProfileContext'
import { buildHeader, buildFooter, buildSignatureBlock, buildDocument, printDocument, downloadCsv, printTimestamp, escapeHtml } from '../utils/print'

const REFERENCE_TYPES = ['Collections', 'Disbursements', 'Accounts Receivable', 'Accounts Payable', 'Expenses', 'Tax Obligations']

// Maps the raw journal-line reference_type to the module page that owns the
// source record (mirrors JournalSourceResolver::groupKey on the backend).
// Journal entries can also reference Budgets and Fixed Asset depreciation.
const SOURCE_ROUTES = {
  accountsreceivable: '/transactions/receivable',
  receivable: '/transactions/receivable',
  ar: '/transactions/receivable',
  accountspayable: '/transactions/payable',
  payable: '/transactions/payable',
  ap: '/transactions/payable',
  disbursement: '/transactions/disbursements',
  dv: '/transactions/disbursements',
  expense: '/transactions/expenses',
  collection: '/transactions/collections',
  budget: '/transactions/budgets',
  taxobligation: '/transactions/tax-obligations',
  tax: '/transactions/tax-obligations',
  fixedasset: '/master-data/fixed-assets',
  depreciation: '/master-data/fixed-assets',
}

function sourceRoute(referenceType) {
  if (!referenceType) return null
  const clean = String(referenceType).toLowerCase().replace(/[^a-z]/g, '')
  return SOURCE_ROUTES[clean] || null
}

function formatSource(source) {
  if (!source) return '—'
  const text = String(source).replace(/_/g, ' ').trim()
  if (!text) return '—'
  // Sentence case: Capitalize first letter, keep rest lowercase
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

const REFERENCE_STYLES = {
  Collections: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Collection: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Disbursements: 'bg-primary/10 text-primary-dark dark:bg-primary/15 dark:text-primary',
  Disbursement: 'bg-primary/10 text-primary-dark dark:bg-primary/15 dark:text-primary',
  'Accounts receivable': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Accounts payable': 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  Expenses: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  Expense: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
  'Tax obligations': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

function getSourceStyle(source) {
  if (!source) return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  const formatted = formatSource(source)
  return REFERENCE_STYLES[formatted] || REFERENCE_STYLES[source] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
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



const EMPTY_FILTERS = { search: '', referenceFilter: 'all', accountFilter: 'all', dateFrom: '', dateTo: '', lineFilter: 'all' }

export default function GeneralLedger({ title = 'General Ledger', crumbs = ['Financial Transactions', 'General Ledger'] }) {
  const [view, setView] = useState('journal') // 'journal' | 'ledger' | 'trial-balance'
  const [search, setSearch] = useState(EMPTY_FILTERS.search)
  const [debouncedSearch, setDebouncedSearch] = useState(EMPTY_FILTERS.search)
  const [referenceFilter, setReferenceFilter] = useState(EMPTY_FILTERS.referenceFilter)
  const [accountFilter, setAccountFilter] = useState(EMPTY_FILTERS.accountFilter)
  const [dateFrom, setDateFrom] = useState(() => resolveDatePreset('today').from)
  const [dateTo, setDateTo] = useState(() => resolveDatePreset('today').to)
  const [datePreset, setDatePreset] = useState('today')
  const [lineFilter, setLineFilter] = useState(EMPTY_FILTERS.lineFilter) // 'all' | 'debit' | 'credit'
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [detailGroup, setDetailGroup] = useState(null) // lines for the journal entry shown in the detail modal
  const [detailLoading, setDetailLoading] = useState(false)

  const [accounts, setAccounts] = useState([])
  const [lines, setLines] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0, grand_totals: { debit: 0, credit: 0, balanced: true, difference: 0 } })
  const [trialBalance, setTrialBalance] = useState([])
  const [ledgerData, setLedgerData] = useState({ accounts: [], totals: { debit: 0, credit: 0, balance: 0 } })
  const [collapsedAccounts, setCollapsedAccounts] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [exporting, setExporting] = useState(false)

  usePrivacy()
  const company = useCompany()
  const { profile } = useProfileContext()

  const navigate = useNavigate()

  // Live updates: the ledger is derived from postings across every module,
  // so any of these changing re-fetches the active view  -  no reload needed.
  useDataUpdates([
    'accounts-receivable', 'accounts-payable', 'collections', 'expenses',
    'disbursements', 'tax-obligations', 'budgets',
  ], () => setRefreshKey((k) => k + 1))

  // Jump to the original record behind a ledger line, in its own module,
  // reusing the same router-state highlight mechanism as SearchBar so the
  // destination page scrolls to + flashes the exact row.
  const goToSource = (referenceType, referenceId, hint) => {
    const route = sourceRoute(referenceType)
    if (!route || referenceId == null) return
    navigate(route, { state: { highlightId: Number(referenceId), highlightSearch: hint || null } })
  }

  // Debounce free-text search so it doesn't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  // Chart of accounts for the filter dropdown  -  fetched once.
  // FIX: was hitting /api/chart-of-accounts, which doesn't exist  -  the
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

  // Stale-response guard (same pattern as useDisbursements.js): filters +
  // page captured at request time are compared to the latest snapshot when
  // the response lands. A request fired for the old page (just before the
  // filter reset above kicks in) therefore can't overwrite the newer
  // page-1 payload with out-of-order data.
  const glFiltersRef = useRef({})
  useEffect(() => {
    glFiltersRef.current = { filterParams, page }
  })

  // Journal lines  -  depends on filters + page.
  useEffect(() => {
    if (view !== 'journal') return
    const started = { filterParams, page }
    setLoading(true)
    setError(null)
    const params = new URLSearchParams(filterParams)
    params.set('page', String(page))

    apiFetch(`/api/general-ledger/lines?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        const current = glFiltersRef.current
        if (current.page !== started.page || current.filterParams !== started.filterParams) return
        setLines(json.data || [])
        setMeta(json.meta || meta)
      })
      .catch(() => setError('Could not load journal entries. Please try again.'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filterParams, page, refreshKey])

  // Trial balance  -  depends on filters only (no pagination).
  useEffect(() => {
    if (view !== 'trial-balance') return
    setLoading(true)
    setError(null)
    apiFetch(`/api/general-ledger/trial-balance?${filterParams.toString()}`)
      .then((res) => res.json())
      .then((json) => setTrialBalance(json.data || []))
      .catch(() => setError('Could not load the trial balance. Please try again.'))
      .finally(() => setLoading(false))
  }, [view, filterParams, refreshKey])

  // Account ledger (SAP B1 style)  -  depends on filters only (no pagination).
  useEffect(() => {
    if (view !== 'ledger') return
    setLoading(true)
    setError(null)
    apiFetch(`/api/general-ledger/ledger?${filterParams.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        const data = json.data || { accounts: [], totals: { debit: 0, credit: 0, balance: 0 } }
        setLedgerData(data)
        const collapsed = new Set()
        data.accounts.forEach((acc) => {
          if (acc.lines && acc.lines.length > 4) collapsed.add(acc.account_id)
        })
        setCollapsedAccounts(collapsed)
      })
      .catch(() => setError('Could not load the account ledger. Please try again.'))
      .finally(() => setLoading(false))
  }, [view, filterParams, refreshKey])

  const trialTotals = useMemo(() => ({
    debit: trialBalance.reduce((sum, r) => sum + Number(r.total_debit || 0), 0),
    credit: trialBalance.reduce((sum, r) => sum + Number(r.total_credit || 0), 0),
  }), [trialBalance])

  const grandTotals = meta.grand_totals || { debit: 0, credit: 0, balanced: true, difference: 0 }

  // Filters deliberately changed by the user, for the "N active" badge + Reset.
  // Quick date presets (Today/Week/...) don't count — only a manual Custom
  // range does, so the badge appears exactly when the user has fiddled.
  const activeFilterCount =
    (search.trim() !== '' ? 1 : 0) +
    (referenceFilter !== 'all' ? 1 : 0) +
    (accountFilter !== 'all' ? 1 : 0) +
    (lineFilter !== 'all' ? 1 : 0) +
    (datePreset === 'custom' ? 1 : 0)

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

  const toggleAccount = (accountId) => {
    setCollapsedAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) next.delete(accountId)
      else next.add(accountId)
      return next
    })
  }

  const setAllAccounts = (collapsed) => {
    setCollapsedAccounts(new Set(collapsed ? ledgerData.accounts.map((acc) => acc.account_id) : []))
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
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary-dark',
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

  // Jump from the detail modal to the original record — the entry's lines
  // all share the same source document.
  const openDetailSource = () => {
    const line = detailGroup?.lines?.find((l) => l.source && l.source.reference_id != null)
    if (!line) return
    goToSource(line.source.reference_type, line.source.reference_id, line.source.reference || line.source.name)
  }

  const handlePrint = async () => {
    setPrinting(true)
    try {
      const periodLabel = dateFrom && dateTo
        ? `${formatDate(dateFrom)} to ${formatDate(dateTo)}`
        : dateFrom
          ? `From ${formatDate(dateFrom)}`
          : dateTo
            ? `Up to ${formatDate(dateTo)}`
            : 'All Recorded Periods to Date'

    const activePresetObj = DATE_PRESETS.find((p) => p.key === datePreset)
    const presetName = datePreset === 'custom' ? 'Custom Date Range' : (activePresetObj?.label || 'All Periods')
    const selectedAccountObj = accountFilter !== 'all' ? accounts.find((a) => String(a.id) === String(accountFilter)) : null
    const selectedAccountLabel = selectedAccountObj ? selectedAccountObj.label : null

    if (view === 'journal') {
      let printLines = lines
      if (meta.total > lines.length) {
        try {
          const params = new URLSearchParams(filterParams)
          params.set('per_page', '200')
          const res = await apiFetch(`/api/general-ledger/lines?${params.toString()}`)
          const json = await res.json()
          if (json.data && json.data.length > 0) printLines = json.data
        } catch (err) {
          console.warn('[print] could not fetch unpaginated lines:', err)
        }
      }

      const rowsHtml = printLines.map((line) => `
        <tr>
          <td style="white-space:nowrap">${formatDate(line.transaction_date)}</td>
          <td style="font-family:monospace;font-weight:600">${escapeHtml(line.account_code || '')}</td>
          <td>${escapeHtml(line.account_name || '')}</td>
          <td>${escapeHtml(line.description || '—')}</td>
          <td>${escapeHtml(line.source?.label || line.reference_type || '—')}${line.source?.reference ? ` <span style="color:#64748b;font-size:8pt">(${escapeHtml(line.source.reference)})</span>` : ''}</td>
          <td class="pf-num">${line.debit ? formatCurrency(line.debit) : '—'}</td>
          <td class="pf-num">${line.credit ? formatCurrency(line.credit) : '—'}</td>
        </tr>
      `).join('')

      const headerHtml = buildHeader({
        company,
        title: selectedAccountLabel ? `GENERAL JOURNAL — ${selectedAccountLabel.toUpperCase()}` : 'GENERAL JOURNAL',
        subtitle: selectedAccountLabel
          ? `Official Chronological Register for Account: ${selectedAccountLabel}`
          : 'Official Chronological Register of Transactions (Book of Accounts)',
        preparedBy: profile?.name,
        preparedRole: profile?.role?.name || 'Finance Officer',
        meta: [
          ['Period', periodLabel],
          ['Date Filter', presetName],
          ...(selectedAccountLabel ? [['Account', selectedAccountLabel]] : []),
          ...(referenceFilter !== 'all' ? [['Source', formatSource(referenceFilter)]] : []),
          ['Total Lines', String(printLines.length)],
          ['Journal Status', grandTotals.balanced ? 'BALANCED' : 'OUT OF BALANCE'],
        ],
      })

      const footerHtml = buildFooter({
        company,
        note: 'Official Book of Accounts  ·  Strictly Confidential',
        detail: `General Journal  ·  Period: ${periodLabel}`,
      })

      const sigBlock = buildSignatureBlock({
        preset: 'report',
        title: 'Official Journal Approvals & Audit Certification',
        preparedName: profile?.name || 'Accounting Staff',
        preparedRole: profile?.role?.name || 'Finance Officer',
        approvedName: 'Finance Manager / CFO',
      })

      const bodyHtml = `
        ${headerHtml}
        <table class="pf-grid">
          <thead>
            <tr>
              <th style="width:13%">Date</th>
              <th style="width:12%">Account Code</th>
              <th style="width:20%">Account Title</th>
              <th>Description / Remarks</th>
              <th style="width:16%">Source / Ref</th>
              <th style="width:12%;text-align:right">Debit</th>
              <th style="width:12%;text-align:right">Credit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7" class="pf-empty">No journal transactions match the selected period.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5" style="text-align:right;font-weight:700">GRAND TOTALS:</td>
              <td class="pf-num">${formatCurrency(grandTotals.debit)}</td>
              <td class="pf-num">${formatCurrency(grandTotals.credit)}</td>
            </tr>
          </tfoot>
        </table>
        ${sigBlock}
        ${footerHtml}
      `

      const doc = buildDocument({
        title: 'General Journal',
        body: bodyHtml,
        company,
        orientation: 'landscape',
        density: 'compact',
        margin: 12,
      })

      printDocument({ html: doc, logoUrl: company?.logoUrl })
      return
    }

    if (view === 'ledger') {
      const accountsHtml = ledgerData.accounts.map((acc) => {
        const linesHtml = acc.lines?.map((l) => `
          <tr>
            <td style="white-space:nowrap">${formatDate(l.transaction_date)}</td>
            <td style="font-family:monospace">${escapeHtml(l.transaction_no || '—')}</td>
            <td>${escapeHtml(l.description || '—')}</td>
            <td>${escapeHtml(l.source?.label || '—')}${l.source?.reference ? ` (${escapeHtml(l.source.reference)})` : ''}</td>
            <td class="pf-num">${l.debit ? formatCurrency(l.debit) : '—'}</td>
            <td class="pf-num">${l.credit ? formatCurrency(l.credit) : '—'}</td>
            <td class="pf-num" style="font-weight:600">${formatCurrency(Math.abs(l.running_balance))} ${l.running_balance > 0 ? 'Dr' : l.running_balance < 0 ? 'Cr' : ''}</td>
          </tr>
        `).join('') || '<tr><td colspan="7" class="pf-empty">No postings in this period.</td></tr>'

        return `
          <div style="margin-top:6mm;break-inside:avoid;page-break-inside:avoid;">
            <div style="background:#f1f5f9;border:1px solid #cbd5e1;padding:2mm 3mm;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong style="color:#0f2744;font-size:9.5pt">${escapeHtml(acc.account_code)} — ${escapeHtml(acc.account_name)}</strong>
                <span style="color:#64748b;font-size:8pt;margin-left:3mm">(${escapeHtml(acc.account_type || 'General Ledger Account')})</span>
              </div>
              <div style="font-size:8.5pt">
                <span style="color:#64748b">Opening:</span> <strong>${formatCurrency(Math.abs(acc.opening_balance))} ${acc.opening_balance > 0 ? 'Dr' : acc.opening_balance < 0 ? 'Cr' : ''}</strong>
                <span style="color:#cbd5e1;margin:0 2mm">|</span>
                <span style="color:#64748b">Closing:</span> <strong style="color:#0f2744">${formatCurrency(Math.abs(acc.balance))} ${acc.balance > 0 ? 'Dr' : acc.balance < 0 ? 'Cr' : ''}</strong>
              </div>
            </div>
            <table class="pf-grid" style="margin-top:0">
              <thead>
                <tr>
                  <th style="width:12%">Date</th>
                  <th style="width:14%">Trans No.</th>
                  <th>Description</th>
                  <th style="width:18%">Source / Ref</th>
                  <th style="width:12%;text-align:right">Debit</th>
                  <th style="width:12%;text-align:right">Credit</th>
                  <th style="width:14%;text-align:right">Balance</th>
                </tr>
              </thead>
              <tbody>
                ${linesHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4" style="text-align:right;font-weight:700">Account Postings Total:</td>
                  <td class="pf-num">${formatCurrency(acc.total_debit)}</td>
                  <td class="pf-num">${formatCurrency(acc.total_credit)}</td>
                  <td class="pf-num">${formatCurrency(Math.abs(acc.balance))} ${acc.balance > 0 ? 'Dr' : acc.balance < 0 ? 'Cr' : ''}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        `
      }).join('')

      const headerHtml = buildHeader({
        company,
        title: selectedAccountLabel ? `GENERAL LEDGER — ${selectedAccountLabel.toUpperCase()}` : 'GENERAL LEDGER',
        subtitle: selectedAccountLabel
          ? `Official Account Ledger & Postings for Account: ${selectedAccountLabel}`
          : 'Official Book of Accounts — Individual Account Ledgers & Running Balances',
        preparedBy: profile?.name,
        preparedRole: profile?.role?.name || 'Finance Officer',
        meta: [
          ['Period', periodLabel],
          ['Date Filter', presetName],
          ...(selectedAccountLabel ? [['Account', selectedAccountLabel]] : []),
          ['Active Accounts', String(ledgerData.accounts.length)],
          ['Ledger Status', Math.abs(ledgerData.totals.balance) < 0.005 ? 'BALANCED' : 'OUT OF BALANCE'],
        ],
      })

      const footerHtml = buildFooter({
        company,
        note: 'Official Book of Accounts  ·  Strictly Confidential',
        detail: selectedAccountLabel
          ? `General Ledger  ·  Account: ${selectedAccountLabel}  ·  Period: ${periodLabel}`
          : `General Ledger  ·  Period: ${periodLabel}`,
      })

      const sigBlock = buildSignatureBlock({
        preset: 'report',
        title: 'General Ledger Audit Certification & Management Signatures',
        preparedName: profile?.name || 'Accounting Staff',
        preparedRole: profile?.role?.name || 'Finance Officer',
        approvedName: 'Finance Manager / CFO',
      })

      const bodyHtml = `
        ${headerHtml}
        ${accountsHtml || '<div class="pf-empty">No ledger accounts match the selected period.</div>'}
        <div style="margin-top:6mm;background:#f8fafc;border:1.5px solid #0f2744;padding:3mm 4mm;display:flex;justify-content:space-between;align-items:center;break-inside:avoid;">
          <strong style="color:#0f2744;font-size:10pt">LEDGER GRAND TOTALS:</strong>
          <div style="font-size:9pt;font-variant-numeric:tabular-nums">
            <span style="margin-right:4mm"><strong>Total Dr:</strong> ${formatCurrency(ledgerData.totals.debit)}</span>
            <span style="margin-right:4mm"><strong>Total Cr:</strong> ${formatCurrency(ledgerData.totals.credit)}</span>
            <span style="color:${Math.abs(ledgerData.totals.balance) < 0.005 ? '#166534' : '#991b1b'};font-weight:700">
              ${Math.abs(ledgerData.totals.balance) < 0.005 ? 'PERFECTLY BALANCED' : formatCurrency(Math.abs(ledgerData.totals.balance)) + ' OFF'}
            </span>
          </div>
        </div>
        ${sigBlock}
        ${footerHtml}
      `

      const doc = buildDocument({
        title: 'General Ledger',
        body: bodyHtml,
        company,
        orientation: 'landscape',
        density: 'compact',
        margin: 12,
      })

      printDocument({ html: doc, logoUrl: company?.logoUrl })
      return
    }

    if (view === 'trial-balance') {
      const rowsHtml = trialBalance.map((row) => {
        const net = Number(row.net_balance || 0)
        return `
          <tr>
            <td style="font-family:monospace;font-weight:600">${escapeHtml(row.account_code)}</td>
            <td>${escapeHtml(row.account_name)}</td>
            <td class="pf-num">${row.total_debit ? formatCurrency(row.total_debit) : '—'}</td>
            <td class="pf-num">${row.total_credit ? formatCurrency(row.total_credit) : '—'}</td>
            <td class="pf-num" style="font-weight:600;color:${net > 0 ? '#166534' : net < 0 ? '#6b21a8' : '#334155'}">
              ${net === 0 ? '—' : formatCurrency(Math.abs(net)) + (net > 0 ? ' Dr' : ' Cr')}
            </td>
          </tr>
        `
      }).join('')

      const isBalanced = Math.abs(trialTotals.debit - trialTotals.credit) < 0.005

      const headerHtml = buildHeader({
        company,
        title: 'TRIAL BALANCE SHEET',
        subtitle: 'Verification of Double-Entry General Ledger Accounts',
        preparedBy: profile?.name,
        preparedRole: profile?.role?.name || 'Finance Officer',
        meta: [
          ['Period / As Of', periodLabel],
          ['Date Filter', presetName],
          ['Total Accounts', String(trialBalance.length)],
          ['Trial Balance Status', isBalanced ? 'BALANCED' : 'OUT OF BALANCE'],
        ],
      })

      const footerHtml = buildFooter({
        company,
        note: 'Statutory Financial Verification  ·  Strictly Confidential',
        detail: `Trial Balance  ·  Period: ${periodLabel}`,
      })

      const sigBlock = buildSignatureBlock({
        preset: 'report',
        title: 'Official Trial Balance Certifications & Approvals',
        preparedName: profile?.name || 'Accounting Staff',
        preparedRole: profile?.role?.name || 'Finance Officer',
        approvedName: 'Finance Manager / CFO',
      })

      const bodyHtml = `
        ${headerHtml}
        <table class="pf-grid">
          <thead>
            <tr>
              <th style="width:18%">Account Code</th>
              <th>Account Title</th>
              <th style="width:20%;text-align:right">Total Debit</th>
              <th style="width:20%;text-align:right">Total Credit</th>
              <th style="width:20%;text-align:right">Net Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="5" class="pf-empty">No accounts with activity found for this period.</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="text-align:right;font-weight:700">TRIAL BALANCE TOTALS:</td>
              <td class="pf-num">${formatCurrency(trialTotals.debit)}</td>
              <td class="pf-num">${formatCurrency(trialTotals.credit)}</td>
              <td class="pf-num" style="font-weight:700;color:${isBalanced ? '#166534' : '#991b1b'}">
                ${isBalanced ? 'BALANCED (₱0.00)' : formatCurrency(Math.abs(trialTotals.debit - trialTotals.credit)) + ' DIFFERENCE'}
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="pf-certification">
          <div class="pf-certification-title">Official Certification</div>
          I hereby certify that this Trial Balance reflects a true and complete summary of all General Ledger account debit and credit balances for the specified period (<strong>${escapeHtml(periodLabel)}</strong>), and that the books of accounts are in balance in accordance with Philippine Financial Reporting Standards (PFRS).
        </div>

        ${sigBlock}
        ${footerHtml}
      `

      const doc = buildDocument({
        title: 'Trial Balance',
        body: bodyHtml,
        company,
        orientation: 'portrait',
        density: 'normal',
        margin: 14,
      })

      printDocument({ html: doc, logoUrl: company?.logoUrl })
    }
    } catch (err) {
      console.error('[print] error generating print document:', err)
    } finally {
      setTimeout(() => setPrinting(false), 500)
    }
  }

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const rangeSuffix = dateFrom || dateTo ? `_${dateFrom || 'start'}_to_${dateTo || 'now'}` : `_${today}`
      const selectedAccountObj = accountFilter !== 'all' ? accounts.find((a) => String(a.id) === String(accountFilter)) : null
      const selectedAccountLabel = selectedAccountObj ? selectedAccountObj.label : null
      const accountSuffix = selectedAccountObj ? `_${selectedAccountObj.label.replace(/[^a-zA-Z0-9]/g, '_')}` : ''
      const periodLabel = dateFrom && dateTo
        ? `${formatDate(dateFrom)} to ${formatDate(dateTo)}`
        : dateFrom
          ? `From ${formatDate(dateFrom)}`
          : dateTo
            ? `Up to ${formatDate(dateTo)}`
            : 'All Recorded Periods to Date'

    if (view === 'journal') {
      let exportLines = lines
      if (meta.total > lines.length) {
        try {
          const params = new URLSearchParams(filterParams)
          params.set('per_page', '200')
          const res = await apiFetch(`/api/general-ledger/lines?${params.toString()}`)
          const json = await res.json()
          if (json.data && json.data.length > 0) exportLines = json.data
        } catch {
          // fall back to lines
        }
      }

      const rows = [
        ['Date', 'Account Code', 'Account Name', 'Description', 'Source Module', 'Source Name', 'Reference No', 'Debit (PHP)', 'Credit (PHP)'],
        ...exportLines.map((l) => [
          l.transaction_date || '',
          l.account_code || '',
          l.account_name || '',
          l.description || '',
          l.source?.label || l.reference_type || '',
          l.source?.name || '',
          l.source?.reference || '',
          l.debit || 0,
          l.credit || 0,
        ]),
        ['GRAND TOTALS', '', '', '', '', '', '', grandTotals.debit, grandTotals.credit],
      ]

      downloadCsv({
        filename: `general-journal${rangeSuffix}${accountSuffix}.csv`,
        provenance: [
          ['Report', selectedAccountLabel ? `General Journal — ${selectedAccountLabel}` : 'General Journal (Official Register)'],
          ['Company', company?.name || 'Financial Management System'],
          ['Period', periodLabel],
          ...(selectedAccountLabel ? [['Account', selectedAccountLabel]] : []),
          ...(referenceFilter !== 'all' ? [['Source', formatSource(referenceFilter)]] : []),
          ['Generated By', profile?.name || 'Accounting Staff'],
          ['Generated At', printTimestamp()],
          ['Status', grandTotals.balanced ? 'BALANCED' : 'OUT OF BALANCE'],
          ['Total Rows', String(exportLines.length)],
        ],
        rows,
      })
      return
    }

    if (view === 'ledger') {
      const rows = [
        ['Account Code', 'Account Name', 'Account Type', 'Date', 'Transaction No', 'Description', 'Source', 'Reference', 'Debit (PHP)', 'Credit (PHP)', 'Running Balance (PHP)'],
      ]

      ledgerData.accounts.forEach((acc) => {
        rows.push([
          acc.account_code,
          acc.account_name,
          acc.account_type || '',
          'OPENING BALANCE',
          '',
          'Balance brought forward',
          '',
          '',
          '',
          '',
          acc.opening_balance || 0,
        ])
        acc.lines?.forEach((l) => {
          rows.push([
            acc.account_code,
            acc.account_name,
            acc.account_type || '',
            l.transaction_date || '',
            l.transaction_no || '',
            l.description || '',
            l.source?.label || '',
            l.source?.reference || '',
            l.debit || 0,
            l.credit || 0,
            l.running_balance || 0,
          ])
        })
        rows.push([
          acc.account_code,
          acc.account_name,
          acc.account_type || '',
          'CLOSING BALANCE',
          '',
          'Ending Balance',
          '',
          '',
          acc.total_debit || 0,
          acc.total_credit || 0,
          acc.balance || 0,
        ])
        rows.push([])
      })

      downloadCsv({
        filename: `general-ledger${rangeSuffix}.csv`,
        provenance: [
          ['Report', 'General Ledger (Book of Accounts)'],
          ['Company', company?.name || 'Financial Management System'],
          ['Period', periodLabel],
          ['Generated By', profile?.name || 'Accounting Staff'],
          ['Generated At', printTimestamp()],
          ['Total Accounts', String(ledgerData.accounts.length)],
        ],
        rows,
      })
      return
    }

    if (view === 'trial-balance') {
      const isBalanced = Math.abs(trialTotals.debit - trialTotals.credit) < 0.005
      const rows = [
        ['Account Code', 'Account Title', 'Total Debit (PHP)', 'Total Credit (PHP)', 'Net Balance (PHP)', 'Balance Type'],
        ...trialBalance.map((row) => {
          const net = Number(row.net_balance || 0)
          return [
            row.account_code || '',
            row.account_name || '',
            row.total_debit || 0,
            row.total_credit || 0,
            Math.abs(net),
            net > 0 ? 'Debit' : net < 0 ? 'Credit' : 'Zero',
          ]
        }),
        ['TRIAL BALANCE TOTALS', '', trialTotals.debit, trialTotals.credit, isBalanced ? 0 : Math.abs(trialTotals.debit - trialTotals.credit), isBalanced ? 'BALANCED' : 'OUT OF BALANCE'],
      ]

      downloadCsv({
        filename: `trial-balance${rangeSuffix}.csv`,
        provenance: [
          ['Report', 'Trial Balance Sheet'],
          ['Company', company?.name || 'Financial Management System'],
          ['Period / As Of', periodLabel],
          ['Generated By', profile?.name || 'Accounting Staff'],
          ['Generated At', printTimestamp()],
          ['Status', isBalanced ? 'BALANCED' : 'OUT OF BALANCE'],
          ['Total Accounts', String(trialBalance.length)],
        ],
        rows,
      })
    }
    } catch (err) {
      console.error('[export] error generating CSV:', err)
    } finally {
      setTimeout(() => setExporting(false), 400)
    }
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">
          Every posted Collection, Disbursement, Expense, and Tax Obligation lands here automatically as a balanced debit/credit pair. This ledger is system-generated and view-only.
        </p>
      </div>

      {/* Stat cards  -  clickable quick filters */}
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
                <p className="text-lg font-bold text-ink truncate" title={loading ? undefined : String(card.value)}><KpiValue loading={loading}>{card.value}</KpiValue></p>
              </div>
            </button>
          )
        })}
      </div>

      {!grandTotals.balanced && (
        <div className="flex items-center gap-2 rounded-lg border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
          <AlertTriangle size={15} className="shrink-0" />
          Ledger is out of balance by {formatCurrency(Math.abs(grandTotals.difference))}. Check the source transaction that posted a one-sided entry.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
          <AlertTriangle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      <div className={`${PANEL} ${PANEL_PAD} space-y-3`}>
        {/* View tabs (prominent) + active-filter summary */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full md:w-auto items-center gap-1 rounded-xl border border-border bg-bg p-1">
            <button
              type="button"
              onClick={() => setView('journal')}
              className={`flex flex-1 md:flex-none items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors duration-150 ${view === 'journal' ? 'bg-primary text-black shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              <Rows3 size={14} /> Journal
            </button>
            <button
              type="button"
              onClick={() => setView('ledger')}
              className={`flex flex-1 md:flex-none items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors duration-150 ${view === 'ledger' ? 'bg-primary text-black shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              <Layers size={14} /> Ledger
            </button>
            <button
              type="button"
              onClick={() => setView('trial-balance')}
              className={`flex flex-1 md:flex-none items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors duration-150 ${view === 'trial-balance' ? 'bg-primary text-black shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              <ListTree size={14} /> Trial Balance
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
            {activeFilterCount > 0 && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary-dark whitespace-nowrap">
                  <Filter size={12} /> {activeFilterCount} active filter{activeFilterCount === 1 ? '' : 's'}
                </span>
                <Button variant="secondary" size="sm" icon={RotateCcw} iconPosition="left" onClick={resetFilters}>
                  Reset
                </Button>
              </>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                iconPosition="left"
                onClick={handleExportCsv}
                loading={exporting}
                disabled={loading || exporting || printing}
                title="Export active view to CSV (Excel compatible)"
              >
                {exporting ? 'Exporting…' : 'Export CSV'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Printer}
                iconPosition="left"
                onClick={handlePrint}
                loading={printing}
                disabled={loading || printing || exporting}
                title="Print official document for current view and period"
              >
                {printing ? 'Preparing…' : `Print ${view === 'journal' ? 'Journal' : view === 'ledger' ? 'Ledger' : 'Trial Balance'}`}
              </Button>
            </div>
          </div>
        </div>

        {/* Filter row 1: search, source, account, side */}
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end">
          <div className="relative flex-1 min-w-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Search</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Description or account..."
                className={`${SEARCH_INPUT} pr-9`}
                style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0 }}
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-border hover:text-ink transition-colors duration-150"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="w-full lg:w-56">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Source</label>
            <select
              value={referenceFilter}
              onChange={(e) => setReferenceFilter(e.target.value)}
              className={`${INPUT} ${referenceFilter !== 'all' ? 'border-primary/60 bg-primary/5 text-primary-dark font-medium' : ''}`}
              style={INPUT_TEXT_STYLE}
            >
              <option value="all">All Sources</option>
              {REFERENCE_TYPES.map((r) => <option key={r} value={r}>{formatSource(r)}</option>)}
            </select>
          </div>

          <div className="w-full lg:w-64">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Account</label>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className={`${INPUT} ${accountFilter !== 'all' ? 'border-primary/60 bg-primary/5 text-primary-dark font-medium' : ''}`}
              style={INPUT_TEXT_STYLE}
            >
              <option value="all">All Accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>

          <div className="w-full lg:w-auto">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Side</label>
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-bg p-0.5 h-9">
              <button
                type="button"
                onClick={() => setLineFilter('all')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${lineFilter === 'all' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setLineFilter('debit')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${lineFilter === 'debit' ? 'bg-primary text-black shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                <TrendingUp size={13} /> Debit
              </button>
              <button
                type="button"
                onClick={() => setLineFilter('credit')}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 ${lineFilter === 'credit' ? 'bg-purple-600 text-white shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                <TrendingDown size={13} /> Credit
              </button>
            </div>
          </div>
        </div>

        {/* Filter row 2: date period */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="w-full sm:w-44">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Period</label>
            <select
              value={datePreset}
              onChange={(e) => applyDatePreset(e.target.value)}
              className={`${INPUT} ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5 text-primary-dark font-medium' : ''}`}
              style={INPUT_TEXT_STYLE}
            >
              {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value) }}
                className={`${INPUT} scheme-light dark:scheme-dark ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5 text-primary-dark font-medium' : ''}`}
                style={INPUT_TEXT_STYLE}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value) }}
                className={`${INPUT} scheme-light dark:scheme-dark ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5 text-primary-dark font-medium' : ''}`}
                style={INPUT_TEXT_STYLE}
              />
            </div>
            {datePreset === 'custom' && (
              <button
                type="button"
                onClick={() => { setDatePreset('all'); setDateFrom(''); setDateTo('') }}
                title="Clear date range"
                className="mb-0.5 flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
              >
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div role="status" aria-label="Loading general ledger" aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading general ledger</span>
          {(view === 'ledger' ? [0, 1] : [0]).map(section => {
            const columns = view === 'trial-balance'
              ? ['Account Code', 'Account Title', 'Total Debit', 'Total Credit', 'Net Balance']
              : view === 'ledger'
                ? ['Date', 'Trans No.', 'Description', 'Source', 'Debit', 'Credit', 'Balance']
                : ['Date', 'Account', 'Description', 'Source', 'Debit', 'Credit', 'Actions']
            return <div key={section} className={PANEL}>
              {view === 'ledger' && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-3 w-24" /></div>}
              <ResponsiveTable minTableWidth={640} className="w-full table-fixed text-sm">
                <thead><tr className="border-b border-border">{columns.map(label => <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted">{label}</th>)}</tr></thead>
                <tbody><TableSkeleton columns={columns.length} rows={view === 'ledger' ? 3 : 5} /></tbody>
              </ResponsiveTable>
              <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4"><Skeleton className="h-3 w-32" /><Skeleton className="h-7 w-36" /></div>
            </div>
          })}
        </div>
      )}

      {!loading && view === 'journal' && (
        <div className={PANEL}>
        <div className="overflow-hidden rounded-t-xl">
          <ResponsiveTable className="w-full text-sm table-fixed">
            <thead className="bg-surface">
                <tr className="border-b border-border">
                  <th className="w-28 text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="w-44 text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Account</th>
                  <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Description</th>
                  <th className="w-56 text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Source</th>
                  <th className="w-28 text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Debit</th>
                  <th className="w-28 text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Credit</th>
                  <th className="w-12 text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((e) => (
                  <tr
                    key={e.journal_id}
                    onClick={() => openGroupDetail(e)}
                    className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink text-xs">{formatDate(e.transaction_date)}</td>
                    <td className="px-4 py-3.5 text-ink text-xs">
                      <span className="block truncate" title={`${e.account_code}  -  ${e.account_name}`}>{e.account_code}  -  {e.account_name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-ink text-xs">
                      <span className="block truncate" title={e.description}>{e.description}</span>
                    </td>
                    <td className="px-4 py-3.5 min-w-0">
                      {e.source?.label && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium break-words max-w-full ${getSourceStyle(e.source.label)}`}>
                          {e.source.label}
                        </span>
                      )}
                      {e.source?.name && (
                        <div className="mt-1 text-xs font-medium text-ink leading-snug truncate" title={e.source.name}>
                          {e.source.name}
                        </div>
                      )}
                      {e.source?.reference && (
                        <div className="text-[10.5px] text-muted leading-snug truncate" title={e.source.reference}>
                          Ref: {e.source.reference}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink text-xs">{e.debit ? formatCurrency(e.debit) : '—'}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink text-xs">{e.credit ? formatCurrency(e.credit) : '—'}</td>
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
                      {sourceRoute(e.reference_type) && e.reference_id != null && (
                        <Tooltip label="Open original record" position="left">
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); goToSource(e.reference_type, e.reference_id, e.source?.reference || e.source?.name) }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-primary/10 hover:text-primary-dark transition-colors duration-150 ml-1"
                          >
                            <ExternalLink size={15} />
                          </button>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No journal entries match your filters.</td></tr>
                )}
              </tbody>
            </ResponsiveTable>
          </div>

          <Pagination
            page={meta.current_page}
            totalPages={meta.last_page}
            onPageChange={setPage}
            total={meta.total}
            label="lines"
            bordered
          />
        </div>
      )}

      {!loading && view === 'ledger' && (
        <div className={PANEL}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Accounts ({ledgerData.accounts.length})  ·  Opening → running balance per account
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setAllAccounts(true)} className="text-xs font-medium text-primary-dark hover:underline">Collapse all</button>
              <button type="button" onClick={() => setAllAccounts(false)} className="text-xs font-medium text-primary-dark hover:underline">Expand all</button>
            </div>
          </div>

          <div className="divide-y divide-border">
            {ledgerData.accounts.map((acc) => {
              const isCollapsed = collapsedAccounts.has(acc.account_id)
              const balance = Number(acc.balance || 0)
              return (
                <div key={acc.account_id} className="px-4 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleAccount(acc.account_id)}
                    className="flex w-full items-center gap-2 py-2 text-left"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-muted" aria-hidden="true">
                      {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink" title={`${acc.account_code}  -  ${acc.account_name}`}>
                      {acc.account_code}  -  {acc.account_name}
                    </span>
                    {acc.lines.length > 0 && (
                      <span className="text-[10.5px] text-muted whitespace-nowrap">{acc.lines.length} post{acc.lines.length === 1 ? '' : 'ings'}</span>
                    )}
                    {acc.sub_accounts?.length > 0 && (
                      <span className="whitespace-nowrap rounded-full bg-bg border border-border px-2 py-0.5 text-[10px] font-medium text-muted" title={acc.sub_accounts.map((s) => `${s.code} — ${s.name}`).join('\n')}>
                        {acc.sub_accounts.length} sub-account{acc.sub_accounts.length === 1 ? '' : 's'}
                      </span>
                    )}
                    <span className="w-28 whitespace-nowrap text-right text-[10.5px] text-muted tabular-nums">
                      Open {formatCurrency(Math.abs(acc.opening_balance))}{acc.opening_balance > 0 ? ' Dr' : acc.opening_balance < 0 ? ' Cr' : ''}
                    </span>
                    <span className="w-28 whitespace-nowrap text-right text-[10.5px] text-muted tabular-nums">Dr {formatCurrency(acc.total_debit)}</span>
                    <span className="w-28 whitespace-nowrap text-right text-[10.5px] text-muted tabular-nums">Cr {formatCurrency(acc.total_credit)}</span>
                    <span className={`w-32 whitespace-nowrap text-right text-xs font-semibold tabular-nums ${balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : balance < 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted'}`}>
                      {balance === 0 ? '—' : formatCurrency(Math.abs(balance)) + (balance > 0 ? ' Dr' : ' Cr')}
                    </span>
                  </button>

                  {!isCollapsed && acc.lines.length > 0 && (
                    <div className="mt-1.5 overflow-hidden rounded-lg border border-border">
                      <ResponsiveTable className="w-full text-sm table-fixed">
                        <thead className="bg-bg">
                          <tr className="border-b border-border">
                            <th className="w-24 text-left font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2 whitespace-nowrap">Date</th>
                            <th className="w-36 text-left font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2 whitespace-nowrap">Trans No.</th>
                            {acc.sub_accounts?.length > 0 && (
                              <th className="w-36 text-left font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2 whitespace-nowrap">Account</th>
                            )}
                            <th className="text-left font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2">Description</th>
                            <th className="w-52 text-left font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2 whitespace-nowrap">Source</th>
                            <th className="w-28 text-right font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2 whitespace-nowrap">Debit</th>
                            <th className="w-28 text-right font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2 whitespace-nowrap">Credit</th>
                            <th className="w-32 text-right font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2 whitespace-nowrap">Balance</th>
                            <th className="w-10 text-right font-semibold text-muted text-[10.5px] uppercase tracking-wide px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {acc.lines.map((line) => (
                            <tr
                              key={line.id}
                              onClick={() => openGroupDetail(line)}
                              className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
                            >
                              <td className="px-3 py-2.5 whitespace-nowrap text-ink text-xs">{formatDate(line.transaction_date)}</td>
                              <td className="px-3 py-2.5 text-ink text-xs">
                                <span className="block truncate" title={line.transaction_no}>{line.transaction_no}</span>
                              </td>
                              {acc.sub_accounts?.length > 0 && line.account && (
                                <td className="px-3 py-2.5 min-w-0">
                                  <span className="block font-mono text-[11px] font-semibold text-ink">{line.account.code}</span>
                                  <span className="block text-[10px] text-muted truncate" title={line.account.name}>{line.account.name}</span>
                                </td>
                              )}
                              <td className="px-3 py-2.5 text-ink text-xs">
                                <span className="block truncate" title={line.description}>{line.description}</span>
                              </td>
                              <td className="px-3 py-2.5 min-w-0">
                                {line.source?.label && (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium break-words max-w-full ${getSourceStyle(line.source.label)}`}>
                                    {line.source.label}
                                  </span>
                                )}
                                {line.source?.name && (
                                  <div className="mt-0.5 text-[11px] font-medium text-ink leading-snug truncate" title={line.source.name}>{line.source.name}</div>
                                )}
                                {line.source?.reference && (
                                  <div className="text-[10px] text-muted leading-snug truncate" title={line.source.reference}>Ref: {line.source.reference}</div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-ink text-xs">{line.debit ? formatCurrency(line.debit) : '—'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-ink text-xs">{line.credit ? formatCurrency(line.credit) : '—'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums text-xs font-medium">
                                <span className={line.running_balance > 0 ? 'text-emerald-600 dark:text-emerald-400' : line.running_balance < 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted'}>
                                  {formatCurrency(Math.abs(line.running_balance))}{line.running_balance > 0 ? ' Dr' : line.running_balance < 0 ? ' Cr' : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right">
                                <button
                                  type="button"
                                  onClick={(ev) => { ev.stopPropagation(); openGroupDetail(line) }}
                                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-ink transition-colors duration-150 ml-auto"
                                >
                                  <Info size={13} />
                                </button>
                                {sourceRoute(line.source?.reference_type) && line.source?.reference_id != null && (
                                  <button
                                    type="button"
                                    title="Open original record"
                                    onClick={(ev) => { ev.stopPropagation(); goToSource(line.source.reference_type, line.source.reference_id, line.source.reference || line.source.name) }}
                                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-primary/10 hover:text-primary-dark transition-colors duration-150 ml-1"
                                  >
                                    <ExternalLink size={13} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border bg-bg font-semibold">
                            <td colSpan={acc.sub_accounts?.length > 0 ? 5 : 4} className="px-3 py-2 text-right text-[10.5px] uppercase tracking-wide text-muted">
                              {acc.sub_accounts?.length > 0 ? `${acc.sub_accounts.length + 1} accounts` : 'Account total'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-ink text-xs">{formatCurrency(acc.total_debit)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-ink text-xs">{formatCurrency(acc.total_credit)}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-ink text-xs">{formatCurrency(acc.total_debit - acc.total_credit)}</td>
                            <td className="px-3 py-2"></td>
                          </tr>
                        </tfoot>
                      </ResponsiveTable>
                    </div>
                  )}

                  {!isCollapsed && acc.lines.length === 0 && (
                    <p className="py-2 text-xs text-muted">No postings in this period.</p>
                  )}
                </div>
              )
            })}
          </div>

          {ledgerData.accounts.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted">No accounts match your filters.</p>
          )}

          {ledgerData.accounts.length > 0 && (
            <div className="flex items-center justify-end gap-6 border-t border-border bg-bg px-4 py-3">
              <span className="text-[10.5px] uppercase tracking-wide text-muted">Totals</span>
              <span className="w-28 whitespace-nowrap text-right text-xs tabular-nums text-ink">Dr {formatCurrency(ledgerData.totals.debit)}</span>
              <span className="w-28 whitespace-nowrap text-right text-xs tabular-nums text-ink">Cr {formatCurrency(ledgerData.totals.credit)}</span>
              <span className={`w-32 whitespace-nowrap text-right text-xs font-semibold tabular-nums ${Math.abs(ledgerData.totals.balance) < 0.005 ? 'text-status-success' : 'text-status-danger'}`}>
                {Math.abs(ledgerData.totals.balance) < 0.005 ? 'Balanced' : formatCurrency(Math.abs(ledgerData.totals.balance)) + ' off'}
              </span>
            </div>
          )}
        </div>
      )}

      {!loading && view === 'trial-balance' && (
        <div className={PANEL}>
        <div className="overflow-hidden rounded-t-xl">
          <ResponsiveTable className="w-full text-sm">
            <thead className="bg-surface">
                <tr className="border-b border-border">
                  <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Account</th>
                  <th className="w-32 text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Total Debit</th>
                  <th className="w-32 text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Total Credit</th>
                  <th className="w-32 text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {trialBalance.map((row) => {
                  const net = Number(row.net_balance || 0)
                  return (
                    <tr
                      key={row.account_id}
                      onClick={() => { setAccountFilter(String(row.account_id)); setView('ledger') }}
                      className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
                    >
                      <td className="px-4 py-3.5 text-ink text-xs">{row.account_code}  -  {row.account_name}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink text-xs">{row.total_debit ? formatCurrency(row.total_debit) : '—'}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink text-xs">{row.total_credit ? formatCurrency(row.total_credit) : '—'}</td>
                      <td className={`px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-medium text-xs ${net > 0 ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted'}`}>
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
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-ink text-xs">{formatCurrency(trialTotals.debit)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums text-ink text-xs">{formatCurrency(trialTotals.credit)}</td>
                    <td className={`px-4 py-3 whitespace-nowrap text-right tabular-nums text-xs ${Math.abs(trialTotals.debit - trialTotals.credit) < 0.005 ? 'text-status-success' : 'text-status-danger'}`}>
                      {Math.abs(trialTotals.debit - trialTotals.credit) < 0.005 ? 'Balanced' : formatCurrency(Math.abs(trialTotals.debit - trialTotals.credit)) + ' off'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </ResponsiveTable>
          </div>
        </div>
      )}

      <Modal
        open={!!detailGroup}
        onClose={closeDetail}
        title="Transaction Detail"
        footer={
          <div className="flex items-center gap-2">
            {detailGroup?.lines?.some((l) => l.source && l.source.reference_id != null) && (
              <Button variant="primary" size="md" icon={ExternalLink} iconPosition="left" onClick={openDetailSource}>
                Open Original Record
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
          </div>
        }
      >
        {detailLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        )}
        {!detailLoading && detailGroup?.lines && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">{detailGroup.description}</p>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${detailGroup.is_balanced ? 'bg-status-success-bg text-status-success' : 'bg-status-danger-bg text-status-danger'}`}>
                {detailGroup.is_balanced ? 'Balanced' : 'Out of Balance'}
              </span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Transaction No." value={detailGroup.transaction_no} />
                <DetailRow label="Transaction Date" value={formatDate(detailGroup.transaction_date)} />
                <DetailRow label="Status" value={detailGroup.status} />
              </div>
              {detailGroup.lines.map((line) => (
                <div key={line.id} className="px-3 py-2">
                  <DetailRow label="Account" value={`${line.account_code}  -  ${line.account_name}`} />
                  <DetailRow label="Source" value={line.source?.label ?? '—'} />
                  <DetailRow label="From / Client" value={line.source?.name ?? '—'} />
                  <DetailRow label="Reference" value={line.source?.reference || line.remarks || '—'} />
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