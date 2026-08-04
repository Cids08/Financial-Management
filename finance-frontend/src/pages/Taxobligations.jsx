import { useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Receipt, CheckCircle2, Clock3, AlertTriangle, Info, Printer, Sparkles } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'

// Users (created_by / archived_by on the ERD)
const USERS = [
  { user_id: 1, first_name: 'Ana', last_name: 'Reyes' },
  { user_id: 2, first_name: 'Marco', last_name: 'Santos' },
  { user_id: 3, first_name: 'Liza', last_name: 'Fernandez' },
]
const userName = (id) => {
  const u = USERS.find((u) => u.user_id === Number(id))
  return u ? `${u.first_name} ${u.last_name}` : '—'
}

const pad = (n) => String(n).padStart(2, '0')
const QUARTER_LABELS = { 1: 'Q1 (Jan–Mar)', 2: 'Q2 (Apr–Jun)', 3: 'Q3 (Jul–Sep)', 4: 'Q4 (Oct–Dec)' }

// AUTOMATION: each tax type carries its own filing cadence, BIR form code, and
// statutory due-date rule, so the form only ever asks "which period?" — the
// due date and reference-number prefix are computed, never typed from scratch.
const TAX_TYPE_CONFIG = {
  'VAT': {
    code: 'VAT', periodType: 'month',
    computeDue: (y, m) => { let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny += 1 }; return `${ny}-${pad(nm)}-20` },
  },
  'Withholding Tax': {
    code: 'EWT', periodType: 'month',
    computeDue: (y, m) => { let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny += 1 }; return `${ny}-${pad(nm)}-10` },
  },
  'Percentage Tax': {
    code: 'PT', periodType: 'month',
    computeDue: (y, m) => { let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny += 1 }; return `${ny}-${pad(nm)}-20` },
  },
  'Documentary Stamp Tax': {
    code: 'DST', periodType: 'month',
    computeDue: (y, m) => { let ny = y, nm = m + 1; if (nm > 12) { nm = 1; ny += 1 }; return `${ny}-${pad(nm)}-05` },
  },
  'Income Tax': {
    code: 'ITR', periodType: 'quarter',
    // Quarterly ITR: due mid-2nd-month-after quarter end; Q4/annual due the following April 15
    computeDue: (y, q) => ({ 1: `${y}-05-15`, 2: `${y}-08-15`, 3: `${y}-11-15`, 4: `${y + 1}-04-15` }[q]),
  },
  'Local Business Tax': {
    code: 'LBT', periodType: 'quarter',
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
    tax_period, due_date, amount: '', is_paid: false, payment_date: '', reference_number: '', remarks: '',
  }
}

const initialTaxObligations = [
  { tax_id: 1, tax_type: 'VAT', tax_period: '2026-06', due_date: '2026-07-20', amount: 84500, status: 'Paid', payment_date: '2026-07-18', reference_number: 'BIR-VAT-0720', remarks: 'Filed via eFPS', created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-01T09:00:00', updated_at: '2026-07-18T10:15:00' },
  { tax_id: 2, tax_type: 'Withholding Tax', tax_period: '2026-07', due_date: '2026-08-10', amount: 32750, status: 'Pending', payment_date: null, reference_number: '', remarks: '', created_by: 2, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-25T09:00:00', updated_at: '2026-07-25T09:00:00' },
  { tax_id: 3, tax_type: 'Income Tax', tax_period: '2026-Q2', due_date: '2026-08-15', amount: 210000, status: 'Pending', payment_date: null, reference_number: '', remarks: 'Quarterly ITR', created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-01T09:00:00', updated_at: '2026-07-01T09:00:00' },
  { tax_id: 4, tax_type: 'Percentage Tax', tax_period: '2026-06', due_date: '2026-07-20', amount: 15600, status: 'Pending', payment_date: null, reference_number: '', remarks: 'Awaiting fund transfer', created_by: 3, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-01T09:00:00', updated_at: '2026-07-01T09:00:00' },
  { tax_id: 5, tax_type: 'Local Business Tax', tax_period: '2026-Q3', due_date: '2026-07-20', amount: 48000, status: 'Pending', payment_date: null, reference_number: '', remarks: '', created_by: 2, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-15T09:00:00', updated_at: '2026-07-15T09:00:00' },
  { tax_id: 6, tax_type: 'Documentary Stamp Tax', tax_period: '2026-05', due_date: '2026-06-05', amount: 9200, status: 'Paid', payment_date: '2026-06-03', reference_number: 'BIR-DST-0605', remarks: '', created_by: 1, is_archived: true, archived_at: '2026-07-20T11:00:00', archived_by: 1, created_at: '2026-05-15T09:00:00', updated_at: '2026-07-20T11:00:00' },
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

// AUTOMATION: derived status. "Overdue" is never stored on the record — it is
// calculated every render from today's date vs. due_date, so a Pending item
// automatically flips to Overdue the moment it passes its deadline with no
// manual step required. Paid records are never reclassified.
function deriveStatus(record) {
  if (record.status === 'Paid') return 'Paid'
  return daysUntil(record.due_date) < 0 ? 'Overdue' : 'Pending'
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
  const [obligations, setObligations] = useState(initialTaxObligations)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(buildEmptyForm)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)
  const [refTouched, setRefTouched] = useState(false)

  // Every obligation carries its live, automatically-derived status alongside the raw record
  const withDerivedStatus = useMemo(
    () => obligations.map((o) => ({ ...o, derivedStatus: deriveStatus(o) })),
    [obligations]
  )

  const filtered = useMemo(() => {
    return withDerivedStatus.filter((o) => {
      if (!showArchived && o.is_archived) return false
      if (showArchived && !o.is_archived) return false
      if (statusFilter !== 'all' && o.derivedStatus !== statusFilter) return false
      const q = search.toLowerCase()
      if (search && !o.tax_type.toLowerCase().includes(q) && !o.tax_period.toLowerCase().includes(q) && !(o.reference_number || '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [withDerivedStatus, search, statusFilter, showArchived])

  const stats = useMemo(() => {
    const active = withDerivedStatus.filter((o) => !o.is_archived)
    return {
      total: active.length,
      paid: active.filter((o) => o.derivedStatus === 'Paid').length,
      overdue: active.filter((o) => o.derivedStatus === 'Overdue').length,
      dueAmount: active.filter((o) => o.derivedStatus !== 'Paid').reduce((sum, o) => sum + o.amount, 0),
      archived: withDerivedStatus.filter((o) => o.is_archived).length,
    }
  }, [withDerivedStatus])

  const toggleArchive = (id) => {
    setObligations((prev) => prev.map((o) => {
      if (o.tax_id !== id) return o
      const nextArchived = !o.is_archived
      return { ...o, is_archived: nextArchived, archived_at: nextArchived ? new Date().toISOString() : null, archived_by: nextArchived ? 1 : null, updated_at: new Date().toISOString() }
    }))
  }

  // AUTOMATION: changing tax type or period recomputes tax_period + due_date
  // together — the person never types either one directly.
  const updatePeriod = (patch) => {
    setForm((f) => {
      const next = { ...f, ...patch }
      const { tax_period, due_date } = computePeriodAndDue(next.tax_type, next.period_year, next.period_month, next.period_quarter)
      const nextForm = { ...next, tax_period, due_date }
      // Keep the reference-number suggestion in sync until the person edits it themselves
      if (nextForm.is_paid && !refTouched) nextForm.reference_number = suggestReference(nextForm.tax_type, nextForm.due_date)
      return nextForm
    })
  }

  const openAdd = () => { setForm(buildEmptyForm()); setFormError(''); setRefTouched(false); setModalMode('add') }
  const openEdit = (o) => {
    const { period_year, period_month, period_quarter } = parsePeriod(o.tax_type, o.tax_period)
    setForm({
      tax_type: o.tax_type, period_year, period_month, period_quarter,
      tax_period: o.tax_period, due_date: o.due_date, amount: o.amount,
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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.amount) {
      setFormError('Amount is required.')
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
      amount: Number(form.amount) || 0,
      status: form.is_paid ? 'Paid' : 'Pending',
      payment_date: form.is_paid ? form.payment_date : null,
      reference_number: form.is_paid ? form.reference_number : '',
      remarks: form.remarks,
    }
    const now = new Date().toISOString()
    if (modalMode === 'add') {
      const nextId = Math.max(0, ...obligations.map((o) => o.tax_id)) + 1
      setObligations((prev) => [...prev, { tax_id: nextId, ...payload, created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: now, updated_at: now }])
    } else if (modalMode) {
      const editingId = modalMode.tax_id
      setObligations((prev) => prev.map((o) => (o.tax_id === editingId ? { ...o, ...payload, updated_at: now } : o)))
    }
    closeModal()
  }

  const handlePrint = (o) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const status = deriveStatus(o)
    const rows = [
      ['Tax Type', o.tax_type],
      ['Tax Period', o.tax_period],
      ['Due Date', formatDate(o.due_date)],
      ['Amount', formatCurrency(o.amount)],
      ['Status', status],
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
            <span class="status">${status}</span>
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
    { key: 'total', label: 'Total Obligations', value: stats.total, icon: Receipt, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'paid', label: 'Paid', value: stats.paid, icon: CheckCircle2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Paid' && !showArchived, onClick: () => { setStatusFilter('Paid'); setShowArchived(false) } },
    { key: 'overdue', label: 'Overdue', value: stats.overdue, icon: AlertTriangle, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: statusFilter === 'Overdue' && !showArchived, onClick: () => { setStatusFilter('Overdue'); setShowArchived(false) } },
    { key: 'due', label: 'Total Amount Due', value: formatCurrency(stats.dueAmount), icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: false, onClick: () => {} },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'
  const periodType = TAX_TYPE_CONFIG[form.tax_type].periodType
  const yearOptions = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE}>
          <option value="all">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Overdue">Overdue</option>
          <option value="Paid">Paid</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-border accent-primary" />
          Show archived
        </label>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Tax Type / Period</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Due Date</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const remaining = daysUntil(o.due_date)
                return (
                  <tr key={o.tax_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{o.tax_type}</p>
                      <p className="text-xs text-muted">{o.tax_period}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink">{formatDate(o.due_date)}</p>
                      {o.derivedStatus !== 'Paid' && (
                        <p className={`text-xs ${remaining < 0 ? 'text-red-500' : 'text-muted'}`}>
                          {remaining < 0 ? `${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? '' : 's'} overdue` : remaining === 0 ? 'Due today' : `Due in ${remaining} day${remaining === 1 ? '' : 's'}`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(o.amount)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[o.derivedStatus]}`}>{o.derivedStatus}</span>
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
                        <Tooltip label={o.is_archived ? 'Restore obligation' : 'Archive obligation'} align="end">
                          <button type="button" onClick={() => toggleArchive(o.tax_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            {o.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">No tax obligations match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Tax Obligation' : 'Add Tax Obligation'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Obligation'}</Button>
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

          {/* AUTOMATION: pick a period, not a period string — tax_period and due_date are derived */}
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

          <div>
            <label className={LABEL}>Amount</label>
            <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="0.00" />
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
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[deriveStatus(detailRecord)]}`}>{deriveStatus(detailRecord)}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Due Date" value={formatDate(detailRecord.due_date)} />
                <DetailRow label="Amount" value={formatCurrency(detailRecord.amount)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Payment Date" value={formatDate(detailRecord.payment_date)} />
                <DetailRow label="Reference No." value={detailRecord.reference_number || '—'} />
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