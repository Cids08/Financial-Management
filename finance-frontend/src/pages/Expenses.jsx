import { useEffect, useMemo, useRef, useState } from 'react'
import { useProfileContext } from '../context/ProfileContext'
import { Search, Plus, Pencil, Archive, RotateCcw, Receipt, Wallet, Tag, Info, Printer, CheckCircle2, XCircle, ChevronLeft, ChevronRight, CalendarRange, X, Paperclip, FileText, History, AlertTriangle, Upload, ScanLine, Sparkles } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import ExpenseReceiptUploadModal from '../components/ExpenseReceiptUploadModal'
import ExpenseReceiptHistoryModal from '../components/ExpenseReceiptHistoryModal'
import BatchApproveExpensesModal from '../components/BatchApproveExpensesModal'
import { formatCurrency } from '../utils/formatters'
import { apiFetch } from '../utils/api'
import { useExpenses } from '../hooks/useExpenses'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ACCEPTED_DOCUMENT_TYPES = [...ACCEPTED_IMAGE_TYPES, 'application/pdf']
const MAX_DOC_MB = 10

const EMPTY_FORM = {
  budget_id: '',
  expense_category_id: '',
  expense_date: '',
  description: '',
  expense_amount: '',
  cash_account_id: '',
  expense_source: '',
  receipt_number: '',
  receipt_status: 'Pending',
  supplier_id: '',
}

function getBudgetBalanceState(b) {
  if (!b) return { isDepleted: false, isLow: false, label: '' }
  const remaining = Number(b.remaining_amount) || 0
  const allocated = Number(b.allocated_amount) || 0
  const used = Number(b.used_amount) || 0
  const warningPct = Number(b.warning_percentage) || 80

  if (remaining <= 0) {
    return { isDepleted: true, isLow: true, label: 'Depleted' }
  }

  const usedPct = allocated > 0 ? (used / allocated) * 100 : 0
  const isLow = usedPct >= warningPct || (allocated > 0 && remaining <= allocated * 0.2)

  if (isLow) {
    return { isDepleted: false, isLow: true, label: 'Low Balance' }
  }

  return { isDepleted: false, isLow: false, label: 'Available' }
}

function ExpenseScanUpload({ onScanned, onFileSelected, onClear }) {
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const inputRef = useRef(null)

  const processFile = (file) => {
    if (!file) return
    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      setError('Please upload a JPG, PNG, WEBP, or PDF document.')
      return
    }
    if (file.size > MAX_DOC_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_DOC_MB}MB.`)
      return
    }
    setError('')
    if (file.type === 'application/pdf') {
      setPreview('pdf')
      runScan(file)
      return
    }
    setStatus('idle')
    const reader = new FileReader()
    reader.onload = () => {
      setPreview(reader.result)
      runScan(file)
    }
    reader.readAsDataURL(file)
  }

  const runScan = async (file) => {
    setStatus('scanning')
    setError('')
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await apiFetch('/api/invoices/scan', { method: 'POST', body: formData })
      const json = await res.json()

      if (!res.ok || !json.success) {
        setError(json.message || "Couldn't read this document. Please upload a valid invoice or receipt.")
        setStatus('idle')
        setPreview(null)
        if (inputRef.current) inputRef.current.value = ''
        onClear?.()
        return
      }

      onFileSelected?.(file)
      onScanned({
        expense_date: json.data.invoice_date || '',
        expense_amount: json.data.amount || '',
        receipt_number: json.data.invoice_number || json.data.reference_no || '',
      })
      setStatus('done')
    } catch (err) {
      setError('Failed to reach the scan service. Please try again.')
      setStatus('idle')
      setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      onClear?.()
    }
  }

  const clearImage = () => {
    setPreview(null)
    setStatus('idle')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
    onClear?.()
  }

  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <ScanLine size={15} className="text-primary-dark shrink-0" />
        <p className="text-xs font-semibold text-ink">
          Official Receipt / Proof <span className="text-red-500 dark:text-red-400">*</span>
          <span className="font-normal text-muted ml-1">— upload receipt photo or PDF to auto-fill</span>
        </p>
      </div>

      {!preview ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files?.[0]) }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors duration-150
            ${dragOver ? 'border-primary bg-primary/10' : 'border-border bg-bg hover:border-primary/60'}`}
        >
          <Upload size={18} className="text-muted" />
          <p className="text-xs text-ink font-medium">
            Drag &amp; drop, or <span className="text-primary-dark underline">browse</span>
          </p>
          <p className="text-[11px] text-muted">JPG, PNG, WEBP or PDF, up to {MAX_DOC_MB}MB</p>
          <input ref={inputRef} type="file" accept={ACCEPTED_DOCUMENT_TYPES.join(',')} onChange={(e) => processFile(e.target.files?.[0])} className="hidden" />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-bg p-2">
          {preview === 'pdf' ? (
            <div className="h-14 w-14 rounded-md shrink-0 border border-border bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
              <FileText size={24} className="text-red-500 dark:text-red-400" />
            </div>
          ) : (
            <img src={preview} alt="Receipt preview" className="h-14 w-14 rounded-md object-cover shrink-0 border border-border" />
          )}
          <div className="min-w-0 flex-1">
            {status === 'scanning' && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                </span>
                {preview === 'pdf' ? 'Inspecting PDF receipt...' : 'Reading receipt details...'}
              </p>
            )}
            {status === 'done' && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 size={13} /> {preview === 'pdf' ? 'PDF verified & fields filled below — please review' : 'Fields filled below — please review before saving'}
              </p>
            )}
          </div>
          <button type="button" onClick={clearImage} aria-label="Remove file" className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink transition-colors duration-150">
            <X size={14} />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const CATEGORY_STYLES = 'bg-primary/10 text-primary-dark dark:bg-primary/15'
const STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  Approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

// Tax obligations use their own status set — the DB column is only ever
// Pending/Paid, but the API derives 'Overdue' live (see
// TaxObligation::derivedStatus()), so it isn't the same vocabulary as
// an expense's Pending/Approved/Rejected above.
const TAX_STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  Paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  Overdue: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

const CURRENT_MONTH_LABEL = new Date().toLocaleDateString('en-US', { month: 'short' })
const PAGE_SIZE = 10

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
 * Budgets and expense categories don't have their own API routes in
 * api.php yet (only /api/suppliers does) — these are simple GET lookups
 * assuming the same {success, data:[...]} envelope every other module
 * uses. Add Route::prefix('budgets') / Route::prefix('expense-categories')
 * groups (same shape as the expenses block) if they 404.
 */
function useLookup(path) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch(path)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success) setOptions(json.data)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [path])

  return { options, loading }
}

export default function Expenses({ title = 'Expenses', crumbs = ['Financial Transactions', 'Expenses'] }) {
  const {
    expenses, meta, listLoading, listError, filters, setFilter, goToPage, refetch,
    stats, statsLoading,
    mutating, mutateError,
    createExpense, updateExpense, approveExpense, batchApproveExpenses, fetchApprovalProposals, rejectExpense, archiveExpense, restoreExpense,
    uploadReceipt, viewReceipt, fetchReceiptHistory, viewReceiptVersion,
  } = useExpenses()

  // Batch Approval Wizard state
  const [showBatchApproveModal, setShowBatchApproveModal] = useState(false)

  const { profile } = useProfileContext()
  // Archiving/restoring financial records is a destructive action restricted
  // to Admin and Super Admin. Staff/Collector roles must not see these buttons.
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin'

  const { options: budgets } = useLookup('/api/budgets')
  const { options: categories } = useLookup('/api/expense-categories')
  const { options: suppliers } = useLookup('/api/suppliers')
  const { options: cashAccounts } = useLookup('/api/cash-accounts?per_page=100')

  const budgetLabel = (id) => budgets.find((b) => b.budget_id === Number(id))?.budget_name || '—'
  const categoryName = (id) => categories.find((c) => c.id === Number(id))?.category_name || '—'
  const supplierName = (id) => suppliers.find((s) => s.id === Number(id))?.supplier_name || 'N/A'
  const cashAccountLabel = (id) => {
    const a = cashAccounts.find((c) => c.id === Number(id))
    return a ? `${a.account_name} (${a.bank_name || a.account_code})` : '—'
  }

  const [search, setSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setFilter({ search }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Expense-date range filter — sent to the backend the same way as
  // search/status/category (see useExpenses.buildQuery), so it applies
  // across every page, not just what's currently loaded.
  const hasDateFilter = Boolean(filters.expense_date_from || filters.expense_date_to)
  const clearDateFilter = () => setFilter({ expense_date_from: '', expense_date_to: '' })

  // Pagination is server-side — `expenses` is already just the current
  // page's rows, and `meta` carries the real totals from the backend's
  // Laravel paginator. Do not re-slice `expenses` here.
  const rangeStart = meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1
  const rangeEnd = Math.min(meta.current_page * meta.per_page, meta.total)

  const [modalMode, setModalMode] = useState(null) // 'add' | expense object | null
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [dateErrors, setDateErrors] = useState({ expense_date: '' })
  const [detailRecord, setDetailRecord] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectRemarks, setRejectRemarks] = useState('')
  const [rejectError, setRejectError] = useState('')
  const [receiptUploadTarget, setReceiptUploadTarget] = useState(null) // expense currently attaching a receipt
  const [receiptHistoryTarget, setReceiptHistoryTarget] = useState(null) // expense whose receipt history is open
  const [receiptNotice, setReceiptNotice] = useState('') // survives modal close, e.g. "downloaded instead of previewed"
  const [receiptFile, setReceiptFile] = useState(null)

  const validateDate = (field, value) => {
    if (!value) {
      setDateErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    const d = new Date(value)
    const min = new Date('2017-01-01')
    const max = new Date(`${new Date().getFullYear() + 1}-12-31`)
    if (isNaN(d.getTime())) {
      setDateErrors((e) => ({ ...e, [field]: 'Invalid date.' }))
    } else if (d < min || d > max) {
      setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
    } else {
      setDateErrors((e) => ({ ...e, [field]: '' }))
    }
  }

  const handleScanned = (extracted) => {
    setForm((f) => ({
      ...f,
      expense_date: f.expense_date || extracted.expense_date,
      expense_amount: f.expense_amount || extracted.expense_amount,
      receipt_number: f.receipt_number || extracted.receipt_number,
      receipt_status: 'Uploaded',
    }))
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setFieldErrors({}); setDateErrors({ expense_date: '' }); setReceiptFile(null); setModalMode('add') }
  const openEdit = (x) => {
    setForm({
      budget_id: x.budget_id,
      expense_category_id: x.expense_category_id,
      expense_date: x.expense_date,
      description: x.description,
      expense_amount: x.expense_amount,
      cash_account_id: x.cash_account_id || '',
      expense_source: x.expense_source || '',
      receipt_number: x.receipt_number || '',
      receipt_status: x.has_receipt ? 'Uploaded' : (x.receipt_status || 'Pending'),
      supplier_id: x.supplier_id || '',
    })
    setFormError('')
    setFieldErrors({})
    setDateErrors({ expense_date: '' })
    setReceiptFile(null)
    setModalMode(x)
  }
  const closeModal = () => { setModalMode(null); setFormError(''); setFieldErrors({}); setDateErrors({ expense_date: '' }); setReceiptFile(null) }
  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  // Options for the Add/Edit form specifically: active categories only, so
  // a retired category can't be picked for a new (or newly re-pointed)
  // expense — but if we're editing an expense that's already assigned an
  // inactive category, that one stays in the list too, so opening the
  // form doesn't force swapping away from it just to save an unrelated
  // field. The filter-row "All Categories" dropdown above intentionally
  // keeps using the full `categories` list — filtering historical
  // expenses by a since-retired category should still work.
  const categoryOptionsForForm = useMemo(() => {
    const active = categories.filter((c) => c.is_active)
    const currentId = isEditing ? Number(modalMode.expense_category_id) : null
    if (currentId && !active.some((c) => c.id === currentId)) {
      const current = categories.find((c) => c.id === currentId)
      if (current) return [...active, current]
    }
    return active
  }, [categories, isEditing, modalMode])

  // Budgets for the Add/Edit form specifically: in Add mode, only Active
  // budgets are allowed (expenses cannot be charged against Draft or Closed
  // budgets, mirroring Disbursements' active budget verification).
  const budgetOptionsForForm = useMemo(() => {
    const currentId = isEditing ? Number(modalMode.budget_id) : null
    return budgets.filter((b) => b.status === 'Active' || Number(b.budget_id) === currentId)
  }, [budgets, isEditing, modalMode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!form.budget_id) errors.budget_id = 'Please select a budget.'
    if (!form.expense_category_id) errors.expense_category_id = 'Please select a category.'
    if (!form.description.trim()) errors.description = 'Description is required.'
    if (!form.expense_date) {
      errors.expense_date = 'Expense date is required.'
    } else if (form.expense_date < '2017-01-01') {
      errors.expense_date = 'Date is out of range.'
    }
    if (!form.cash_account_id) errors.cash_account_id = 'Please select a cash account.'

    const amt = Number(form.expense_amount)
    if (!form.expense_amount) {
      errors.expense_amount = 'Amount is required.'
    } else if (amt <= 0) {
      errors.expense_amount = 'Amount must be greater than zero.'
    } else if (form.cash_account_id) {
      const selectedAcc = cashAccounts.find((a) => a.id === Number(form.cash_account_id))
      if (selectedAcc && amt > Number(selectedAcc.current_balance)) {
        errors.expense_amount = 'Amount exceeds available funds in the selected cash account.'
      }
    }

    if (form.budget_id) {
      const selectedBudget = budgets.find((b) => Number(b.budget_id) === Number(form.budget_id))
      if (selectedBudget) {
        if (Number(selectedBudget.remaining_amount) <= 0) {
          errors.budget_id = 'Cannot select this budget: Budget funds are exhausted.'
        } else if (amt > 0 && amt > Number(selectedBudget.remaining_amount)) {
          errors.expense_amount = 'Amount exceeds the available balance for the selected budget.'
        }
      }
    }

    if (!isEditing && !receiptFile) {
      errors.receipt = 'A receipt document (official receipt scan or PDF) is strictly required.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setFormError('')

    const payload = {
      ...form,
      budget_id: Number(form.budget_id),
      expense_category_id: Number(form.expense_category_id),
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      cash_account_id: form.cash_account_id ? Number(form.cash_account_id) : null,
      expense_amount: Number(form.expense_amount) || 0,
      receipt_status: !isEditing && receiptFile ? 'Uploaded' : form.receipt_status,
    }

    let result
    if (isEditing) {
      result = await updateExpense(modalMode.id, payload)
    } else {
      const fd = new FormData()
      Object.entries(payload).forEach(([k, v]) => { if (v != null) fd.append(k, v) })
      fd.append('receipt', receiptFile)
      result = await createExpense(fd)
    }

    if (result.success) {
      closeModal()
    } else {
      setFormError(result.message)
    }
  }

  const handleApprove = async (x) => { await approveExpense(x.id) }
  const openReject = (x) => { setRejectTarget(x); setRejectRemarks(''); setRejectError('') }
  const confirmReject = async () => {
    if (!rejectRemarks.trim()) {
      setRejectError('A reason for rejection is required.')
      return
    }
    const result = await rejectExpense(rejectTarget.id, rejectRemarks.trim())
    if (result.success) {
      setRejectTarget(null)
      setRejectError('')
    } else {
      setRejectError(result.message || 'Could not reject the expense.')
    }
  }
  const handleArchive = async (x) => { await archiveExpense(x.id) }

  // Opens the current receipt in a new tab (inline) instead of forcing a
  // download — mirrors Budgets.jsx's handleViewPlan() exactly, including
  // the popup-blocker-safe synchronous window.open().
  const handleViewReceipt = async (x) => {
    const targetWindow = window.open('', '_blank')
    const result = await viewReceipt(x.id, targetWindow)
    if (!result.success) {
      setReceiptNotice(`Couldn't open the receipt: ${result.message}`)
    } else if (!result.viewedInline) {
      setReceiptNotice("This file type can't be previewed in-browser, so it's been downloaded instead.")
    } else {
      setReceiptNotice('')
    }
  }
  const handleRestore = async (x) => { await restoreExpense(x.id) }

  // The detail view (including linked tax obligations) is only returned
  // by GET /api/expenses/{id} — the list response intentionally omits it
  // to avoid N+1-loading tax obligations for every row on the page.
  const openDetail = async (x) => {
    setDetailRecord(x)
    setDetailLoading(true)
    try {
      const res = await apiFetch(`/api/expenses/${x.id}`)
      const json = await res.json()
      if (json.success) setDetailRecord(json.data)
    } catch {
      // Keep showing the row's already-known fields if the detail fetch fails.
    } finally {
      setDetailLoading(false)
    }
  }

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]))

  const handlePrint = (x) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Budget', budgetLabel(x.budget_id)],
      ['Expense Date', formatDate(x.expense_date)],
      ['Category', categoryName(x.expense_category_id)],
      ['Amount', formatCurrency(x.expense_amount)],
      ['Receipt No.', x.receipt_number || '—'],
      ['Supplier', supplierName(x.supplier_id)],
      ['Cash Account', x.cash_account_name ? `${x.cash_account_name} (${x.cash_account_bank || x.cash_account_code})` : (x.expense_source || '—')],
      ['Status', x.status],
      ['Description', x.description || '—'],
    ]
    win.document.write(`
      <html>
        <head>
          <title>${escapeHtml(x.receipt_number || 'Expense')}</title>
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
            <div><h1>Expense Slip</h1><p>${escapeHtml(x.description)}</p></div>
            <span class="status">${escapeHtml(categoryName(x.expense_category_id))}</span>
          </div>
          <table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
          <div class="footer">Printed on ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
        </body>
      </html>
    `)
    win.document.close()
    win.focus()
    win.print()
  }

  const statCards = [
    { key: 'total', label: 'Total Expenses', value: statsLoading ? '—' : stats.total, icon: Receipt, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: !filters.status && !filters.trashed, onClick: () => setFilter({ status: '', trashed: false }) },
    { key: 'totalAmount', label: 'Total Amount', value: statsLoading ? '—' : formatCurrency(stats.total_amount), icon: Wallet, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => setFilter({ status: '', trashed: false }) },
    { key: 'thisMonth', label: `This Month (${CURRENT_MONTH_LABEL})`, value: statsLoading ? '—' : formatCurrency(stats.this_month_amount), icon: Tag, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => setFilter({ status: '', trashed: false }) },
    // Only admins can archive/restore — hide this card for non-admin roles
    ...(isAdmin ? [{ key: 'archived', label: 'Archived', value: statsLoading ? '—' : stats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: filters.trashed, onClick: () => setFilter({ trashed: true }) }] : []),
  ]

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Log expenses charged against department budgets.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={Sparkles}
            onClick={() => setShowBatchApproveModal(true)}
          >
            Approval Wizard
          </Button>
          <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Expense</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              className={`${PANEL} ${PANEL_PAD} flex items-center gap-2.5 text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={15} className={card.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">{card.label}</p>
                <p className="text-lg font-bold text-ink">{card.value}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1 min-w-0 basis-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by description, receipt no., or source..." className={`${INPUT} pl-9`} style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0 }} autoComplete="off" />
        </div>
        <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className={INPUT} style={INPUT_TEXT_STYLE}>
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select value={filters.expense_category_id} onChange={(e) => setFilter({ expense_category_id: e.target.value })} className={INPUT} style={INPUT_TEXT_STYLE}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.category_name}</option>)}
        </select>
        <div className="flex items-center gap-1.5 shrink-0">
          <CalendarRange size={15} className="text-muted shrink-0" />
          <input
            type="date"
            value={filters.expense_date_from}
            onChange={(e) => setFilter({ expense_date_from: e.target.value })}
            max={filters.expense_date_to || undefined}
            aria-label="Expense date from"
            className={`${INPUT} scheme-light dark:scheme-dark`}
            style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={filters.expense_date_to}
            onChange={(e) => setFilter({ expense_date_to: e.target.value })}
            min={filters.expense_date_from || undefined}
            aria-label="Expense date to"
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
      </div>

      {listError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{listError}</div>
      )}
      {mutateError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{mutateError}</div>
      )}
      {receiptNotice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          <span className="flex items-center gap-2"><AlertTriangle size={13} className="shrink-0" /> {receiptNotice}</span>
          <button type="button" onClick={() => setReceiptNotice('')} className="shrink-0 font-medium underline">Dismiss</button>
        </div>
      )}

      <div className={PANEL}>
        <div className="overflow-hidden rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-3.5 py-3">Expense</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3">Budget</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3">Category</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3 whitespace-nowrap">Date</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3 whitespace-nowrap">Amount</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3">Status</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wider px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">Loading expenses…</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                  {hasDateFilter ? 'No expenses fall within the selected date range.' : 'No expenses match your filters.'}
                </td></tr>
              ) : expenses.map((x) => (
                <tr
                  key={x.id}
                  className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150"
                >
                  <td className="px-3.5 py-3 min-w-0">
                    <p className="font-medium text-ink truncate max-w-50 xl:max-w-xs">{x.description}</p>
                    <p className="text-xs text-muted truncate max-w-47.5 xl:max-w-xs">{x.receipt_number || x.cash_account_name || x.expense_source} {x.supplier_id ? `\u00b7 ${x.supplier_name || supplierName(x.supplier_id)}` : ''}</p>
                  </td>
                  <td className="px-2.5 py-3 text-ink text-xs">
                    <span className="truncate block max-w-32.5" title={x.budget_name || budgetLabel(x.budget_id)}>
                      {x.budget_name || budgetLabel(x.budget_id)}
                    </span>
                  </td>
                  <td className="px-2.5 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_STYLES}`}>{x.expense_category_name || categoryName(x.expense_category_id)}</span>
                  </td>
                  <td className="px-2.5 py-3 whitespace-nowrap text-ink text-xs">{formatDate(x.expense_date)}</td>
                  <td className="px-2.5 py-3 whitespace-nowrap font-medium tabular-nums text-ink text-xs sm:text-sm">
                    {formatCurrency(x.expense_amount)}
                    {x.is_over_budget && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">Over</span>
                    )}
                  </td>
                  <td className="px-2.5 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[x.status] || ''}`}>{x.status}</span>
                  </td>
                  <td className="px-3.5 py-3 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {x.status === 'Pending' && !filters.trashed && x.has_receipt && (() => {
                        const hasBudget = Boolean(x.budget_id && (x.budget_name || budgets.some((b) => Number(b.budget_id) === Number(x.budget_id))))
                        const isCostExceeded = x.budget_remaining_amount !== null && x.budget_remaining_amount !== undefined
                          ? Number(x.expense_amount) > Number(x.budget_remaining_amount)
                          : Boolean(x.is_over_budget)
                        return (
                          <>
                            {!hasBudget ? (
                              <Tooltip label="Cannot approve: Linked budget is missing or does not exist." align="start">
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75 shrink-0"
                                >
                                  Approve
                                </button>
                              </Tooltip>
                            ) : isCostExceeded ? (
                              <Tooltip label="Cannot approve: Expense amount exceeds available budget balance." align="start">
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75 shrink-0"
                                >
                                  Approve
                                </button>
                              </Tooltip>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleApprove(x)}
                                disabled={mutating}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                              >
                                Approve
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openReject(x)}
                              disabled={mutating}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                              Reject
                            </button>
                          </>
                        )
                      })()}
                      <Tooltip label="View full record" align="start">
                        <button type="button" onClick={() => openDetail(x)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={14} />
                        </button>
                      </Tooltip>
                      {x.has_receipt ? (
                        <>
                          <Tooltip label="View current receipt" align="start">
                            <button type="button" onClick={() => handleViewReceipt(x)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <FileText size={14} />
                            </button>
                          </Tooltip>
                          <Tooltip label="View receipt history" align="start">
                            <button type="button" onClick={() => setReceiptHistoryTarget(x)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <History size={14} />
                            </button>
                          </Tooltip>
                        </>
                      ) : (
                        !filters.trashed && (
                          <Tooltip label="Attach receipt" align="start">
                            <button type="button" onClick={() => setReceiptUploadTarget(x)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <Paperclip size={14} />
                            </button>
                          </Tooltip>
                        )
                      )}
                      <Tooltip label="Print expense slip" align="start">
                        <button type="button" onClick={() => handlePrint(x)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Printer size={14} />
                        </button>
                      </Tooltip>
                      {x.status === 'Pending' && !filters.trashed && (
                        <Tooltip label="Edit expense" align="start">
                          <button type="button" onClick={() => openEdit(x)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={14} />
                          </button>
                        </Tooltip>
                      )}
                      {isAdmin && (filters.trashed || x.status !== 'Pending') && (
                        <Tooltip label={filters.trashed ? 'Restore expense' : 'Archive expense'} align="end">
                          <button type="button" onClick={() => (filters.trashed ? handleRestore(x) : handleArchive(x))} disabled={mutating} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50">
                            {filters.trashed ? <RotateCcw size={14} /> : <Archive size={14} />}
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!listLoading && expenses.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              Showing {rangeStart}–{rangeEnd} of {meta.total} expenses
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(meta.current_page - 1)}
                disabled={meta.current_page <= 1}
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
                onClick={() => goToPage(meta.current_page + 1)}
                disabled={meta.current_page >= meta.last_page}
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
        title={isEditing ? 'Edit Expense' : 'Add Expense'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" loading={mutating} onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Expense'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}

          {!isEditing && (
            <>
              <ExpenseScanUpload
                onScanned={handleScanned}
                onFileSelected={(f) => {
                  setReceiptFile(f)
                  setForm((prev) => ({ ...prev, receipt_status: 'Uploaded' }))
                  setFieldErrors((fe) => ({ ...fe, receipt: '' }))
                }}
                onClear={() => {
                  setReceiptFile(null)
                  setForm((prev) => ({ ...prev, receipt_status: 'Pending' }))
                }}
              />
              {fieldErrors.receipt && (
                <p className="text-xs text-red-500 dark:text-red-400 -mt-2">{fieldErrors.receipt}</p>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Budget <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={form.budget_id}
                onChange={(e) => {
                  const selectedB = budgets.find((b) => Number(b.budget_id) === Number(e.target.value))
                  setForm((f) => ({ ...f, budget_id: e.target.value }))
                  setFieldErrors((fe) => {
                    const next = { ...fe, budget_id: '' }
                    if (selectedB && Number(selectedB.remaining_amount) <= 0) {
                      next.budget_id = 'Cannot select this budget: Budget funds are exhausted.'
                    } else if (selectedB && Number(form.expense_amount) > Number(selectedB.remaining_amount)) {
                      next.expense_amount = 'Amount exceeds the available balance for the selected budget.'
                    } else if (next.expense_amount?.includes('exceeds the available balance')) {
                      next.expense_amount = ''
                    }
                    return next
                  })
                }}
                className={`${INPUT} ${fieldErrors.budget_id ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
              >
                <option value="">Select budget</option>
                {budgetOptionsForForm.map((b) => {
                  const state = getBudgetBalanceState(b)
                  return (
                    <option
                      key={b.budget_id}
                      value={b.budget_id}
                      disabled={state.isDepleted && Number(form.budget_id) !== Number(b.budget_id)}
                      className={state.isDepleted ? 'text-muted' : ''}
                    >
                      {b.budget_name} ({b.budget_code}){state.isDepleted ? ' — Depleted (Unavailable)' : state.isLow ? ' — Low Balance' : ''}
                    </option>
                  )
                })}
              </select>
              {fieldErrors.budget_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.budget_id}</p>}
            </div>
            <div>
              <label className={LABEL}>Category <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={form.expense_category_id}
                onChange={(e) => { setForm((f) => ({ ...f, expense_category_id: e.target.value })); setFieldErrors((fe) => ({ ...fe, expense_category_id: '' })) }}
                className={`${INPUT} ${fieldErrors.expense_category_id ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
              >
                <option value="">Select category</option>
                {categoryOptionsForForm.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.category_name}{!c.is_active ? ' (Inactive)' : ''}
                  </option>
                ))}
              </select>
              {fieldErrors.expense_category_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.expense_category_id}</p>}
            </div>
          </div>

          {(() => {
            const b = budgets.find((item) => Number(item.budget_id) === Number(form.budget_id))
            if (!b) return null
            const state = getBudgetBalanceState(b)
            const isExceeded = Number(form.expense_amount) > Number(b.remaining_amount)
            return (
              <div className="rounded-lg border border-border bg-bg/50 px-3 py-2 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-muted">Linked Budget:</span>
                  <span className="font-semibold text-ink">{b.budget_name} ({b.budget_code})</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Budget Status:</span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${b.status === 'Active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                    {b.status}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted">Budget Balance Status:</span>
                  {state.isDepleted ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                      Depleted (No funds available)
                    </span>
                  ) : state.isLow ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                      Low Balance Warning
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                      Sufficient Balance
                    </span>
                  )}
                </div>

                {state.isDepleted && (
                  <div className="flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-400 font-medium pt-0.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>Cannot select this budget: Budget funds are exhausted. Please select an active budget with available funds.</span>
                  </div>
                )}

                {!state.isDepleted && state.isLow && !isExceeded && (
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-medium pt-0.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>Warning: This budget has low remaining balance. Please review this expense carefully.</span>
                  </div>
                )}

                {isExceeded && Number(form.expense_amount) > 0 && (
                  <div className="flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-400 font-medium pt-0.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>Warning: Expense amount exceeds the budget's available balance. Expenses exceeding available funds cannot be approved.</span>
                  </div>
                )}
              </div>
            )
          })()}
          <div>
            <label className={LABEL}>Description <span className="text-red-500 dark:text-red-400">*</span></label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => { setForm((f) => ({ ...f, description: e.target.value })); setFieldErrors((fe) => ({ ...fe, description: '' })) }}
              className={`${INPUT} ${fieldErrors.description ? 'border-red-400 dark:border-red-500' : ''}`}
              style={INPUT_TEXT_STYLE}
              placeholder="What this expense was for"
            />
            {fieldErrors.description && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.description}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Expense Date <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="date"
                min="2017-01-01"
                max={`${new Date().getFullYear() + 1}-12-31`}
                value={form.expense_date}
                onChange={(e) => { setForm((f) => ({ ...f, expense_date: e.target.value })); setFieldErrors((fe) => ({ ...fe, expense_date: '' })) }}
                onBlur={(e) => validateDate('expense_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${dateErrors.expense_date || fieldErrors.expense_date ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
              />
              {(dateErrors.expense_date || fieldErrors.expense_date) && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{dateErrors.expense_date || fieldErrors.expense_date}</p>}
            </div>
            <div>
              <label className={LABEL}>Amount <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.expense_amount}
                onChange={(e) => {
                  const val = e.target.value
                  setForm((f) => ({ ...f, expense_amount: val }))
                  setFieldErrors((fe) => ({ ...fe, expense_amount: '' }))
                  if (val === '') {
                    setFieldErrors((fe) => ({ ...fe, expense_amount: '' }))
                  } else if (Number(val) < 0) {
                    setFieldErrors((fe) => ({ ...fe, expense_amount: 'Amount cannot be negative.' }))
                  } else if (Number(val) === 0) {
                    setFieldErrors((fe) => ({ ...fe, expense_amount: 'Amount must be greater than zero.' }))
                  } else if (form.budget_id && (() => {
                    const b = budgets.find((item) => Number(item.budget_id) === Number(form.budget_id))
                    return b && Number(val) > Number(b.remaining_amount)
                  })()) {
                    setFieldErrors((fe) => ({ ...fe, expense_amount: 'Amount exceeds available balance for the selected budget.' }))
                  } else if (form.cash_account_id) {
                    const acc = cashAccounts.find((a) => String(a.id) === String(form.cash_account_id))
                    if (acc && Number(val) > Number(acc.current_balance)) {
                      setFieldErrors((fe) => ({ ...fe, expense_amount: 'Amount exceeds available funds in the selected cash account.' }))
                    }
                  }
                }}
                className={`${INPUT} ${fieldErrors.expense_amount ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
                placeholder="0.00"
              />
              {fieldErrors.expense_amount && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.expense_amount}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Cash Account <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={form.cash_account_id}
                onChange={(e) => {
                  const selectedAcc = cashAccounts.find((a) => String(a.id) === e.target.value)
                  setForm((f) => ({
                    ...f,
                    cash_account_id: e.target.value,
                    expense_source: selectedAcc ? selectedAcc.account_name : f.expense_source,
                  }))
                  setFieldErrors((fe) => ({ ...fe, cash_account_id: '' }))
                  if (selectedAcc && Number(form.expense_amount) > Number(selectedAcc.current_balance)) {
                    setFieldErrors((fe) => ({ ...fe, expense_amount: 'Amount exceeds available funds in the selected cash account.' }))
                  } else if (fieldErrors.expense_amount?.includes('exceeds available funds')) {
                    setFieldErrors((fe) => ({ ...fe, expense_amount: '' }))
                  }
                }}
                className={`${INPUT} ${fieldErrors.cash_account_id ? 'border-red-400 dark:border-red-500' : ''}`}
                style={INPUT_TEXT_STYLE}
              >
                <option value="">Select cash account...</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name} {a.bank_name ? `(${a.bank_name})` : ''}
                  </option>
                ))}
              </select>
              {fieldErrors.cash_account_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.cash_account_id}</p>}
            </div>
            <div>
              <label className={LABEL}>Receipt Number</label>
              <input type="text" value={form.receipt_number} onChange={(e) => setForm((f) => ({ ...f, receipt_number: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="RCPT-4401" />
            </div>
          </div>
          {(() => {
            const selectedAcc = cashAccounts.find((a) => String(a.id) === String(form.cash_account_id))
            const enteredAmt = Number(form.expense_amount)
            if (selectedAcc) {
              if (Number(selectedAcc.current_balance) <= 0) {
                return (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                    <div>
                      <span className="font-semibold">Account Has Zero Balance:</span> <strong>{selectedAcc.account_name}</strong> currently has no available funds for transactions. Please select another account.
                    </div>
                  </div>
                )
              }
              if (enteredAmt > 0 && enteredAmt > Number(selectedAcc.current_balance)) {
                return (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                    <div>
                      <span className="font-semibold">Insufficient Account Funds:</span> The entered amount exceeds the available funds in <strong>{selectedAcc.account_name}</strong>. Please select another payment account or adjust the amount.
                    </div>
                  </div>
                )
              }
            }
            return null
          })()}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Receipt Status (Auto-managed)</label>
              <div className="flex items-center h-9 px-3 rounded-lg border border-border bg-bg/50 text-xs font-medium cursor-not-allowed select-none">
                {receiptFile || form.receipt_status === 'Uploaded' || (isEditing && modalMode.has_receipt) ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <CheckCircle2 size={14} />
                    Uploaded (Proof Attached)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <Paperclip size={14} />
                    Pending (Attach proof above)
                  </span>
                )}
              </div>
            </div>
            <div>
              <label className={LABEL}>Supplier (optional)</label>
              <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE}>
                <option value="">N/A</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
              </select>
            </div>
          </div>

          {isEditing && (
            <p className="text-xs text-muted">
              To attach or update receipts, use the <Paperclip size={12} className="inline" /> icon on the expense row.
            </p>
          )}

          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <p className="text-xs font-medium text-muted mb-1">Record Info (read-only)</p>
              <DetailRow label="Created by" value={modalMode.created_by_name} />
              <DetailRow label="Created at" value={formatDateTime(modalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(modalMode.updated_at)} />
              <DetailRow label="Status" value={modalMode.status} />
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        title={detailRecord ? `Expense Details — #${detailRecord.id}` : 'Expense Details'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setDetailRecord(null)}>Close</Button>
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Slip</Button>}
            {detailRecord && detailRecord.status === 'Pending' && detailRecord.has_receipt && (() => {
              const hasBudget = Boolean(detailRecord.budget_id && (detailRecord.budget_name || budgets.some((b) => Number(b.budget_id) === Number(detailRecord.budget_id))))
              const isCostExceeded = detailRecord.budget_remaining_amount !== null && detailRecord.budget_remaining_amount !== undefined
                ? Number(detailRecord.expense_amount) > Number(detailRecord.budget_remaining_amount)
                : Boolean(detailRecord.is_over_budget)
              return (
                <>
                  <button
                    type="button"
                    onClick={() => { const target = detailRecord; setDetailRecord(null); openReject(target) }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95"
                  >
                    Reject
                  </button>
                  {!hasBudget ? (
                    <Tooltip label="Cannot approve: Linked budget is missing or does not exist.">
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75"
                      >
                        Approve
                      </button>
                    </Tooltip>
                  ) : isCostExceeded ? (
                    <Tooltip label="Cannot approve: Expense amount exceeds available budget balance.">
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75"
                      >
                        Approve
                      </button>
                    </Tooltip>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => { await handleApprove(detailRecord); setDetailRecord(null) }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all duration-150 active:scale-95"
                    >
                      Approve
                    </button>
                  )}
                </>
              )
            })()}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            {/* Warning banner when budget is missing/nonexistent */}
            {detailRecord.status === 'Pending' && (!detailRecord.budget_id || (!detailRecord.budget_name && !budgets.some((b) => Number(b.budget_id) === Number(detailRecord.budget_id)))) && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-700 dark:text-red-400">Missing Budget — Cannot Be Approved</p>
                  <p className="mt-0.5">
                    This expense is not linked to a valid budget in the system. An active budget must be assigned before it can be approved.
                  </p>
                </div>
              </div>
            )}
            {/* Warning banner when budget is exceeded */}
            {detailRecord.status === 'Pending' && detailRecord.budget_remaining_amount !== null && Number(detailRecord.expense_amount) > Number(detailRecord.budget_remaining_amount) && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-700 dark:text-red-400">Budget Limit Exceeded — Cannot Be Approved</p>
                  <p className="mt-0.5">
                    This expense of <strong>{formatCurrency(detailRecord.expense_amount)}</strong> exceeds the available budget balance.
                  </p>
                  <p className="mt-1 text-red-600 dark:text-red-400 font-medium">
                    Approval is blocked to protect against budget overruns.
                  </p>
                </div>
              </div>
            )}
            {/* Warning banner when proof is missing */}
            {detailRecord.status === 'Pending' && !detailRecord.has_receipt && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">Proof Required for Approval</p>
                  <p className="mt-0.5 text-amber-700 dark:text-amber-400/90">
                    A receipt or proof document must be attached before this expense can be approved or rejected.
                  </p>
                </div>
              </div>
            )}
            {/* Status notification banner */}
            {detailRecord.status === 'Rejected' && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                <XCircle size={16} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-700 dark:text-red-400">Expense Rejected</p>
                  <p className="mt-0.5">
                    This expense was rejected by <strong>{detailRecord.rejected_by_name || 'an administrator'}</strong>
                    {detailRecord.rejected_at ? ` on ${formatDateTime(detailRecord.rejected_at)}` : ''}.
                  </p>
                  <p className="mt-1 font-medium text-red-900 dark:text-red-200">
                    Reason: <span className="italic">{detailRecord.rejection_remarks ? `“${detailRecord.rejection_remarks}”` : 'No remarks provided.'}</span>
                  </p>
                </div>
              </div>
            )}

            {detailRecord.status === 'Approved' && (
              <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Expense Approved</p>
                  <p className="mt-0.5">
                    Approved by <strong>{detailRecord.approved_by_name || 'an administrator'}</strong>
                    {detailRecord.approved_at ? ` on ${formatDateTime(detailRecord.approved_at)}` : ''}.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.description}</p>
                <p className="text-xs text-muted">{detailRecord.budget_name || budgetLabel(detailRecord.budget_id)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_STYLES}`}>{detailRecord.expense_category_name || categoryName(detailRecord.expense_category_id)}</span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status] || ''}`}>{detailRecord.status}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Record ID" value={`#${detailRecord.id}`} />
                <DetailRow label="Expense Date" value={formatDate(detailRecord.expense_date)} />
                <DetailRow label="Amount" value={formatCurrency(detailRecord.expense_amount)} />
                <DetailRow label="Over Budget" value={detailRecord.is_over_budget ? 'Yes' : 'No'} />
                <DetailRow label="Cash Account" value={detailRecord.cash_account_name ? `${detailRecord.cash_account_name} (${detailRecord.cash_account_bank || detailRecord.cash_account_code})` : (detailRecord.expense_source || '—')} />
                <DetailRow label="Receipt No." value={detailRecord.receipt_number} />
                <DetailRow label="Receipt Status" value={detailRecord.receipt_status} />
                <DetailRow
                  label="Receipt File"
                  value={
                    detailRecord.has_receipt ? (
                      <span className="inline-flex items-center gap-3">
                        <button type="button" onClick={() => handleViewReceipt(detailRecord)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                          <FileText size={12} /> View file
                        </button>
                        <button type="button" onClick={() => setReceiptHistoryTarget(detailRecord)} className="inline-flex items-center gap-1 font-medium text-muted hover:underline">
                          <History size={12} /> History
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setReceiptUploadTarget(detailRecord)} className="inline-flex items-center gap-1 font-medium text-amber-600 hover:underline dark:text-amber-400">
                        <Paperclip size={12} /> Not attached — attach one
                      </button>
                    )
                  }
                />
                <DetailRow label="Supplier" value={detailRecord.supplier_name || supplierName(detailRecord.supplier_id)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={detailRecord.created_by_name} />
                <DetailRow label="Created at" value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(detailRecord.updated_at)} />
                {detailRecord.status === 'Approved' && (
                  <>
                    <DetailRow label="Approved by" value={detailRecord.approved_by_name || '—'} />
                    <DetailRow label="Approved at" value={formatDateTime(detailRecord.approved_at)} />
                  </>
                )}
                {detailRecord.status === 'Rejected' && (
                  <>
                    <DetailRow label="Rejected by" value={detailRecord.rejected_by_name || '—'} />
                    <DetailRow label="Rejected at" value={formatDateTime(detailRecord.rejected_at)} />
                    <DetailRow label="Rejection reason" value={detailRecord.rejection_remarks || 'No remarks provided'} />
                  </>
                )}
                {detailRecord.deleted_at && (
                  <>
                    <DetailRow label="Archived by" value={detailRecord.deleted_by_name} />
                    <DetailRow label="Archived at" value={formatDateTime(detailRecord.deleted_at)} />
                  </>
                )}
              </div>
            </div>

            {/* Tax obligations traced back to this expense — expense_id on
                tax_obligations is optional, so most expenses will show
                nothing here; this only renders once the detail fetch
                (GET /api/expenses/{id}) returns linked records. */}
            {detailLoading ? (
              <p className="text-xs text-muted text-center py-2">Loading linked records…</p>
            ) : detailRecord.tax_obligations?.length > 0 && (
              <div className="rounded-lg border border-border divide-y divide-border">
                <p className="px-3 py-2 text-xs font-medium text-muted">Linked Tax Obligations</p>
                {detailRecord.tax_obligations.map((tax) => (
                  <div key={tax.tax_id} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-ink">{tax.tax_type} &middot; {tax.tax_period}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TAX_STATUS_STYLES[tax.status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {tax.status}
                      </span>
                    </div>
                    <DetailRow label="Tax Amount" value={formatCurrency(tax.amount)} />
                    <DetailRow label="Due Date" value={formatDate(tax.due_date)} />
                    {tax.reference_number && <DetailRow label="Reference No." value={tax.reference_number} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => { setRejectTarget(null); setRejectError('') }}
        title={rejectTarget ? `Reject Expense #${rejectTarget.id}` : 'Reject Expense'}
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => { setRejectTarget(null); setRejectError('') }}>Cancel</Button>
            <Button variant="danger" size="md" loading={mutating} disabled={!rejectRemarks.trim()} onClick={confirmReject}>Reject Expense</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Rejecting will finalize this expense as <strong>Rejected</strong>. The user who created this expense will be immediately notified along with your reason below.
          </p>

          {rejectError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {rejectError}
            </div>
          )}

          <div>
            <label className={LABEL}>
              Reason for Rejection <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={rejectRemarks}
              onChange={(e) => { setRejectRemarks(e.target.value); setRejectError('') }}
              className={`w-full px-3 py-2 rounded-lg border bg-bg text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/40 ${rejectError ? 'border-red-400 dark:border-red-500' : 'border-border'}`}
              style={INPUT_TEXT_STYLE}
              placeholder="Explain why this expense is being rejected (e.g. invalid receipt, policy limit exceeded, duplicate claim)..."
              autoFocus
            />
          </div>
        </div>
      </Modal>

      <ExpenseReceiptUploadModal
        open={!!receiptUploadTarget}
        onClose={() => setReceiptUploadTarget(null)}
        expense={receiptUploadTarget}
        onUpload={async (file) => {
          const result = await uploadReceipt(receiptUploadTarget.id, file)
          if (result.success) {
            refetch()
            setDetailRecord((prev) => (prev && prev.id === receiptUploadTarget.id ? { ...prev, has_receipt: true, receipt_status: 'Uploaded' } : prev))
          }
          return result
        }}
      />

      <ExpenseReceiptHistoryModal
        open={!!receiptHistoryTarget}
        onClose={() => setReceiptHistoryTarget(null)}
        expense={receiptHistoryTarget}
        fetchHistory={fetchReceiptHistory}
        onView={viewReceiptVersion}
      />

      {/* Batch Approve Expenses Wizard */}
      <BatchApproveExpensesModal
        open={showBatchApproveModal}
        onClose={() => setShowBatchApproveModal(false)}
        allExpenses={expenses}
        cashAccounts={cashAccounts}
        budgets={budgets}
        categories={categories}
        fetchApprovalProposals={fetchApprovalProposals}
        onBatchApprove={batchApproveExpenses}
      />
    </div>
  )
}