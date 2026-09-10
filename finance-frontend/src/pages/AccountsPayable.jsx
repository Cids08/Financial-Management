import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, FileText, Wallet, AlertTriangle, Info, Printer, CheckCircle2, XCircle, Paperclip, Upload, ScanLine, X, Sparkles } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useAccountsPayable } from '../hooks/useAccountsPayable'
import { apiFetch } from '../utils/api'
import AccountsPayableDocumentModal from '../components/AccountsPayableDocumentModal'
import PaymentWizardModal from '../components/PaymentWizardModal'
import { usePermissions } from '../context/PermissionsContext'


const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'Credit Card', 'GCash']
// Confirmed via pg_get_constraintdef on accounts_payable_status_check —
// same allowed set as accounts_receivable.
const STATUS_OPTIONS = ['Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled']
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ACCEPTED_DOCUMENT_TYPES = [...ACCEPTED_IMAGE_TYPES, 'application/pdf']
const MAX_IMAGE_MB = 8
const MAX_DOC_MB = 10

// Sanity bounds for invoice/due date pickers — nothing previously stopped
// a fat-fingered year (e.g. "1111" instead of "2026") from being typed
// directly into a native date input and saved without complaint. Mirrors
// Budgets.jsx's CURRENT_YEAR/MAX_FISCAL_YEAR reasoning: a static floor/
// ceiling catches typos that a same-field cross-check (due_date vs.
// invoice_date) can't, since both fields can still agree with each other
// on a nonsense year.
const MIN_BILL_DATE = '2017-01-01'
const MAX_BILL_DATE = `${new Date().getFullYear() + 5}-12-31`

const EMPTY_FORM = {
  supplier_id: '', account_id: '', invoice_number: '', invoice_date: '', due_date: '', amount: '',
  payment_method: 'Bank Transfer', billing_address: '', description: '', reference_number: '',
  status: 'Pending', purchase_order_no: '',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  'Partially Paid': 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Paid: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Overdue: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  Cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

function getNextReferenceNo(records = []) {
  const existingRefs = new Set(
    records.map((r) => (r.reference_number || '').trim().toLowerCase())
  )
  let maxNum = 0
  records.forEach((r) => {
    const match = (r.reference_number || '').match(/REF-AP-(\d+)/i)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  })
  let nextNum = maxNum > 0 ? maxNum + 1 : (records.length + 1)
  while (existingRefs.has(`ref-ap-${String(nextNum).padStart(3, '0')}`)) {
    nextNum++
  }
  return `REF-AP-${String(nextNum).padStart(3, '0')}`
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function addDaysISO(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Escapes free-text/user-controlled values before they're injected into the
// print window's raw HTML string (via document.write). Bill fields like
// description/remarks and billing_address are user-editable and stored as-is,
// so without this a bill containing e.g. `<img src=x onerror=...>` in its
// description would execute script in the print window.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-ink text-right">{value ?? '—'}</span>
    </div>
  )
}

// Upload + scan panel shown at the top of the Add Bill form — same behavior
// as AccountsReceivable's InvoiceScanUpload, adapted for bills. Owns its own
// image/drag-state; calls onScanned(fields) once the real OCR scan resolves
// so the parent form can be auto-filled.
function BillScanUpload({ onScanned, onFileSelected, onClear }) {
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'scanning' | 'done'
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
        invoice_number: json.data.invoice_number || '',
        invoice_date: json.data.invoice_date || '',
        due_date: json.data.due_date || '',
        amount: json.data.amount || '',
        reference_number: json.data.reference_no || '',
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
          Supporting Document <span className="text-red-500 dark:text-red-400">*</span>
          <span className="font-normal text-muted ml-1">— upload image or PDF to auto-fill</span>
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
            Drag & drop, or <span className="text-primary-dark underline">browse</span>
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
            <img src={preview} alt="Bill preview" className="h-14 w-14 rounded-md object-cover shrink-0 border border-border" />
          )}
          <div className="min-w-0 flex-1">
            {status === 'scanning' && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                </span>
                {preview === 'pdf' ? 'Inspecting PDF document...' : 'Reading bill details...'}
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

export default function AccountsPayable({ title = 'Accounts Payable', crumbs = ['Financial Transactions', 'Accounts Payable'] }) {
  const {
    bills,
    archivedBills,
    billsLoading,
    billsError,
    stats,
    statsLoading,
    suppliers,
    suppliersLoading,
    accounts,
    accountsLoading,
    formSaving,
    formError,
    actionBusyId,
    createBill,
    updateBill,
    archiveBill,
    restoreBill,
    approveBill,
    rejectBill,
    fetchBillAuditLogs,
    attachDocument,
    fetchDocumentHistory,
    viewDocument,
    fetchPaymentProposals,
    executePaymentRun,
    refetch,
  } = useAccountsPayable()

  const { hasPermission } = usePermissions()
  const canApprove = hasPermission('ap.approve')
  const canManage = hasPermission('ap.manage')
  // Payment Wizard execution requires elevated permission — staff with only ap.manage cannot access it
  const canExecutePayments = hasPermission('ap.approve') || hasPermission('disbursements.approve')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formValidationError, setFormValidationError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [dateErrors, setDateErrors] = useState({ invoice_date: '', due_date: '' })
  const [detailRecord, setDetailRecord] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)
  const [attachmentFile, setAttachmentFile] = useState(null)
  const fileInputRef = useRef(null)

  // Payment Wizard & Direct Pay state
  const [showPaymentWizard, setShowPaymentWizard] = useState(false)
  const [wizardCashAccounts, setWizardCashAccounts] = useState([])

  // Single Bill Payment Modal state (for paying Approved / Partially Paid bills directly)
  const [payTarget, setPayTarget] = useState(null)
  const [payForm, setPayForm] = useState({
    cash_account_id: '',
    payment_method: 'Bank Transfer',
    payment_date: new Date().toISOString().split('T')[0],
    amount_to_pay: '',
    remarks: '',
  })
  const [paySubmitting, setPaySubmitting] = useState(false)
  const [payError, setPayError] = useState('')

  const loadCashAccounts = async () => {
    if (wizardCashAccounts.length > 0) return wizardCashAccounts
    try {
      const res = await apiFetch('/api/cash-accounts?per_page=200')
      const json = await res.json()
      if (res.ok && json.success) {
        const list = Array.isArray(json.data) ? json.data : (json.data?.data ?? [])
        setWizardCashAccounts(list)
        return list
      }
    } catch {}
    return []
  }

  const openPaymentWizard = async () => {
    await loadCashAccounts()
    setShowPaymentWizard(true)
  }

  const openPayBill = async (bill) => {
    const list = await loadCashAccounts()
    setPayTarget(bill)
    const rem = Number(bill.remaining_balance ?? bill.amount ?? 0)
    setPayForm({
      cash_account_id: list[0]?.id ? String(list[0].id) : '',
      payment_method: bill.payment_method || 'Bank Transfer',
      payment_date: new Date().toISOString().split('T')[0],
      amount_to_pay: rem > 0 ? String(rem) : '',
      remarks: '',
    })
    setPayError('')
  }

  const handleConfirmPayBill = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    if (!payTarget) return

    const amt = Number(payForm.amount_to_pay)
    if (!payForm.cash_account_id) {
      setPayError('Please select a payment cash or bank account.')
      return
    }
    if (!amt || amt <= 0) {
      setPayError('Payment amount must be greater than zero.')
      return
    }
    const maxPayable = Number(payTarget.remaining_balance ?? payTarget.amount ?? 0)
    if (amt > maxPayable) {
      setPayError(`Payment amount cannot exceed the remaining balance (${formatCurrency(maxPayable)}).`)
      return
    }
    const selectedAcc = wizardCashAccounts.find((a) => String(a.id) === String(payForm.cash_account_id))
    if (selectedAcc && amt > Number(selectedAcc.current_balance)) {
      setPayError(`Insufficient funds in ${selectedAcc.account_name}. Available: ${formatCurrency(selectedAcc.current_balance)}.`)
      return
    }

    setPaySubmitting(true)
    setPayError('')
    const res = await executePaymentRun({
      cash_account_id: Number(payForm.cash_account_id),
      payment_method: payForm.payment_method,
      payment_date: payForm.payment_date,
      proposals: [{
        ap_id: payTarget.ap_id,
        amount_to_pay: amt,
        remarks: payForm.remarks || null,
      }],
    })
    setPaySubmitting(false)

    if (res.success) {
      setSuccessMessage(`Disbursement voucher created for ${formatCurrency(amt)} (bill ${payTarget.invoice_number}). Go to Disbursements → Approve → Release to complete payment and mark bill as Paid.`)
      setTimeout(() => setSuccessMessage(''), 10000)
      setPayTarget(null)
      if (detailRecord?.ap_id === payTarget.ap_id) {
        setDetailRecord(null)
      }
    } else {
      setPayError(res.message || 'Payment recording failed.')
    }
  }

  const validateDate = (field, value) => {

    if (!value) {
      setDateErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    const d = new Date(value)
    const min = new Date(MIN_BILL_DATE)
    const max = new Date(MAX_BILL_DATE)
    if (isNaN(d.getTime())) {
      setDateErrors((e) => ({ ...e, [field]: 'Invalid date.' }))
    } else if (d < min || d > max) {
      setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
    } else {
      setDateErrors((e) => ({ ...e, [field]: '' }))
    }
  }
  const [billDisbursements, setBillDisbursements] = useState([])
  const [billDisbursementsLoading, setBillDisbursementsLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [auditLogsError, setAuditLogsError] = useState(null)
  const [documentTarget, setDocumentTarget] = useState(null)

  const supplierName = (id) => suppliers.find((s) => s.supplier_id === Number(id))?.supplier_name || 'Unknown'
  const accountLabel = (id) => {
    const acct = (accounts ?? []).find((a) => a.id === Number(id))
    return acct ? `${acct.account_code} — ${acct.account_name}` : '—'
  }
  // Mirrors AccountsPayablePolicy::update() — a bill that's been approved,
  // or whose status is Paid/Cancelled, can't be edited (goes through a
  // corrective/void flow instead). Keeping this in sync with the backend
  // means the Edit button doesn't show for a bill the save would 403 on.
  const canEditBill = (r) => canManage && !r.approved_by && !['Paid', 'Cancelled'].includes(r.status)
  // Mirrors AccountsPayablePolicy::archive() — only completed/settled bills
  // (Paid or Cancelled) can be archived. In-flight bills (Pending, Partially Paid, Overdue)
  // must remain in the active operational queue until fully resolved.
  const canArchiveBill = (r) => canManage && ['Paid', 'Cancelled'].includes(r.status)

  const sourceList = showArchived ? archivedBills : bills

  const filtered = useMemo(() => {
    return sourceList.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      const q = search.toLowerCase()
      if (search
        && !r.invoice_number.toLowerCase().includes(q)
        && !supplierName(r.supplier_id).toLowerCase().includes(q)
        && !(r.reference_number || '').toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceList, search, statusFilter, suppliers])

  const allBills = useMemo(() => [...bills, ...(archivedBills || [])], [bills, archivedBills])

  const openAdd = () => {
    setForm({
      ...EMPTY_FORM,
      supplier_id: suppliers[0]?.supplier_id ?? '',
      account_id: accounts[0]?.id ?? '',
      reference_number: getNextReferenceNo(allBills),
    })
    setFormValidationError('')
    setFieldErrors({})
    setDateErrors({ invoice_date: '', due_date: '' })
    setModalMode('add')
  }

  // Populate first available options if lookups resolve while Add modal is open
  useEffect(() => {
    if (modalMode === 'add') {
      setForm((f) => ({
        ...f,
        supplier_id: f.supplier_id || (suppliers[0]?.supplier_id ?? ''),
        account_id: f.account_id || (accounts[0]?.id ?? ''),
      }))
    }
  }, [suppliers, accounts, modalMode])

  const openEdit = (r) => {
    setForm({
      supplier_id: r.supplier_id,
      account_id: r.account_id ?? '',
      invoice_number: r.invoice_number,
      invoice_date: r.invoice_date || '',
      due_date: r.due_date || '',
      amount: r.amount,
      payment_method: r.payment_method || 'Bank Transfer',
      billing_address: r.billing_address || '',
      description: r.description || '',
      reference_number: r.reference_number || '',
      status: r.status,
      purchase_order_no: r.purchase_order_no || '',
    })
    setFormValidationError('')
    setFieldErrors({})
    setDateErrors({ invoice_date: '', due_date: '' })
    setModalMode(r)
  }
  const closeModal = () => { setModalMode(null); setFormValidationError(''); setFieldErrors({}); setDateErrors({ invoice_date: '', due_date: '' }); setAttachmentFile(null) }
  const openDetail = (r) => {
    setDetailRecord(r)
    setBillDisbursements([])
    setBillDisbursementsLoading(true)
    setAuditLogs([])
    setAuditLogsError(null)
    setAuditLogsLoading(true)

    apiFetch(`/api/disbursements?ap_id=${r.ap_id}&per_page=100`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setBillDisbursements(json.data ?? [])
      })
      .catch(() => {})
      .finally(() => setBillDisbursementsLoading(false))

    fetchBillAuditLogs(r.ap_id)
      .then(setAuditLogs)
      .catch((err) => setAuditLogsError(err.message))
      .finally(() => setAuditLogsLoading(false))
  }
  const closeDetail = () => {
    setDetailRecord(null)
    setBillDisbursements([])
    setAuditLogs([])
  }

  // Merges scanned fields into the form without clobbering anything the
  // user already typed by hand — same merge pattern as AccountsReceivable's
  // handleScanned.
  const handleScanned = (extracted) => {
    setForm((f) => ({
      ...f,
      invoice_number: f.invoice_number || extracted.invoice_number,
      invoice_date: f.invoice_date || extracted.invoice_date,
      due_date: f.due_date || extracted.due_date,
      amount: f.amount || extracted.amount,
      reference_number: extracted.reference_number || f.reference_number,
    }))
  }

  const handlePrint = (r) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    // Every value below is escaped before being interpolated into the raw
    // HTML string — description/billing_address are user-controlled fields
    // stored verbatim, so this print window is otherwise an XSS vector.
    const rows = [
      ['Supplier', escapeHtml(supplierName(r.supplier_id))],
      ['Account', escapeHtml(r.account_id ? accountLabel(r.account_id) : '—')],
      ['Invoice Date', escapeHtml(formatDate(r.invoice_date))],
      ['Due Date', escapeHtml(formatDate(r.due_date))],
      ['Purchase Order No.', escapeHtml(r.purchase_order_no || '—')],
      ['Original Amount', escapeHtml(formatCurrency(r.amount))],
      ['Paid Amount', escapeHtml(formatCurrency(r.paid_amount))],
      ['Remaining Balance', escapeHtml(formatCurrency(r.remaining_balance))],
      ['Payment Method', escapeHtml(r.payment_method || '—')],
      ['Billing Address', escapeHtml(r.billing_address || '—')],
      ['Description', escapeHtml(r.description || '—')],
      ['Reference No.', escapeHtml(r.reference_number || '—')],
      ['Status', escapeHtml(r.status)],
    ]
    const invoiceNumberSafe = escapeHtml(r.invoice_number)
    const supplierNameSafe = escapeHtml(supplierName(r.supplier_id))
    const statusSafe = escapeHtml(r.status)
    win.document.write(`
      <html>
        <head>
          <title>${invoiceNumberSafe}</title>
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
            <div><h1>Bill ${invoiceNumberSafe}</h1><p>${supplierNameSafe}</p></div>
            <span class="status">${statusSafe}</span>
          </div>
          <table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${value}</td></tr>`).join('')}</table>
          <div class="footer">Printed on ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
        </body>
      </html>
    `)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormValidationError('')
    const errors = {}

    if (!form.invoice_number.trim()) errors.invoice_number = 'Invoice number is required.'
    if (!form.account_id) errors.account_id = 'Select an account.'
    if (!form.due_date) {
      errors.due_date = 'Due date is required.'
    } else if (form.due_date < MIN_BILL_DATE || form.due_date > MAX_BILL_DATE) {
      errors.due_date = 'Due date is out of range.'
    } else if (form.invoice_date && form.due_date < form.invoice_date) {
      errors.due_date = 'Due date must be on or after invoice date.'
    }

    if (form.invoice_date && (form.invoice_date < MIN_BILL_DATE || form.invoice_date > MAX_BILL_DATE)) {
      errors.invoice_date = 'Invoice date is out of range.'
    }

    const parsedAmount = Number(form.amount)
    if (!form.amount) {
      errors.amount = 'Original amount is required.'
    } else if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      errors.amount = 'Amount must be greater than zero.'
    } else if (isEditing && parsedAmount < Number(modalMode.paid_amount || 0)) {
      errors.amount = `Amount cannot be less than paid amount (${formatCurrency(modalMode.paid_amount)}).`
    }

    if (form.reference_number && form.reference_number.trim()) {
      const trimmedRef = form.reference_number.trim().toLowerCase()
      const dup = allBills.find((r) => {
        if (isEditing && r.ap_id === modalMode?.ap_id) return false
        return (r.reference_number || '').trim().toLowerCase() === trimmedRef
      })
      if (dup) {
        errors.reference_number = `Reference number is already used by bill ${dup.invoice_number}.`
      }
    }

    // Supporting document is strictly required when creating a new bill.
    if (modalMode === 'add' && !attachmentFile) {
      errors.document = 'A supporting document (invoice scan or PDF) is required.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    const payload = {
      supplier_id: Number(form.supplier_id),
      account_id: Number(form.account_id),
      invoice_number: form.invoice_number.trim(),
      invoice_date: form.invoice_date || null,
      due_date: form.due_date,
      amount: parsedAmount,
      payment_method: form.payment_method,
      billing_address: form.billing_address.trim(),
      description: form.description.trim(),
      reference_number: form.reference_number.trim(),
      status: form.status,
      purchase_order_no: form.purchase_order_no.trim(),
    }

    let result
    if (modalMode === 'add') {
      // Send as multipart so the required document file can be included.
      const fd = new FormData()
      Object.entries(payload).forEach(([k, v]) => { if (v != null) fd.append(k, v) })
      fd.append('document', attachmentFile)
      result = await createBill(fd)
    } else {
      result = await updateBill(modalMode.ap_id, payload)
    }

    if (result.success) closeModal()
  }

  // Quick-view the newest document without opening the full history modal
  // first — mirrors Budgets.jsx's "View current plan" button, adapted for
  // the fact that our view endpoint needs an explicit document id (unlike
  // Budget's /plan/view, which resolves "current" server-side by
  // budget_id alone). Fetches history, takes the newest entry, views it.
  const handleViewLatestDocument = async (r) => {
    const targetWindow = window.open('', '_blank')
    const history = await fetchDocumentHistory(r.ap_id)
    if (!history.success || !history.data?.length) {
      targetWindow?.close()
      return
    }
    await viewDocument(r.ap_id, history.data[0].id, targetWindow)
  }

  const handleApprove = async (r) => {
    const result = await approveBill(r.ap_id)
    if (result.success) {
      setSuccessMessage(`Bill ${r.invoice_number} approved successfully and posted to General Ledger.`)
      setTimeout(() => setSuccessMessage(''), 5000)
      if (detailRecord?.ap_id === r.ap_id) {
        setDetailRecord(result.bill)
      }
    }
  }

  const openReject = (r) => {
    setRejectTarget(r)
    setRejectReason('')
  }

  const handleConfirmReject = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    if (!rejectTarget) return
    setRejectSubmitting(true)
    const result = await rejectBill(rejectTarget.ap_id, rejectReason)
    setRejectSubmitting(false)
    if (result.success) {
      setSuccessMessage(`Bill ${rejectTarget.invoice_number} was rejected.`)
      setTimeout(() => setSuccessMessage(''), 5000)
      if (detailRecord?.ap_id === rejectTarget.ap_id) {
        setDetailRecord(result.bill)
      }
      setRejectTarget(null)
      setRejectReason('')
    }
  }

  const statCards = [
    { key: 'total', label: 'Total Bills', value: stats.total, icon: FileText, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'payable', label: 'Payable Amount', value: formatCurrency(stats.payable), icon: Wallet, iconBg: 'bg-primary/10 dark:bg-primary/15', iconColor: 'text-primary-dark dark:text-primary', isActive: false, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'overdue', label: 'Overdue', value: stats.overdue, icon: AlertTriangle, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: statusFilter === 'Overdue' && !showArchived, onClick: () => { setStatusFilter('Overdue'); setShowArchived(false) } },
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
          <p className="mt-1 text-xs text-muted">Track supplier bills and amounts owed.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" icon={Sparkles} onClick={openPaymentWizard}>Payment Wizard</Button>
          {canManage && (
            <Button variant="primary" size="sm" icon={Plus} onClick={openAdd} disabled={suppliersLoading || accountsLoading}>Add Bill</Button>
          )}
        </div>

      </div>

      {successMessage && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage('')} className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400">
            <X size={14} />
          </button>
        </div>
      )}

      {billsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {billsError}
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
              className={`${PANEL} ${PANEL_PAD} flex items-center gap-2.5 text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={15} className={card.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">{card.label}</p>
                <p className="text-lg font-bold text-ink">{statsLoading ? '—' : card.value}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice no., supplier, or reference..." className={`${INPUT} pl-9`} />
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
        <div className="overflow-hidden rounded-t-xl">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2.5 py-3 w-[18%] whitespace-nowrap">Bill</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3 w-[16%] whitespace-nowrap">Supplier</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3 w-[12%] whitespace-nowrap">Due Date</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3 w-[14%] whitespace-nowrap">Amount Due</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wider px-2 py-3 w-[12%] whitespace-nowrap">Status</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wider px-2.5 py-3 w-[28%] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {billsLoading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">Loading bills…</td></tr>
              )}

              {!billsLoading && filtered.map((r) => (
                <tr key={r.ap_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                  <td className="px-2.5 py-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => openDetail(r)}
                        className="font-semibold text-xs sm:text-sm text-ink hover:text-primary transition-colors text-left truncate block shrink-0"
                        title="Click to view bill details"
                      >
                        {r.invoice_number}
                      </button>
                      {r.has_attachment && (
                        <Tooltip label="Document attached">
                          <Paperclip size={12} className="text-primary-dark shrink-0" />
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-[11px] text-muted truncate" title={r.description || undefined}>
                      {r.description || '—'}
                    </p>
                  </td>
                  <td className="px-2 py-2 min-w-0">
                    <p className="font-medium text-xs text-ink truncate" title={r.supplier_name || supplierName(r.supplier_id)}>
                      {r.supplier_name || supplierName(r.supplier_id)}
                    </p>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-ink text-xs">{formatDate(r.due_date)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-left tabular-nums">
                    <span className="text-ink font-semibold text-xs sm:text-sm">{formatCurrency(r.remaining_balance)}</span>
                    {r.paid_amount > 0 && (
                      <span className="block text-[10px] text-muted line-through">{formatCurrency(r.amount)}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-left">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] || 'bg-gray-100 text-muted'}`}>{r.status}</span>
                  </td>
                  <td className="px-2.5 py-2 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Workflow decision buttons — Approve / Reject (Pending only) */}
                      {canApprove && !r.is_archived && !r.approved_by && r.status !== 'Cancelled' && (
                        <div className="flex items-center gap-1 mr-1 pr-1 border-r border-border shrink-0">
                          <Tooltip label="Approve bill & post to General Ledger" align="start">
                            <button
                              type="button"
                              onClick={() => handleApprove(r)}
                              disabled={actionBusyId === r.ap_id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                              <CheckCircle2 size={12} className={actionBusyId === r.ap_id ? 'animate-spin' : ''} />
                              <span>{actionBusyId === r.ap_id ? 'Approving…' : 'Approve'}</span>
                            </button>
                          </Tooltip>
                          <Tooltip label="Reject bill" align="start">
                            <button
                              type="button"
                              onClick={() => openReject(r)}
                              disabled={actionBusyId === r.ap_id}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-semibold rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-xs transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                              <XCircle size={12} />
                              <span>Reject</span>
                            </button>
                          </Tooltip>
                        </div>
                      )}

                      {/* Pay Button for any Approved / Partially Paid / Overdue bill with remaining balance */}
                      {!r.is_archived && r.status !== 'Cancelled' && (r.approved_by || r.status === 'Partially Paid') && Number(r.remaining_balance) > 0 && (
                        <div className="flex items-center mr-1 pr-1 border-r border-border shrink-0">
                          <Tooltip label={`Pay remaining balance (${formatCurrency(r.remaining_balance)})`} align="start">
                            <button
                              type="button"
                              onClick={() => openPayBill(r)}
                              disabled={actionBusyId === r.ap_id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                              <Wallet size={12} />
                              <span>Pay</span>
                            </button>
                          </Tooltip>
                        </div>
                      )}

                      {/* Standard Utilities (present on every row) */}
                      <Tooltip label="View details" align="start">
                        <button type="button" onClick={() => openDetail(r)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={14} />
                        </button>
                      </Tooltip>

                      <Tooltip label="Print bill voucher" align="start">
                        <button type="button" onClick={() => handlePrint(r)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Printer size={14} />
                        </button>
                      </Tooltip>

                      <Tooltip label={r.has_attachment ? 'Supporting document attached (click to view/manage)' : 'Attach supporting document'} align="start">
                        <button
                          type="button"
                          onClick={() => setDocumentTarget(r)}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ${
                            r.has_attachment
                              ? 'text-primary-dark bg-primary/10 hover:bg-primary/20'
                              : 'text-muted hover:bg-bg hover:text-ink'
                          }`}
                        >
                          <Paperclip size={14} fill={r.has_attachment ? 'currentColor' : 'none'} fillOpacity={r.has_attachment ? 0.2 : 0} />
                        </button>
                      </Tooltip>

                      {/* Edit bill — only rendered when bill is editable */}
                      {!r.is_archived && canEditBill(r) && (
                        <Tooltip label="Edit bill" align="start">
                          <button type="button" onClick={() => openEdit(r)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={14} />
                          </button>
                        </Tooltip>
                      )}

                      {/* Archive / Restore bill — only rendered when actionable */}
                      {r.is_archived ? (
                        <Tooltip label="Restore bill" align="end">
                          <button
                            type="button"
                            onClick={() => restoreBill(r.ap_id)}
                            disabled={actionBusyId === r.ap_id}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <RotateCcw size={14} />
                          </button>
                        </Tooltip>
                      ) : canArchiveBill(r) ? (
                        <Tooltip label="Archive bill" align="end">
                          <button
                            type="button"
                            onClick={() => archiveBill(r.ap_id)}
                            disabled={actionBusyId === r.ap_id}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Archive size={14} />
                          </button>
                        </Tooltip>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!billsLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No bills match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Bill' : 'Add Bill'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} loading={formSaving}>{isEditing ? 'Save Changes' : 'Add Bill'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {(formValidationError || formError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formValidationError || formError}</div>
          )}

          {!isEditing && (
            <>
              <BillScanUpload
                onScanned={handleScanned}
                onFileSelected={(f) => { setAttachmentFile(f); setFieldErrors((fe) => ({ ...fe, document: '' })) }}
                onClear={() => setAttachmentFile(null)}
              />
              {fieldErrors.document && (
                <p className="text-xs text-red-500 dark:text-red-400 -mt-2">{fieldErrors.document}</p>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Supplier <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={form.supplier_id}
                onChange={(e) => {
                  const newSupplierId = e.target.value
                  setForm((f) => {
                    const supplier = suppliers.find((s) => s.supplier_id === Number(newSupplierId))
                    const shouldAutoFill = !f.billing_address.trim() && supplier?.billing_address
                    return {
                      ...f,
                      supplier_id: newSupplierId,
                      billing_address: shouldAutoFill ? supplier.billing_address : f.billing_address,
                    }
                  })
                }}
                className={INPUT}
              >
                {suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Invoice Number <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="text"
                value={form.invoice_number}
                onChange={(e) => { setForm((f) => ({ ...f, invoice_number: e.target.value })); setFieldErrors((fe) => ({ ...fe, invoice_number: '' })) }}
                className={`${INPUT} ${fieldErrors.invoice_number ? 'border-red-400 dark:border-red-500' : ''}`}
                placeholder="SUP-INV-3301"
              />
              {fieldErrors.invoice_number && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.invoice_number}</p>}
            </div>
          </div>
          <div>
            <label className={LABEL}>Account (what this bill debits) <span className="text-red-500 dark:text-red-400">*</span></label>
            <select
              value={form.account_id}
              onChange={(e) => { setForm((f) => ({ ...f, account_id: e.target.value })); setFieldErrors((fe) => ({ ...fe, account_id: '' })) }}
              className={`${INPUT} ${fieldErrors.account_id ? 'border-red-400 dark:border-red-500' : ''}`}
            >
              <option value="" disabled>Select an account…</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
              ))}
            </select>
            {fieldErrors.account_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.account_id}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Invoice Date</label>
              <input
                type="date"
                value={form.invoice_date}
                min={MIN_BILL_DATE}
                max={MAX_BILL_DATE}
                onChange={(e) => { setForm((f) => ({ ...f, invoice_date: e.target.value })); setFieldErrors((fe) => ({ ...fe, invoice_date: '' })) }}
                onBlur={(e) => validateDate('invoice_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${dateErrors.invoice_date || fieldErrors.invoice_date ? 'border-red-400 dark:border-red-500' : ''}`}
              />
              {(dateErrors.invoice_date || fieldErrors.invoice_date) && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{dateErrors.invoice_date || fieldErrors.invoice_date}</p>}
            </div>
            <div>
              <label className={LABEL}>Due Date <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="date"
                required
                value={form.due_date}
                min={form.invoice_date || MIN_BILL_DATE}
                max={MAX_BILL_DATE}
                onChange={(e) => { setForm((f) => ({ ...f, due_date: e.target.value })); setFieldErrors((fe) => ({ ...fe, due_date: '' })) }}
                onBlur={(e) => validateDate('due_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${dateErrors.due_date || fieldErrors.due_date ? 'border-red-400 dark:border-red-500' : ''}`}
              />
              {(dateErrors.due_date || fieldErrors.due_date) && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{dateErrors.due_date || fieldErrors.due_date}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Original Amount <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.amount}
                onChange={(e) => {
                  const val = e.target.value
                  setForm((f) => ({ ...f, amount: val }))
                  setFieldErrors((fe) => ({ ...fe, amount: '' }))
                  if (val === '') {
                    setFieldErrors((fe) => ({ ...fe, amount: '' }))
                  } else if (Number(val) < 0) {
                    setFieldErrors((fe) => ({ ...fe, amount: 'Amount cannot be negative.' }))
                  } else if (Number(val) === 0) {
                    setFieldErrors((fe) => ({ ...fe, amount: 'Amount must be greater than zero.' }))
                  }
                }}
                className={`${INPUT} ${fieldErrors.amount ? 'border-red-400 dark:border-red-500' : ''}`}
                placeholder="0.00"
              />
              {fieldErrors.amount && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.amount}</p>}
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
              <label className={LABEL}>Purchase Order No.</label>
              <input type="text" value={form.purchase_order_no} onChange={(e) => setForm((f) => ({ ...f, purchase_order_no: e.target.value }))} className={INPUT} placeholder="PO-2026-0142" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-muted">Reference Number</label>
                {modalMode === 'add' && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextRef = getNextReferenceNo(allBills)
                      setForm((f) => ({ ...f, reference_number: nextRef }))
                      setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                    }}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Auto-generate
                  </button>
                )}
              </div>
              <input
                type="text"
                value={form.reference_number}
                onChange={(e) => {
                  const val = e.target.value
                  setForm((f) => ({ ...f, reference_number: val }))
                  const trimmed = val.trim().toLowerCase()
                  if (trimmed) {
                    const dup = allBills.find((r) => {
                      if (isEditing && r.ap_id === modalMode?.ap_id) return false
                      return (r.reference_number || '').trim().toLowerCase() === trimmed
                    })
                    if (dup) {
                      setFieldErrors((fe) => ({ ...fe, reference_number: `Reference number is already used by bill ${dup.invoice_number}.` }))
                    } else {
                      setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                    }
                  } else {
                    setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                  }
                }}
                className={`${INPUT} ${fieldErrors.reference_number ? 'border-red-400 dark:border-red-500' : ''}`}
                placeholder="REF-AP-001"
              />
              {fieldErrors.reference_number && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  {fieldErrors.reference_number}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className={LABEL}>Billing Address</label>
            <input type="text" value={form.billing_address} onChange={(e) => setForm((f) => ({ ...f, billing_address: e.target.value }))} className={INPUT} placeholder="Pasig City, Metro Manila" />
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={INPUT} placeholder="What this bill covers" />
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {isEditing && (
            <p className="text-xs text-muted">
              To attach a supporting document (invoice scan/photo), use the <Paperclip size={12} className="inline" /> icon on the bill's row after saving.
            </p>
          )}

          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <p className="text-xs font-medium text-muted mb-1">Record Info (read-only)</p>
              <DetailRow label="Paid Amount" value={formatCurrency(modalMode.paid_amount)} />
              <DetailRow label="Remaining Balance" value={formatCurrency(modalMode.remaining_balance)} />
              <DetailRow label="Created by" value={modalMode.created_by_name || '—'} />
              <DetailRow label="Created at" value={formatDateTime(modalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(modalMode.updated_at)} />
              <DetailRow label="Approved by" value={modalMode.approved_by_name || 'Not yet approved'} />
              {modalMode.approved_at && <DetailRow label="Approved at" value={formatDateTime(modalMode.approved_at)} />}
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={!!detailRecord}
        onClose={closeDetail}
        title="Bill Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && !detailRecord.approved_by && !detailRecord.is_archived && detailRecord.status !== 'Cancelled' && (
              <>
                <button
                  type="button"
                  disabled={actionBusyId === detailRecord.ap_id}
                  onClick={() => handleApprove(detailRecord)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 size={16} className={actionBusyId === detailRecord.ap_id ? 'animate-spin' : ''} />
                  {actionBusyId === detailRecord.ap_id ? 'Approving…' : 'Approve Bill'}
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === detailRecord.ap_id}
                  onClick={() => openReject(detailRecord)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle size={16} />
                  Reject Bill
                </button>
              </>
            )}
            {detailRecord && !detailRecord.is_archived && detailRecord.status !== 'Cancelled' && (detailRecord.approved_by || detailRecord.status === 'Partially Paid') && Number(detailRecord.remaining_balance) > 0 && (
              <button
                type="button"
                onClick={() => { const target = detailRecord; closeDetail(); openPayBill(target) }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all duration-150 active:scale-95"
              >
                <Wallet size={16} />
                Pay Bill ({formatCurrency(detailRecord.remaining_balance)})
              </button>
            )}
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Bill</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            {!detailRecord.approved_by && !detailRecord.is_archived && detailRecord.status !== 'Cancelled' && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 rounded-xl border border-amber-300/80 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 animate-fadeIn">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                    <AlertTriangle size={19} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Awaiting CEO Approval</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">This bill requires approval before disbursements or payments can proceed.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={actionBusyId === detailRecord.ap_id}
                    onClick={() => handleApprove(detailRecord)}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 size={13} className={actionBusyId === detailRecord.ap_id ? 'animate-spin' : ''} />
                    {actionBusyId === detailRecord.ap_id ? 'Approving…' : 'Approve Bill'}
                  </button>
                  <button
                    type="button"
                    disabled={actionBusyId === detailRecord.ap_id}
                    onClick={() => openReject(detailRecord)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-surface dark:text-red-400 dark:hover:bg-red-500/10 shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle size={13} />
                    Reject
                  </button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.invoice_number}</p>
                <p className="text-xs text-muted">{detailRecord.supplier_name || supplierName(detailRecord.supplier_id)}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status] || 'bg-gray-100 text-muted'}`}>{detailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Account" value={detailRecord.account_id ? accountLabel(detailRecord.account_id) : '—'} />
                <DetailRow label="Invoice Date" value={formatDate(detailRecord.invoice_date)} />
                <DetailRow label="Due Date" value={formatDate(detailRecord.due_date)} />
                <DetailRow label="Purchase Order No." value={detailRecord.purchase_order_no || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Original Amount" value={formatCurrency(detailRecord.amount)} />
                <DetailRow label="Paid Amount" value={formatCurrency(detailRecord.paid_amount)} />
                <DetailRow label="Remaining Balance" value={formatCurrency(detailRecord.remaining_balance)} />
                <DetailRow label="Payment Method" value={detailRecord.payment_method || '—'} />
                <DetailRow label="Billing Address" value={detailRecord.billing_address || '—'} />
                <DetailRow label="Reference No." value={detailRecord.reference_number || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Description" value={detailRecord.description || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={detailRecord.created_by_name || '—'} />
                <DetailRow label="Created at" value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(detailRecord.updated_at)} />
                <DetailRow label="Approved by" value={detailRecord.approved_by_name || 'Not yet approved'} />
                {detailRecord.approved_at && <DetailRow label="Approved at" value={formatDateTime(detailRecord.approved_at)} />}
              </div>
            </div>

            {/* Related Disbursements / Payment History */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-ink">Payment & Disbursement History</p>
                <span className="text-[11px] text-muted">
                  {billDisbursementsLoading ? 'Loading…' : `${billDisbursements.length} record${billDisbursements.length === 1 ? '' : 's'}`}
                </span>
              </div>
              <div className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/30">
                {billDisbursementsLoading && (
                  <p className="px-3 py-3 text-xs text-muted text-center">Loading disbursements…</p>
                )}
                {!billDisbursementsLoading && billDisbursements.length === 0 && (
                  <p className="px-3 py-3 text-xs text-muted text-center">No disbursements recorded against this bill yet.</p>
                )}
                {!billDisbursementsLoading && billDisbursements.map((d) => (
                  <div key={d.disbursement_id || d.id} className="px-3 py-2 text-xs flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{d.voucher_number}</p>
                      <p className="text-[11px] text-muted">{formatDate(d.payment_date)} · {d.payment_method || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-ink tabular-nums">{formatCurrency(d.amount_paid)}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLES[d.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {d.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Related Activity & Audit Trail */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-ink">Activity & Audit Trail</p>
                <span className="text-[11px] text-muted">
                  {auditLogsLoading ? 'Loading…' : `${auditLogs.length} event${auditLogs.length === 1 ? '' : 's'}`}
                </span>
              </div>
              <div className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/30">
                {auditLogsLoading && (
                  <p className="px-3 py-3 text-xs text-muted text-center">Loading audit history…</p>
                )}
                {!auditLogsLoading && auditLogsError && (
                  <p className="px-3 py-3 text-xs text-red-600 text-center">{auditLogsError}</p>
                )}
                {!auditLogsLoading && !auditLogsError && auditLogs.length === 0 && (
                  <p className="px-3 py-3 text-xs text-muted text-center">No audit trail recorded for this bill.</p>
                )}
                {!auditLogsLoading && !auditLogsError && auditLogs.map((log) => (
                  <div key={log.id} className="px-3 py-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink leading-relaxed">
                        {log.activity_description || log.action}
                      </span>
                      <span className="text-[11px] text-muted shrink-0 tabular-nums">
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                    {log.user_name && (
                      <p className="text-[11px] text-muted mt-0.5">by <span className="font-medium text-ink">{log.user_name}</span></p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <AccountsPayableDocumentModal
        open={!!documentTarget}
        onClose={() => setDocumentTarget(null)}
        bill={documentTarget}
        fetchHistory={fetchDocumentHistory}
        onUpload={(file) => attachDocument(documentTarget.ap_id, file)}
        onView={viewDocument}
        onUploaded={refetch}
      />

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Bill"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRejectTarget(null)} disabled={rejectSubmitting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              icon={XCircle}
              loading={rejectSubmitting}
              onClick={handleConfirmReject}
            >
              Confirm Rejection
            </Button>
          </>
        }
      >
        {rejectTarget && (
          <form onSubmit={handleConfirmReject} className="space-y-3">
            <p className="text-xs text-ink">
              Are you sure you want to reject bill <span className="font-semibold text-ink">{rejectTarget.invoice_number}</span> ({formatCurrency(rejectTarget.amount)})?
            </p>
            <p className="text-[11px] text-muted">
              Rejecting will mark this bill as Cancelled, prevent any disbursements, and send an alert to the creator.
            </p>
            <div>
              <label className={LABEL}>Reason for Rejection (Optional)</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className={`${INPUT} h-auto py-2 resize-none`}
                placeholder="e.g. Inaccurate billing amount, duplicate invoice, supplier verification needed..."
              />
            </div>
          </form>
        )}
      </Modal>

      {/* Pay Single Bill Modal (Direct payment for Approved / Partially Paid bills) */}
      <Modal
        open={!!payTarget}
        onClose={() => { if (!paySubmitting) setPayTarget(null) }}
        title={payTarget ? `Record Payment — ${payTarget.invoice_number}` : 'Record Bill Payment'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setPayTarget(null)} disabled={paySubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={Wallet}
              loading={paySubmitting}
              onClick={handleConfirmPayBill}
            >
              Confirm Payment
            </Button>
          </>
        }
      >
        {payTarget && (
          <form onSubmit={handleConfirmPayBill} className="space-y-4">
            {payError && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {payError}
              </div>
            )}

            {/* Bill Summary Box */}
            <div className="rounded-xl border border-border bg-bg/50 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-ink">{payTarget.invoice_number}</span>
                  <p className="text-xs text-muted">{payTarget.supplier_name || supplierName(payTarget.supplier_id)}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[payTarget.status] || ''}`}>
                  {payTarget.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60 text-xs">
                <div>
                  <span className="text-muted block text-[11px]">Original Amount</span>
                  <span className="font-semibold text-ink">{formatCurrency(payTarget.amount)}</span>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">Already Paid</span>
                  <span className="font-semibold text-ink">{formatCurrency(payTarget.paid_amount || 0)}</span>
                </div>
                <div>
                  <span className="text-muted block text-[11px]">Remaining Due</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(payTarget.remaining_balance)}</span>
                </div>
              </div>
            </div>

            {/* Payment Amount */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-muted">
                  Payment Amount (₱) <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPayForm((f) => ({ ...f, amount_to_pay: String(payTarget.remaining_balance) }))}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Pay Full ({formatCurrency(payTarget.remaining_balance)})
                  </button>
                  {Number(payTarget.remaining_balance) > 1 && (
                    <button
                      type="button"
                      onClick={() => setPayForm((f) => ({ ...f, amount_to_pay: (Number(payTarget.remaining_balance) / 2).toFixed(2) }))}
                      className="text-[11px] font-medium text-muted hover:text-ink hover:underline"
                    >
                      Pay 50%
                    </button>
                  )}
                </div>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={payTarget.remaining_balance}
                value={payForm.amount_to_pay}
                onChange={(e) => {
                  setPayForm((f) => ({ ...f, amount_to_pay: e.target.value }))
                  setPayError('')
                }}
                className={INPUT}
                style={INPUT_TEXT_STYLE}
                placeholder="0.00"
                required
              />
              <p className="text-[11px] text-muted mt-1">
                Enter the full balance to settle the bill, or a partial amount to record an installment payment.
              </p>
            </div>

            {/* Cash Account */}
            <div>
              <label className={LABEL}>
                Disburse From Cash / Bank Account <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <select
                value={payForm.cash_account_id}
                onChange={(e) => {
                  setPayForm((f) => ({ ...f, cash_account_id: e.target.value }))
                  setPayError('')
                }}
                className={INPUT}
                style={INPUT_TEXT_STYLE}
                required
              >
                <option value="">Select cash / bank account...</option>
                {wizardCashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name} {a.bank_name ? `(${a.bank_name})` : ''} — Balance: {formatCurrency(a.current_balance)}
                  </option>
                ))}
              </select>
              {(() => {
                const selectedAcc = wizardCashAccounts.find((a) => String(a.id) === String(payForm.cash_account_id))
                if (selectedAcc && Number(payForm.amount_to_pay) > Number(selectedAcc.current_balance)) {
                  return (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1 font-medium">
                      Warning: Payment amount exceeds available funds in {selectedAcc.account_name} ({formatCurrency(selectedAcc.current_balance)}).
                    </p>
                  )
                }
                return null
              })()}
            </div>

            {/* Method and Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Payment Method <span className="text-red-500 dark:text-red-400">*</span></label>
                <select
                  value={payForm.payment_method}
                  onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                  className={INPUT}
                  style={INPUT_TEXT_STYLE}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Payment Date <span className="text-red-500 dark:text-red-400">*</span></label>
                <input
                  type="date"
                  value={payForm.payment_date}
                  onChange={(e) => setPayForm((f) => ({ ...f, payment_date: e.target.value }))}
                  className={`${INPUT} scheme-light dark:scheme-dark`}
                  style={INPUT_TEXT_STYLE}
                  required
                />
              </div>
            </div>

            {/* Remarks / Reference */}
            <div>
              <label className={LABEL}>Payment Note / Reference (Optional)</label>
              <input
                type="text"
                value={payForm.remarks}
                onChange={(e) => setPayForm((f) => ({ ...f, remarks: e.target.value }))}
                className={INPUT}
                style={INPUT_TEXT_STYLE}
                placeholder="e.g. 2nd partial payment via online transfer ref #12345"
              />
            </div>
          </form>
        )}
      </Modal>

      <PaymentWizardModal
        open={showPaymentWizard}
        onClose={() => setShowPaymentWizard(false)}
        suppliers={suppliers}
        cashAccounts={wizardCashAccounts}
        fetchPaymentProposals={fetchPaymentProposals}
        executePaymentRun={executePaymentRun}
      />
    </div>
  )
}
