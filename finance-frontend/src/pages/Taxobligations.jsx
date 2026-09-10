import { useMemo, useState, useEffect } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Receipt, CheckCircle2, Clock3, AlertTriangle, Info, Printer, Sparkles, Eye, EyeOff, ChevronLeft, ChevronRight, Loader2, CalendarRange, X, Paperclip, History, FileText, Calculator, FileSpreadsheet } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import TaxObligationDocumentUploadModal from '../components/TaxObligationDocumentUploadModal'
import TaxObligationDocumentHistoryModal from '../components/TaxObligationDocumentHistoryModal'
import RecordTaxPaymentModal from '../components/RecordTaxPaymentModal'
import BatchRecordTaxPaymentModal from '../components/BatchRecordTaxPaymentModal'
import GenerateTaxScheduleModal from '../components/GenerateTaxScheduleModal'
import TaxComplianceReportModal from '../components/TaxComplianceReportModal'
import { formatCurrency } from '../utils/formatters'
import { useTaxObligations } from '../hooks/useTaxObligations'
import { useHighlightRow } from '../hooks/useHighlightRow'

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
    uploadDocument, fetchDocumentHistory, viewDocument,
    calculateTaxBase, recordTaxPayment, batchRecordTaxPayment, generateTaxSchedule,
  } = useTaxObligations()

  // Multi-row selection for batch payment
  const [selectedTaxIds, setSelectedTaxIds] = useState([])
  const [showBatchModal, setShowBatchModal] = useState(false)

  // Clear selection whenever any filter or pagination page changes
  useEffect(() => {
    setSelectedTaxIds([])
  }, [search, statusFilter, showArchived, dateFrom, dateTo, page])

  // Global search (SearchBar.jsx) navigates here with a highlightId (and,
  // since this table's `search` filter is server-side/debounced inside
  // useTaxObligations, a highlightSearch seed) whenever a tax obligation
  // record is clicked from search results.
  const { highlightedId, highlightSearch } = useHighlightRow()
  useEffect(() => {
    if (highlightSearch == null) return
    setSearch(highlightSearch)
    setStatusFilter('all')
    setShowArchived(false)
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }, [highlightSearch])

  const eligibleObligations = useMemo(() => {
    return obligations.filter((o) => o.status !== 'Paid' && !showArchived)
  }, [obligations, showArchived])

  const isAllEligibleSelected = useMemo(() => {
    return eligibleObligations.length > 0 && eligibleObligations.every((o) => selectedTaxIds.includes(o.tax_id))
  }, [eligibleObligations, selectedTaxIds])

  const selectedObligations = useMemo(() => {
    return obligations.filter((o) => selectedTaxIds.includes(o.tax_id))
  }, [obligations, selectedTaxIds])

  const selectedTotalAmount = useMemo(() => {
    return selectedObligations.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
  }, [selectedObligations])

  const toggleSelectAll = () => {
    if (isAllEligibleSelected) {
      const eligibleIds = new Set(eligibleObligations.map((o) => o.tax_id))
      setSelectedTaxIds((prev) => prev.filter((id) => !eligibleIds.has(id)))
    } else {
      const eligibleIds = eligibleObligations.map((o) => o.tax_id)
      setSelectedTaxIds((prev) => Array.from(new Set([...prev, ...eligibleIds])))
    }
  }

  const toggleSelectOne = (tax_id) => {
    setSelectedTaxIds((prev) =>
      prev.includes(tax_id) ? prev.filter((id) => id !== tax_id) : [...prev, tax_id]
    )
  }

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(buildEmptyForm)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [dateErrors, setDateErrors] = useState({ due_date: '', payment_date: '' })
  const [amountError, setAmountError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)
  const [refTouched, setRefTouched] = useState(false)

  // Auto-calculation from transactions (enterprise tax engine automation)
  const [calcLoading, setCalcLoading] = useState(false)
  const [calcResult, setCalcResult] = useState(null)
  const [calcNotice, setCalcNotice] = useState('')

  // Periodic schedule generation & reporting
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [showReportModal, setShowReportModal] = useState(false)

  // Statutory deadline compliance monitor
  const complianceAlert = useMemo(() => {
    const overdue = obligations.filter(
      (o) => o.status === 'Overdue' || (daysUntil(o.due_date) < 0 && o.status !== 'Paid')
    )
    const dueSoon = obligations.filter(
      (o) => o.status !== 'Paid' && daysUntil(o.due_date) >= 0 && daysUntil(o.due_date) <= 7
    )
    return {
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
      hasUrgent: overdue.length > 0 || dueSoon.length > 0,
    }
  }, [obligations])

  const filterUrgent = () => {
    if (complianceAlert.overdueCount > 0) {
      setStatusFilter('Overdue')
    } else {
      setStatusFilter('Pending')
    }
    setShowArchived(false)
  }

  const validateDate = (field, value) => {
    if (!value) {
      setDateErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    const d = new Date(value)
    const min = new Date('2017-01-01')
    if (isNaN(d.getTime())) {
      setDateErrors((e) => ({ ...e, [field]: 'Invalid date.' }))
    } else if (d < min) {
      setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
    } else {
      setDateErrors((e) => ({ ...e, [field]: '' }))
    }
  }

  // Supporting document upload/history — same uploadTarget/historyTarget
  // pattern as Budgets.jsx's plan attach/history, just without a has_plan
  // style gate: a tax obligation's document is optional documentation,
  // not a precondition for any workflow action here.
  const [uploadTarget, setUploadTarget] = useState(null)
  const [historyTarget, setHistoryTarget] = useState(null)
  const [paymentTarget, setPaymentTarget] = useState(null)
  // Surfaces a failure from handleViewDocument() below — same reasoning
  // as Budgets.jsx's viewNotice: this page has no other place to show a
  // "couldn't open this file" message.
  const [docNotice, setDocNotice] = useState('')

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
    setCalcResult(null)
    setCalcNotice('')
    setForm((f) => {
      const next = { ...f, ...patch }
      const { tax_period, due_date } = computePeriodAndDue(next.tax_type, next.period_year, next.period_month, next.period_quarter)
      const nextForm = { ...next, tax_period, due_date }
      if (patch.tax_type) nextForm.tax_rate = TAX_TYPE_CONFIG[patch.tax_type].defaultRate
      if (nextForm.is_paid && !refTouched) nextForm.reference_number = suggestReference(nextForm.tax_type, nextForm.due_date)
      return nextForm
    })
  }

  const openAdd = () => {
    setForm(buildEmptyForm())
    setFormError('')
    setFieldErrors({})
    setDateErrors({ due_date: '', payment_date: '' })
    setAmountError('')
    setRefTouched(false)
    setCalcResult(null)
    setCalcNotice('')
    setModalMode('add')
  }
  const openEdit = (o) => {
    if (o.status === 'Paid') return
    const { period_year, period_month, period_quarter } = parsePeriod(o.tax_type, o.tax_period)
    setForm({
      tax_type: o.tax_type, period_year, period_month, period_quarter,
      tax_period: o.tax_period, due_date: o.due_date,
      tax_rate: o.tax_rate, taxable_amount: o.taxable_amount,
      is_paid: o.status === 'Paid', payment_date: o.payment_date || '', reference_number: o.reference_number || '', remarks: o.remarks || '',
    })
    setFormError('')
    setFieldErrors({})
    setDateErrors({ due_date: '', payment_date: '' })
    setAmountError('')
    setRefTouched(!!o.reference_number)
    setCalcResult(null)
    setCalcNotice('')
    setModalMode(o)
  }
  const closeModal = () => {
    setModalMode(null)
    setFormError('')
    setFieldErrors({})
    setDateErrors({ due_date: '', payment_date: '' })
    setAmountError('')
    setCalcResult(null)
    setCalcNotice('')
  }

  const handleAutoCompute = async () => {
    setCalcLoading(true)
    setCalcNotice('')
    setCalcResult(null)
    const currentPeriodType = TAX_TYPE_CONFIG[form.tax_type]?.periodType || 'month'
    const res = await calculateTaxBase({
      tax_type: form.tax_type,
      period_year: form.period_year,
      period_month: currentPeriodType === 'month' ? form.period_month : null,
      period_quarter: currentPeriodType === 'quarter' ? form.period_quarter : null,
    })
    setCalcLoading(false)
    if (!res.success) {
      setCalcNotice(res.message || 'Could not auto-calculate tax base.')
      return
    }
    setCalcResult(res.data)
  }

  const handleApplyComputed = () => {
    if (!calcResult) return
    setForm((f) => ({
      ...f,
      taxable_amount: String(calcResult.suggested_taxable_amount),
      tax_rate: String(calcResult.suggested_tax_rate ?? f.tax_rate),
    }))
    setFieldErrors((fe) => ({ ...fe, taxable_amount: '', tax_rate: '' }))
    setAmountError('')
  }

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
    setFormError('')
    const errors = {}

    if (!form.taxable_amount && form.taxable_amount !== 0) {
      errors.taxable_amount = 'Taxable amount is required.'
    } else if (Number(form.taxable_amount) < 0) {
      errors.taxable_amount = 'Taxable amount cannot be negative.'
    } else if (Number(form.taxable_amount) === 0) {
      errors.taxable_amount = 'Taxable amount must be greater than zero.'
    }

    if (form.tax_rate !== '' && Number(form.tax_rate) < 0) {
      errors.tax_rate = 'Tax rate cannot be negative.'
    }

    if (!form.due_date) {
      errors.due_date = 'Due date is required.'
    }

    if (form.is_paid && !form.payment_date) {
      errors.payment_date = 'Payment date is required when marking as paid.'
    }

    if (form.is_paid && form.reference_number && form.reference_number.trim()) {
      const trimmedRef = form.reference_number.trim().toLowerCase()
      const dup = obligations.find((o) => {
        if (modalMode !== 'add' && o.tax_id === modalMode?.tax_id) return false
        return (o.reference_number || '').trim().toLowerCase() === trimmedRef
      })
      if (dup) {
        errors.reference_number = `Reference number is already used by ${dup.tax_type} (${dup.tax_period}).`
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

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

    if (modalMode !== 'add' && modalMode?.status === 'Paid') {
      setFormError('Paid tax obligations cannot be edited.')
      return
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

  // Opens the current (latest) attached document in a new tab instead of
  // requiring History-then-View. Same synchronous-tab-then-redirect
  // approach as Budgets.jsx's handleViewPlan() — the tab has to open
  // BEFORE the await below, or most browsers' popup blockers no longer
  // consider it a direct result of the click and may silently block it.
  const handleViewDocument = async (o) => {
    const targetWindow = window.open('', '_blank')
    const result = await viewDocument(o.tax_id, o.latest_document_id, targetWindow)
    if (!result.success) {
      setDocNotice(`Couldn't open the document: ${result.message}`)
    } else if (!result.viewedInline) {
      setDocNotice("This file type can't be previewed in-browser, so it's been downloaded instead.")
    } else {
      setDocNotice('')
    }
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
    { key: 'paid', label: 'Paid Obligations', value: pageStats.paid, icon: CheckCircle2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Paid' && !showArchived, onClick: () => { setStatusFilter('Paid'); setShowArchived(false) } },
    { key: 'overdue', label: 'Overdue Obligations', value: pageStats.overdue, icon: AlertTriangle, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: statusFilter === 'Overdue' && !showArchived, onClick: () => { setStatusFilter('Overdue'); setShowArchived(false) } },
    { key: 'due', label: 'Total Amount Due', value: formatCurrency(pageStats.dueAmount), icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: false, onClick: () => {} },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'
  // Mirrors TaxObligationService::update()'s actual guard exactly: once
  // expense_id is set, tax_type/period/rate/amount/due_date/is_paid are
  // rejected server-side if changed — remarks/payment_date/reference_number
  // are NOT locked (pure documentation, no financial impact). Rather than
  // hide the whole Edit action (which would also block those still-legal
  // edits), lock only the fields the backend actually rejects, so the
  // form shows the real rule instead of letting you type into a field
  // that fails on save.
  const isLockedObligation = isEditing && !!modalMode.expense_id
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
        <div className="min-w-0 pr-4">
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">
            Track statutory tax filings and payments. Obligations automatically flip to <span className="font-medium text-red-500">Overdue</span> once their due date passes — no manual update needed.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={() => setShowReportModal(true)}>
            Tax Report
          </Button>
          <Button variant="secondary" size="sm" icon={CalendarRange} onClick={() => setShowScheduleModal(true)}>
            Generate Schedule
          </Button>
          <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>
            Add Obligation
          </Button>
        </div>
      </div>

      {/* Statutory Filing Compliance Alert */}
      {complianceAlert.hasUrgent && statusFilter === 'all' && !showArchived && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/10 p-3 text-xs">
          <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300">
            <AlertTriangle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" />
            <span>
              <strong>Statutory Filing Deadline Notice:</strong>{' '}
              {complianceAlert.overdueCount > 0 && (
                <span className="font-semibold text-rose-700 dark:text-rose-400">
                  {complianceAlert.overdueCount} obligation{complianceAlert.overdueCount === 1 ? '' : 's'} OVERDUE.{' '}
                </span>
              )}
              {complianceAlert.dueSoonCount > 0 && (
                <span>
                  {complianceAlert.dueSoonCount} obligation{complianceAlert.dueSoonCount === 1 ? '' : 's'} due within the next 7 days.
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={filterUrgent}
            className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors shrink-0 shadow-xs"
          >
            Review Urgent Filings
          </button>
        </div>
      )}

      {scheduleNotice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={14} className="shrink-0" />
            {scheduleNotice}
          </span>
          <button type="button" onClick={() => setScheduleNotice('')} className="shrink-0 font-medium underline">Dismiss</button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

      {docNotice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          <span>{docNotice}</span>
          <button type="button" onClick={() => setDocNotice('')} className="shrink-0 font-medium underline">Dismiss</button>
        </div>
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
        {/* Active multi-row selection bar for batch payment */}
        {selectedTaxIds.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                {selectedTaxIds.length}
              </span>
              <span className="font-semibold text-ink">
                {selectedTaxIds.length} obligation{selectedTaxIds.length === 1 ? '' : 's'} selected
              </span>
              <span className="text-muted">·</span>
              <span className="text-muted">
                Total Due:{' '}
                <span className="font-bold text-ink">
                  {formatCurrency(selectedTotalAmount)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedTaxIds([])}
                className="text-xs text-muted hover:text-ink font-medium px-2 py-1 rounded hover:bg-bg transition-colors"
              >
                Clear
              </button>
              <Button
                variant="primary"
                size="sm"
                icon={Receipt}
                onClick={() => setShowBatchModal(true)}
              >
                Batch Pay ({selectedTaxIds.length})
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-center font-semibold text-muted text-xs uppercase tracking-wider px-2.5 py-3 w-10 whitespace-nowrap">
                  {!showArchived && eligibleObligations.length > 0 && (
                    <input
                      type="checkbox"
                      checked={isAllEligibleSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all eligible unpaid obligations on this page"
                      className="rounded border-border text-primary focus:ring-primary/40 cursor-pointer h-3.5 w-3.5 align-middle"
                    />
                  )}
                </th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-3.5 py-3 whitespace-nowrap">Tax Type / Period</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-3 py-3 whitespace-nowrap">Due Date</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wider px-3 py-3 whitespace-nowrap">Amount</th>
                <th className="bg-surface text-center font-semibold text-muted text-xs uppercase tracking-wider px-3 py-3 whitespace-nowrap">Status</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wider px-3.5 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  <Loader2 size={16} className="inline animate-spin mr-2" /> Loading tax obligations…
                </td></tr>
              )}
              {!loading && obligations.map((o) => {
                const remaining = daysUntil(o.due_date)
                const revealed = revealedIds.has(o.tax_id)
                const formattedAmount = formatCurrency(o.amount)
                return (
                  <tr
                    key={o.tax_id}
                    data-row-id={o.tax_id}
                    className={`border-b border-border last:border-0 transition-colors duration-300
                      ${selectedTaxIds.includes(o.tax_id) ? 'bg-emerald-50/40 dark:bg-emerald-500/5' : highlightedId === o.tax_id ? 'bg-primary/10' : 'hover:bg-bg'}`}
                  >
                    <td className="px-2.5 py-2.5 text-center w-10 whitespace-nowrap">
                      {o.status !== 'Paid' && !showArchived ? (
                        <input
                          type="checkbox"
                          checked={selectedTaxIds.includes(o.tax_id)}
                          onChange={() => toggleSelectOne(o.tax_id)}
                          aria-label={`Select ${o.tax_type}`}
                          className="rounded border-border text-primary focus:ring-primary/40 cursor-pointer h-3.5 w-3.5 align-middle"
                        />
                      ) : null}
                    </td>
                    <td className="px-3.5 py-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => openDetail(o)}
                        className="font-semibold text-ink hover:text-primary transition-colors text-left truncate block"
                        title="Click to view tax obligation details"
                      >
                        {o.tax_type}
                      </button>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-muted">{o.tax_period}</p>
                        {o.has_document && (
                          <Tooltip label="Supporting document attached">
                            <Paperclip size={11} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      <p className="font-medium text-ink">{formatDate(o.due_date)}</p>
                      {o.status !== 'Paid' && (
                        <p className={`text-[11px] ${remaining < 0 ? 'text-red-500 font-medium' : 'text-muted'}`}>
                          {remaining < 0 ? `${Math.abs(remaining)}d overdue` : remaining === 0 ? 'Due today' : `Due in ${remaining}d`}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right font-medium tabular-nums text-ink text-xs sm:text-sm">
                      <span className="inline-flex items-center justify-end gap-1.5">
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
                    <td className="px-3 py-2.5 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[o.status]}`}>{o.status}</span>
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Workflow Action: Pay (Unpaid obligations only) */}
                        {o.status !== 'Paid' && !showArchived && (
                          <div className="flex items-center mr-1 pr-1.5 border-r border-border">
                            <Tooltip label="Record BIR Payment" align="start">
                              <button
                                type="button"
                                onClick={() => setPaymentTarget(o)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition-all duration-150 active:scale-95 shrink-0"
                              >
                                <Receipt size={12} />
                                <span>Pay</span>
                              </button>
                            </Tooltip>
                          </div>
                        )}

                        {/* View full record details */}
                        <Tooltip label="View details" align="start">
                          <button type="button" onClick={() => openDetail(o)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Info size={14} />
                          </button>
                        </Tooltip>

                        {/* Unified Supporting Document Action */}
                        <Tooltip label={o.has_document ? 'View supporting documents' : 'Attach supporting document'} align="start">
                          <button
                            type="button"
                            onClick={() => (o.has_document ? setHistoryTarget(o) : setUploadTarget(o))}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
                              o.has_document
                                ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20'
                                : 'text-muted hover:bg-bg hover:text-ink'
                            }`}
                          >
                            <Paperclip size={14} fill={o.has_document ? 'currentColor' : 'none'} fillOpacity={o.has_document ? 0.2 : 0} />
                          </button>
                        </Tooltip>

                        {/* Print tax voucher */}
                        <Tooltip label="Print tax voucher" align="start">
                          <button type="button" onClick={() => handlePrint(o)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Printer size={14} />
                          </button>
                        </Tooltip>

                        {/* Edit: only when not paid and not archived */}
                        {o.status !== 'Paid' && !showArchived && (
                          <Tooltip label="Edit obligation" align="start">
                            <button type="button" onClick={() => openEdit(o)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <Pencil size={14} />
                            </button>
                          </Tooltip>
                        )}

                        {/* Archive / Restore:
                            - Only Paid obligations can be archived
                            - In archived view, Restore button is shown */}
                        {showArchived ? (
                          <Tooltip label="Restore obligation" align="end">
                            <button
                              type="button"
                              onClick={() => restoreObligation(o.tax_id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <RotateCcw size={14} />
                            </button>
                          </Tooltip>
                        ) : o.status === 'Paid' ? (
                          <Tooltip label="Archive obligation" align="end">
                            <button
                              type="button"
                              onClick={() => archiveObligation(o.tax_id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <Archive size={14} />
                            </button>
                          </Tooltip>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && obligations.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
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

          {isLockedObligation && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
              This obligation's payment has already been posted as an approved expense — tax type, period, rate, taxable amount, due date, and the paid checkbox are locked. Remarks, payment date, and reference number can still be edited. To correct the amount or dates, archive this obligation instead.
            </div>
          )}

          <div>
            <label className={LABEL}>Tax Type</label>
            <select
              value={form.tax_type}
              onChange={(e) => updatePeriod({ tax_type: e.target.value })}
              className={INPUT}
              style={INPUT_TEXT_STYLE}
              disabled={isLockedObligation}
            >
              {TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Year</label>
              <select
                value={form.period_year}
                onChange={(e) => updatePeriod({ period_year: Number(e.target.value) })}
                className={INPUT}
                style={INPUT_TEXT_STYLE}
                disabled={isLockedObligation}
              >
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {periodType === 'month' ? (
              <div>
                <label className={LABEL}>Month</label>
                <select
                  value={form.period_month}
                  onChange={(e) => updatePeriod({ period_month: Number(e.target.value) })}
                  className={INPUT}
                  style={INPUT_TEXT_STYLE}
                  disabled={isLockedObligation}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleDateString('en-PH', { month: 'long' })}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={LABEL}>Quarter</label>
                <select
                  value={form.period_quarter}
                  onChange={(e) => updatePeriod({ period_quarter: Number(e.target.value) })}
                  className={INPUT}
                  style={INPUT_TEXT_STYLE}
                  disabled={isLockedObligation}
                >
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
              <label className={LABEL}>Due Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.due_date}
                min="2017-01-01"
                onChange={(e) => {
                  setFieldErrors((fe) => ({ ...fe, due_date: '' }))
                  setForm((f) => ({ ...f, due_date: e.target.value }))
                }}
                onBlur={(e) => validateDate('due_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${(fieldErrors.due_date || dateErrors.due_date) ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                disabled={isLockedObligation}
              />
              {(fieldErrors.due_date || dateErrors.due_date) && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.due_date || dateErrors.due_date}</p>
              )}
            </div>
          </div>

          {/* Enterprise Tax Automation: Auto-Compute from Transactions */}
          {!isLockedObligation && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calculator size={15} className="text-primary-dark shrink-0" />
                  <span className="text-xs font-semibold text-ink">Auto-Compute from System Transactions</span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoCompute}
                  disabled={calcLoading}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-dark text-white transition-all duration-150 active:scale-95 disabled:opacity-50"
                >
                  {calcLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {calcLoading ? 'Calculating…' : 'Compute Base'}
                </button>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Aggregates confirmed collections, approved expenses, and released disbursements for <strong className="text-ink">{form.tax_period}</strong> to calculate statutory base and tax due.
              </p>

              {calcNotice && (
                <div className="rounded border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                  {calcNotice}
                </div>
              )}

              {calcResult && (
                <div className="rounded-lg border border-border bg-surface p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted">Suggested Taxable Base:</span>
                    <span className="font-semibold text-ink tabular-nums text-sm">
                      {formatCurrency(calcResult.suggested_taxable_amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border pb-1.5">
                    <span className="text-muted">Estimated Tax ({calcResult.suggested_tax_rate}%):</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-sm">
                      {formatCurrency(calcResult.estimated_tax_amount)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted space-y-1 pt-0.5">
                    <div className="flex justify-between">
                      <span>• Gross Collections (Sales):</span>
                      <span className="tabular-nums font-medium text-ink">{formatCurrency(calcResult.breakdown.gross_collections)} ({calcResult.breakdown.collections_count} records)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>• Deductible Outflows (Expenses & Disbursements):</span>
                      <span className="tabular-nums font-medium text-ink">{formatCurrency(calcResult.breakdown.total_deductible_outflow)} ({calcResult.breakdown.outflows_count} records)</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted italic pt-1 border-t border-border/50">
                    {calcResult.breakdown.notes}
                  </p>
                  <div className="pt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={handleApplyComputed}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all duration-150 active:scale-95"
                    >
                      <CheckCircle2 size={13} /> Apply to Form
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Taxable amount + rate are the real ERD inputs — tax_amount
              (shown as "Amount" elsewhere) is always derived from these
              two, both here for preview and again server-side as the
              value of record. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Taxable Amount <span className="text-red-500">*</span></label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.taxable_amount}
                onChange={(e) => {
                  const val = e.target.value
                  setFieldErrors((fe) => ({ ...fe, taxable_amount: '' }))
                  setForm((f) => ({ ...f, taxable_amount: val }))
                  if (val === '') {
                    setAmountError('')
                  } else if (Number(val) < 0) {
                    setAmountError('Taxable amount cannot be negative.')
                  } else if (Number(val) === 0) {
                    setAmountError('Taxable amount must be greater than zero.')
                  } else {
                    setAmountError('')
                  }
                }}
                className={`${INPUT} ${(amountError || fieldErrors.taxable_amount) ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="0.00"
                disabled={isLockedObligation}
              />
              {(amountError || fieldErrors.taxable_amount) && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">{amountError || fieldErrors.taxable_amount}</p>
              )}
            </div>
            <div>
              <label className={LABEL}>Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={form.tax_rate}
                onChange={(e) => {
                  setFieldErrors((fe) => ({ ...fe, tax_rate: '' }))
                  setForm((f) => ({ ...f, tax_rate: e.target.value }))
                }}
                className={`${INPUT} ${fieldErrors.tax_rate ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="12"
                disabled={isLockedObligation}
              />
              {fieldErrors.tax_rate && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.tax_rate}</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-bg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted">Computed tax amount</span>
            <span className="text-sm font-semibold text-ink tabular-nums">{formatCurrency(computedTaxAmount)}</span>
          </div>

          <label className={`flex items-center gap-2 text-sm text-ink ${isLockedObligation ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={form.is_paid}
              onChange={(e) => togglePaid(e.target.checked)}
              className="rounded border-border accent-primary"
              disabled={isLockedObligation}
            />
            Already paid / filed
          </label>
          <p className="-mt-2 text-xs text-muted">Leave unchecked to keep as Pending — it will automatically show as Overdue past the due date, no need to set that manually.</p>

          {form.is_paid && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Payment Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={form.payment_date}
                  min="2017-01-01"
                  onChange={(e) => {
                    setFieldErrors((fe) => ({ ...fe, payment_date: '' }))
                    setForm((f) => ({ ...f, payment_date: e.target.value }))
                  }}
                  onBlur={(e) => validateDate('payment_date', e.target.value)}
                  className={`${INPUT} scheme-light dark:scheme-dark ${(fieldErrors.payment_date || dateErrors.payment_date) ? 'border-red-400 dark:border-red-500' : ''}`}
                  style={INPUT_TEXT_STYLE}
                />
                {(fieldErrors.payment_date || dateErrors.payment_date) && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.payment_date || dateErrors.payment_date}</p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={LABEL}>Reference Number</label>
                  <button
                    type="button"
                    onClick={() => {
                      const suggested = suggestReference(form.tax_type, form.due_date)
                      setRefTouched(true)
                      setForm((f) => ({ ...f, reference_number: suggested }))
                      setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                    }}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Auto-generate
                  </button>
                </div>
                <input
                  type="text"
                  value={form.reference_number}
                  onChange={(e) => {
                    const val = e.target.value
                    setRefTouched(true)
                    setForm((f) => ({ ...f, reference_number: val }))
                    const trimmed = val.trim().toLowerCase()
                    if (trimmed) {
                      const dup = obligations.find((o) => {
                        if (modalMode !== 'add' && o.tax_id === modalMode?.tax_id) return false
                        return (o.reference_number || '').trim().toLowerCase() === trimmed
                      })
                      if (dup) {
                        setFieldErrors((fe) => ({ ...fe, reference_number: `Reference number is already used by ${dup.tax_type} (${dup.tax_period}).` }))
                      } else {
                        setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                      }
                    } else {
                      setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                    }
                  }}
                  className={`${INPUT} ${fieldErrors.reference_number ? 'border-red-400 dark:border-red-500' : ''}`}
                  style={INPUT_TEXT_STYLE}
                  placeholder={suggestReference(form.tax_type, form.due_date)}
                />
                {fieldErrors.reference_number && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    {fieldErrors.reference_number}
                  </p>
                )}
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
            {detailRecord && <Button variant="secondary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print</Button>}
            {detailRecord && detailRecord.status !== 'Paid' && !showArchived && (
              <Button
                variant="primary"
                size="md"
                icon={Receipt}
                onClick={() => {
                  const target = detailRecord
                  closeDetail()
                  setPaymentTarget(target)
                }}
              >
                Record BIR Payment
              </Button>
            )}
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

            <div className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2 flex-wrap">
              {detailRecord.status === 'Paid' ? (
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${detailRecord.has_document ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}>
                  <Paperclip size={12} /> {detailRecord.has_document ? 'Document attached' : 'No document attached'}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setUploadTarget(detailRecord)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium hover:underline ${
                    detailRecord.has_document ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'
                  }`}
                >
                  <Paperclip size={12} /> {detailRecord.has_document ? 'Document attached' : 'Attach document'}
                </button>
              )}
              {detailRecord.has_document && (
                <>
                  <span className="text-border">·</span>
                  <button
                    type="button"
                    onClick={() => handleViewDocument(detailRecord)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <FileText size={12} /> View file
                  </button>
                </>
              )}
              <span className="text-border">·</span>
              <button
                type="button"
                onClick={() => setHistoryTarget(detailRecord)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:underline"
              >
                <History size={12} /> Document history
              </button>
            </div>

            {docNotice && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                {docNotice}
              </div>
            )}

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
                {detailRecord.cash_account_name && (
                  <DetailRow
                    label="Paid From"
                    value={`${detailRecord.cash_account_name} (${detailRecord.cash_account_bank || detailRecord.cash_account_code || ''})`}
                  />
                )}
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

      {/* Attach supporting document modal — triggered from a row action or
          from inside the Detail modal above. */}
      <TaxObligationDocumentUploadModal
        open={!!uploadTarget}
        onClose={() => setUploadTarget(null)}
        obligation={uploadTarget}
        onUpload={async (file) => {
          if (uploadTarget?.status === 'Paid') {
            return { success: false, message: 'Cannot attach documents to a paid tax obligation.' }
          }
          return uploadDocument(uploadTarget.tax_id, file)
        }}
      />

      {/* Document version history modal — same trigger points as above. */}
      <TaxObligationDocumentHistoryModal
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        obligation={historyTarget}
        fetchHistory={fetchDocumentHistory}
        onView={viewDocument}
      />

      {/* Record BIR tax payment modal */}
      <RecordTaxPaymentModal
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        obligation={paymentTarget}
        onPay={recordTaxPayment}
      />

      {/* Batch Record BIR tax payment modal */}
      <BatchRecordTaxPaymentModal
        open={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        obligations={selectedObligations}
        onBatchPay={async (formData) => {
          const res = await batchRecordTaxPayment(formData)
          if (res?.success) {
            setSelectedTaxIds([])
          }
          return res
        }}
      />

      {/* Generate statutory tax filing schedule modal */}
      <GenerateTaxScheduleModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onGenerate={async (payload) => {
          const res = await generateTaxSchedule(payload)
          if (res?.success) {
            setScheduleNotice(res.message)
          }
          return res
        }}
      />

      {/* Consolidated statutory tax compliance report & export modal */}
      <TaxComplianceReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
      />
    </div>
  )
}