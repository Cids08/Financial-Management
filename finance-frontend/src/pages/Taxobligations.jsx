import { useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Receipt, CheckCircle2, Clock3, AlertTriangle, Info, Printer, Sparkles, Eye, EyeOff, ChevronLeft, ChevronRight, Loader2, CalendarRange, X } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useTaxObligations } from '../hooks/useTaxObligations'

const pad = (n) => String(n).padStart(2, '0')
const QUARTER_LABELS = { 1: 'Q1 (Jan–Mar)', 2: 'Q2 (Apr–Jun)', 3: 'Q3 (Jul–Sep)', 4: 'Q4 (Oct–Dec)' }

// AUTOMATION: each tax type carries its own filing cadence, BIR form code, and
// statutory due-date rule, so the form only ever asks "which period?" — the
// due date and reference-number prefix are computed, never typed from scratch.
// Also carries a suggested default tax_rate, since the ERD requires one —
// still fully editable, this is just a sane starting point per tax type.
const TAX_TYPE_CONFIG = {
  'VAT': {
    code: 'VAT', periodType: 'month', defaultRate: 12,
    computeDue: (y, m) => { let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny += 1 }; return `${ny}-${pad(nm)}-20` },
  },
  'Withholding Tax': {
    code: 'EWT', periodType: 'month', defaultRate: 2,
    computeDue: (y, m) => { let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny += 1 }; return `${ny}-${pad(nm)}-10` },
  },
  'Percentage Tax': {
    code: 'PT', periodType: 'month', defaultRate: 3,
    computeDue: (y, m) => { let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny += 1 }; return `${ny}-${pad(nm)}-20` },
  },
  'Documentary Stamp Tax': {
    code: 'DST', periodType: 'month', defaultRate: 1.5,
    computeDue: (y, m) => { let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny += 1 }; return `${ny}-${pad(nm)}-05` },
  },
  'Income Tax': {
    code: 'ITR', periodType: 'quarter', defaultRate: 25,
    computeDue: (y, q) => ({ 1: `${y}-05-15`, 2: `${y}-08-15`, 3: `${y}-11-15`, 4: `${y + 1}-04-15` }[q]),
  },
  'Local Business Tax': {
    code: 'LBT', periodType: 'quarter', defaultRate: 2,
    computeDue: (y, q) => ({ 1: `${y}-01-20`, 2: `${y}-04-20`, 3: `${y}-07-20`, 4: `${y}-10-20` }[q]),
  },
}
const TAX_TYPES = Object.keys(TAX_TYPE_CONFIG)

function computePeriodAndDue(taxType, year, month, quarter) {
  const config = TAX_TYPE_CONFIG[taxType]
  if (config.periodType === 'month') {
    return { tax_period: `${year}-${pad(month)}`, due_date: config.computeDue(Number(year), Number(month)) }
  }
  return { tax_period: `${year}-Q${quarter}`, due_date: config.computeDue(Number(year), Number(quarter)) }
}

function parsePeriod(taxType, taxPeriod) {
  const config = TAX_TYPE_CONFIG[taxType]
  if (!taxPeriod) return {}
  if (config.periodType === 'month') {
    const [y, m] = taxPeriod.split('-')
    return { period_year: Number(y), period_month: Number(m) }
  }
  const [y, q] = taxPeriod.split('-Q')
  return { period_year: Number(y), period_quarter: Number(q) }
}

function suggestReference(taxType, dueDate) {
  if (!dueDate) return ''
  const [, m, d] = dueDate.split('-')
  return `BIR-${TAX_TYPE_CONFIG[taxType].code}-${m}${d}`
}

function buildEmptyForm() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const quarter = Math.ceil(month / 3)
  const taxType = TAX_TYPES[0]
  const { tax_period, due_date } = computePeriodAndDue(taxType, year, month, quarter)
  return {
    tax_type: taxType, period_year: year, period_month: month, period_quarter: quarter,
    tax_period, due_date, tax_rate: TAX_TYPE_CONFIG[taxType].defaultRate, taxable_amount: '',
    is_paid: false, payment_date: '', reference_number: '', remarks: '',
  }
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
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Paid: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Overdue: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function daysUntil(dueDate) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0)
  return Math.round((due - today) / 86400000)
}

// Masks a formatted currency string down to just the peso sign + dots,
// e.g. "₱84,500.00" -> "₱••••••". Same masking philosophy as the
// contact-number/account-number masking on Collectors/CashAccounts,
// applied here to money instead of digits-you-could-dial.
function maskCurrency(formatted) {
  if (!formatted) return formatted
  return formatted.replace(/[0-9.,]/g, '•')
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-ink text-right">{value ?? '—'}</span>
    </div>
  )
}

export default function TaxObligations({ title = 'Tax Obligations', crumbs = ['Compliance', 'Tax Obligations'] }) {
  const {
    obligations, meta, loading, saving, error,
    search, setSearch,
    statusFilter, setStatusFilter,
    showArchived, setShowArchived,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    page, setPage,
    createObligation, updateObligation, archiveObligation, restoreObligation,
  } = useTaxObligations()

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(buildEmptyForm)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)
  const [refTouched, setRefTouched] = useState(false)

  // Due-date range filter now lives in useTaxObligations and is sent to the
  // backend alongside search/status, so it applies across every page.
  const hasDateFilter = Boolean(dateFrom || dateTo)
  const clearDateFilter = () => { setDateFrom(''); setDateTo('') }

  // Per-row "reveal amount" toggle — masked by default everywhere a
  // money figure shows (table + detail modal), same pattern as the
  // phone/account-number masking on Collectors/CashAccounts.
  const [revealedIds, setRevealedIds] = useState(new Set())
  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Page-scoped — meta.total (Total Obligations card) is the one
  // accurate global number; see Collectors.jsx for the same caveat.
  const pageStats = useMemo(() => ({
    paid: obligations.filter((o) => o.status === 'Paid').length,
    overdue: obligations.filter((o) => o.status === 'Overdue').length,
    dueAmount: obligations.filter((o) => o.status !== 'Paid').reduce((sum, o) => sum + o.amount, 0),
  }), [obligations])

  // AUTOMATION: changing tax type or period recomputes tax_period + due_date
  // together — the person never types either one directly.
  const updatePeriod = (patch) => {
    setForm((f) => {
      const next = { ...f, ...patch }
      const { tax_period, due_date } = computePeriodAndDue(next.tax_type, next.period_year, next.period_month, next.period_quarter)
      const nextForm = { ...next, tax_period, due_date }
      if (patch.tax_type) nextForm.tax_rate = TAX_TYPE_CONFIG[patch.tax_type].defaultRate
      if (nextForm.is_paid && !refTouched) nextForm.reference_number = suggestReference(nextForm.tax_type, nextForm.due_date)
      return nextForm
    })
  }

  const openAdd = () => { setForm(buildEmptyForm()); setFormError(''); setRefTouched(false); setModalMode('add') }
  const openEdit = (o) => {
    const { period_year, period_month, period_quarter } = parsePeriod(o.tax_type, o.tax_period)
    setForm({
      tax_type: o.tax_type, period_year, period_month, period_quarter,
      tax_period: o.tax_period, due_date: o.due_date,
      tax_rate: o.tax_rate, taxable_amount: o.taxable_amount,
      is_paid: o.status === 'Paid', payment_date: o.payment_date || '', reference_number: o.reference_number || '', remarks: o.remarks || '',
    })
    setFormError('')
    setRefTouched(!!o.reference_number)
    setModalMode(o)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const openDetail = (o) => setDetailRecord(o)
  const closeDetail = () => setDetailRecord(null)

  const togglePaid = (checked) => {
    setForm((f) => {
      const next = { ...f, is_paid: checked }
      if (checked) {
        if (!next.payment_date) next.payment_date = new Date().toISOString().slice(0, 10)
        if (!refTouched) next.reference_number = suggestReference(next.tax_type, next.due_date)
      }
      return next
    })
  }

  // Live-computed preview only — the authoritative tax_amount is always
  // recalculated server-side in TaxObligationService from the same two
  // inputs, so this can never drift from what actually gets saved.
  const computedTaxAmount = (Number(form.taxable_amount) || 0) * (Number(form.tax_rate) || 0) / 100

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.taxable_amount) {
      setFormError('Taxable amount is required.')
      return
    }
    if (form.is_paid && !form.payment_date) {
      setFormError('Payment date is required when marking as paid.')
      return
    }
    const payload = {
      tax_type: form.tax_type,
      tax_period: form.tax_period,
      due_date: form.due_date,
      tax_rate: Number(form.tax_rate) || 0,
      taxable_amount: Number(form.taxable_amount) || 0,
      is_paid: form.is_paid,
      payment_date: form.is_paid ? form.payment_date : null,
      reference_number: form.is_paid ? form.reference_number : null,
      remarks: form.remarks,
    }

    const result = modalMode === 'add'
      ? await createObligation(payload)
      : await updateObligation(modalMode.tax_id, payload)

    if (!result.success) {
      setFormError(result.message)
      return
    }
    closeModal()
  }

  const handlePrint = (o) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Tax Type', o.tax_type],
      ['Tax Period', o.tax_period],
      ['Due Date', formatDate(o.due_date)],
      ['Taxable Amount', formatCurrency(o.taxable_amount)],
      ['Tax Rate', `${o.tax_rate}%`],
      ['Amount', formatCurrency(o.amount)],
      ['Status', o.status],
      ...(o.payment_date ? [['Payment Date', formatDate(o.payment_date)]] : []),
      ...(o.reference_number ? [['Reference No.', o.reference_number]] : []),
      ...(o.remarks ? [['Remarks', o.remarks]] : []),
    ]
    win.document.write(`
      <html>
        <head>
          <title>${o.tax_type} — ${o.tax_period}</title>
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
            <div><h1>${o.tax_type}</h1><p>Period: ${o.tax_period}</p></div>
            <span class="status">${o.status}</span>
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

  const statCards = [
    { key: 'total', label: 'Total Obligations', value: meta.total, icon: Receipt, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'paid', label: 'Paid (this page)', value: pageStats.paid, icon: CheckCircle2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Paid' && !showArchived, onClick: () => { setStatusFilter('Paid'); setShowArchived(false) } },
    { key: 'overdue', label: 'Overdue (this page)', value: pageStats.overdue, icon: AlertTriangle, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: statusFilter === 'Overdue' && !showArchived, onClick: () => { setStatusFilter('Overdue'); setShowArchived(false) } },
    { key: 'due', label: 'Amount Due (this page)', value: formatCurrency(pageStats.dueAmount), icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: false, onClick: () => {} },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'
  const periodType = TAX_TYPE_CONFIG[form.tax_type].periodType
  const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

  // meta doesn't carry per_page from the backend, so derive it from the
  // current page's row count (falls back to 1 to avoid a divide-by-zero
  // on an empty last page) — same "Showing X–Y of Z" shape as Expenses.
  const perPage = obligations.length || 1
  const rangeStart = meta.total === 0 ? 0 : (meta.current_page - 1) * perPage + 1
  const rangeEnd = Math.min((meta.current_page - 1) * perPage + obligations.length, meta.total)

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">
            Track statutory tax filings and payments. Obligations automatically flip to <span className="font-medium text-red-500">Overdue</span> once their due date passes — no manual update needed.
          </p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Obligation</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

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

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1 min-w-0 basis-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by tax type, period, or reference no..."
            className={SEARCH_INPUT}
            style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0 }}
            autoComplete="off"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT} style={{ ...INPUT_TEXT_STYLE, width: 'auto', minWidth: '9rem' }}>
          <option value="all">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Overdue">Overdue</option>
          <option value="Paid">Paid</option>
        </select>
        <div className="flex items-center gap-1.5 shrink-0">
          <CalendarRange size={15} className="text-muted shrink-0" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            max={dateTo || undefined}
            aria-label="Due date from"
            className={`${INPUT} scheme-light dark:scheme-dark`}
            style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom || undefined}
            aria-label="Due date to"
            className={`${INPUT} scheme-light dark:scheme-dark`}
            style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
          />
          {hasDateFilter && (
            <Tooltip label="Clear date filter" align="end">
              <button
                type="button"
                onClick={clearDateFilter}
                aria-label="Clear date filter"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
              >
                <X size={15} />
              </button>
            </Tooltip>
          )}
        </div>
        <Button
          variant={showArchived ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => setShowArchived((prev) => !prev)}
          className="shrink-0 whitespace-nowrap"
        >
          Show Archived
        </Button>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Tax Type / Period</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Due Date</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                  <Loader2 size={16} className="inline animate-spin mr-2" /> Loading tax obligations…
                </td></tr>
              )}
              {!loading && obligations.map((o) => {
                const remaining = daysUntil(o.due_date)
                const revealed = revealedIds.has(o.tax_id)
                const formattedAmount = formatCurrency(o.amount)
                return (
                  <tr key={o.tax_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{o.tax_type}</p>
                      <p className="text-xs text-muted">{o.tax_period}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink">{formatDate(o.due_date)}</p>
                      {o.status !== 'Paid' && (
                        <p className={`text-xs ${remaining < 0 ? 'text-red-500' : 'text-muted'}`}>
                          {remaining < 0 ? `${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'} overdue` : remaining === 0 ? 'Due today' : `Due in ${remaining} day${remaining === 1 ? '' : 's'}`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        {revealed ? formattedAmount : maskCurrency(formattedAmount)}
                        <button
                          type="button"
                          onClick={() => toggleReveal(o.tax_id)}
                          aria-label={revealed ? 'Hide amount' : 'Show amount'}
                          className="shrink-0 text-muted hover:text-ink transition-colors duration-150"
                        >
                          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[o.status]}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="View full record" align="start">
                          <button type="button" onClick={() => openDetail(o)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Info size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Print" align="start">
                          <button type="button" onClick={() => handlePrint(o)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Printer size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Edit obligation" align="start">
                          <button type="button" onClick={() => openEdit(o)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label={showArchived ? 'Restore obligation' : 'Archive obligation'} align="end">
                          <button
                            type="button"
                            onClick={() => (showArchived ? restoreObligation(o.tax_id) : archiveObligation(o.tax_id))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                          >
                            {showArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && obligations.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                  {hasDateFilter ? 'No tax obligations fall within the selected date range.' : 'No tax obligations match your filters.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && obligations.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              Showing {rangeStart}–{rangeEnd} of {meta.total} tax obligations
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="px-2 text-xs font-medium text-ink whitespace-nowrap">
                Page {meta.current_page} of {meta.last_page}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
                disabled={page >= meta.last_page}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Tax Obligation' : 'Add Tax Obligation'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Obligation'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}

          <div>
            <label className={LABEL}>Tax Type</label>
            <select value={form.tax_type} onChange={(e) => updatePeriod({ tax_type: e.target.value })} className={INPUT} style={INPUT_TEXT_STYLE}>
              {TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Year</label>
              <select value={form.period_year} onChange={(e) => updatePeriod({ period_year: Number(e.target.value) })} className={INPUT} style={INPUT_TEXT_STYLE}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {periodType === 'month' ? (
              <div>
                <label className={LABEL}>Month</label>
                <select value={form.period_month} onChange={(e) => updatePeriod({ period_month: Number(e.target.value) })} className={INPUT} style={INPUT_TEXT_STYLE}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('en-PH', { month: 'long' })}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={LABEL}>Quarter</label>
                <select value={form.period_quarter} onChange={(e) => updatePeriod({ period_quarter: Number(e.target.value) })} className={INPUT} style={INPUT_TEXT_STYLE}>
                  {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{QUARTER_LABELS[q]}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-bg px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Sparkles size={14} className="text-primary-dark shrink-0" />
              <span>Auto-computed from filing rules for <strong className="text-ink">{TAX_TYPE_CONFIG[form.tax_type].code}</strong> — adjust if BIR grants an extension.</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tax Period</label>
              <input type="text" value={form.tax_period} readOnly className={`${INPUT} bg-bg cursor-not-allowed`} style={INPUT_TEXT_STYLE} />
            </div>
            <div>
              <label className={LABEL}>Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} />
            </div>
          </div>

          {/* Taxable amount + rate are the real ERD inputs — tax_amount
              (shown as "Amount" elsewhere) is always derived from these
              two, both here for preview and again server-side as the
              value of record. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Taxable Amount</label>
              <input type="number" value={form.taxable_amount} onChange={(e) => setForm((f) => ({ ...f, taxable_amount: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>Tax Rate (%)</label>
              <input type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="12" />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-bg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted">Computed tax amount</span>
            <span className="text-sm font-semibold text-ink tabular-nums">{formatCurrency(computedTaxAmount)}</span>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input type="checkbox" checked={form.is_paid} onChange={(e) => togglePaid(e.target.checked)} className="rounded border-border accent-primary" />
            Already paid / filed
          </label>
          <p className="-mt-2 text-xs text-muted">Leave unchecked to keep as Pending — it will automatically show as Overdue past the due date, no need to set that manually.</p>

          {form.is_paid && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Payment Date</label>
                <input type="date" value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} />
              </div>
              <div>
                <label className={LABEL}>Reference Number</label>
                <input
                  type="text"
                  value={form.reference_number}
                  onChange={(e) => { setRefTouched(true); setForm((f) => ({ ...f, reference_number: e.target.value })) }}
                  className={INPUT}
                  style={INPUT_TEXT_STYLE}
                  placeholder={suggestReference(form.tax_type, form.due_date)}
                />
              </div>
            </div>
          )}

          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="Optional notes" />
          </div>

          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <p className="text-xs font-medium text-muted mb-1">Record Info (read-only)</p>
              <DetailRow label="Created by" value={modalMode.created_by_name || '—'} />
              <DetailRow label="Created at" value={formatDateTime(modalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(modalMode.updated_at)} />
              {modalMode.expense_id && (
                <DetailRow label="Recorded Expense" value={`#${modalMode.expense_id}`} />
              )}
              {modalMode.is_archived && (
                <>
                  <DetailRow label="Archived by" value={modalMode.archived_by_name || '—'} />
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
        title="Tax Obligation Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.tax_type}</p>
                <p className="text-xs text-muted">{detailRecord.tax_period}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status]}`}>{detailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Due Date" value={formatDate(detailRecord.due_date)} />
                <DetailRow label="Taxable Amount" value={revealedIds.has(detailRecord.tax_id) ? formatCurrency(detailRecord.taxable_amount) : maskCurrency(formatCurrency(detailRecord.taxable_amount))} />
                <DetailRow label="Tax Rate" value={`${detailRecord.tax_rate}%`} />
                <DetailRow
                  label="Amount"
                  value={
                    <button type="button" onClick={() => toggleReveal(detailRecord.tax_id)} className="inline-flex items-center gap-1.5 hover:text-primary-dark transition-colors duration-150">
                      {revealedIds.has(detailRecord.tax_id) ? formatCurrency(detailRecord.amount) : maskCurrency(formatCurrency(detailRecord.amount))}
                      {revealedIds.has(detailRecord.tax_id) ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  }
                />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Payment Date" value={formatDate(detailRecord.payment_date)} />
                <DetailRow label="Reference No." value={detailRecord.reference_number || '—'} />
                {detailRecord.expense_id && (
                  <DetailRow label="Recorded Expense" value={`#${detailRecord.expense_id}`} />
                )}
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Remarks" value={detailRecord.remarks || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={detailRecord.created_by_name || '—'} />
                <DetailRow label="Created at" value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(detailRecord.updated_at)} />
                {detailRecord.is_archived && (
                  <>
                    <DetailRow label="Archived by" value={detailRecord.archived_by_name || '—'} />
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