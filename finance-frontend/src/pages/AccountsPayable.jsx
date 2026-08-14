import { useMemo, useRef, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, FileText, Wallet, AlertTriangle, Info, Printer, CheckCircle2, Paperclip, Upload, ScanLine, X } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useAccountsPayable } from '../hooks/useAccountsPayable'
import { apiFetch } from '../utils/api'

const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'Credit Card', 'GCash']
// Confirmed via pg_get_constraintdef on accounts_payable_status_check —
// same allowed set as accounts_receivable.
const STATUS_OPTIONS = ['Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled']
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_MB = 8

const EMPTY_FORM = {
  supplier_id: '', invoice_number: '', invoice_date: '', due_date: '', amount: '',
  payment_method: 'Bank Transfer', billing_address: '', description: '', reference_number: '',
  status: 'Pending', purchase_order_no: '', has_attachment: false,
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Pending: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  'Partially Paid': 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Paid: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Overdue: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  Cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
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
function BillScanUpload({ onScanned }) {
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'scanning' | 'done'
  const inputRef = useRef(null)

  const processFile = (file) => {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Please upload a JPG, PNG, or WEBP photo or scan of the bill.')
      return
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_IMAGE_MB}MB.`)
      return
    }
    setError('')
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
        // Real rejection from the OCR service (no receipt-like text found),
        // not a random guess.
        setError(json.message || "Couldn't read this image. Please fill in the details manually.")
        setStatus('idle')
        setPreview(null)
        return
      }

      onScanned({
        invoice_number: json.data.invoice_number || '',
        invoice_date: json.data.invoice_date || '',
        due_date: json.data.due_date || '',
        amount: json.data.amount || '',
        reference_number: json.data.reference_no || '',
      })
      setStatus('done')
    } catch (err) {
      setError('Failed to reach the scan service. Please fill in the details manually.')
      setStatus('idle')
      setPreview(null)
    }
  }

  const clearImage = () => {
    setPreview(null)
    setStatus('idle')
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <ScanLine size={15} className="text-primary-dark shrink-0" />
        <p className="text-xs font-semibold text-ink">Upload bill photo to auto-fill this form</p>
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
          <p className="text-[11px] text-muted">JPG, PNG or WEBP, up to {MAX_IMAGE_MB}MB</p>
          <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} onChange={(e) => processFile(e.target.files?.[0])} className="hidden" />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-bg p-2">
          <img src={preview} alt="Bill preview" className="h-14 w-14 rounded-md object-cover shrink-0 border border-border" />
          <div className="min-w-0 flex-1">
            {status === 'scanning' && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                </span>
                Reading bill details...
              </p>
            )}
            {status === 'done' && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 size={13} /> Fields filled below — please review before saving
              </p>
            )}
          </div>
          <button type="button" onClick={clearImage} aria-label="Remove image" className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink transition-colors duration-150">
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
    formSaving,
    formError,
    actionBusyId,
    createBill,
    updateBill,
    archiveBill,
    restoreBill,
    approveBill,
  } = useAccountsPayable()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formValidationError, setFormValidationError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)

  const supplierName = (id) => suppliers.find((s) => s.supplier_id === Number(id))?.supplier_name || 'Unknown'

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

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, supplier_id: suppliers[0]?.supplier_id ?? '' })
    setFormValidationError('')
    setModalMode('add')
  }
  const openEdit = (r) => {
    setForm({
      supplier_id: r.supplier_id,
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
      has_attachment: r.has_attachment,
    })
    setFormValidationError('')
    setModalMode(r)
  }
  const closeModal = () => { setModalMode(null); setFormValidationError('') }
  const openDetail = (r) => setDetailRecord(r)
  const closeDetail = () => setDetailRecord(null)

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
      reference_number: f.reference_number || extracted.reference_number,
    }))
  }

  const handlePrint = (r) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Supplier', supplierName(r.supplier_id)],
      ['Invoice Date', formatDate(r.invoice_date)],
      ['Due Date', formatDate(r.due_date)],
      ['Purchase Order No.', r.purchase_order_no || '—'],
      ['Original Amount', formatCurrency(r.amount)],
      ['Paid Amount', formatCurrency(r.paid_amount)],
      ['Remaining Balance', formatCurrency(r.remaining_balance)],
      ['Payment Method', r.payment_method || '—'],
      ['Billing Address', r.billing_address || '—'],
      ['Description', r.description || '—'],
      ['Reference No.', r.reference_number || '—'],
      ['Status', r.status],
    ]
    win.document.write(`
      <html>
        <head>
          <title>${r.invoice_number}</title>
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
            <div><h1>Bill ${r.invoice_number}</h1><p>${supplierName(r.supplier_id)}</p></div>
            <span class="status">${r.status}</span>
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormValidationError('')
    if (!form.invoice_number.trim() || !form.due_date || !form.amount) {
      setFormValidationError('Invoice number, due date, and amount are required.')
      return
    }

    const payload = {
      supplier_id: Number(form.supplier_id),
      invoice_number: form.invoice_number.trim(),
      invoice_date: form.invoice_date || null,
      due_date: form.due_date,
      amount: Number(form.amount) || 0,
      payment_method: form.payment_method,
      billing_address: form.billing_address.trim(),
      description: form.description.trim(),
      reference_number: form.reference_number.trim(),
      status: form.status,
      purchase_order_no: form.purchase_order_no.trim(),
      has_attachment: form.has_attachment,
    }

    const result = modalMode === 'add'
      ? await createBill(payload)
      : await updateBill(modalMode.ap_id, payload)

    if (result.success) closeModal()
  }

  const handleApprove = async (r) => {
    const result = await approveBill(r.ap_id)
    if (result.success && detailRecord?.ap_id === r.ap_id) {
      setDetailRecord(result.bill)
    }
  }

  const statCards = [
    { key: 'total', label: 'Total Bills', value: stats.total, icon: FileText, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'payable', label: 'Payable Amount', value: formatCurrency(stats.payable), icon: Wallet, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
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
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd} disabled={suppliersLoading}>Add Bill</Button>
      </div>

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
              className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={18} className={card.iconColor} />
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
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
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Bill</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Supplier</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Due Date</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Original → Balance</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {billsLoading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">Loading bills…</td></tr>
              )}

              {!billsLoading && filtered.map((r) => (
                <tr key={r.ap_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-ink">{r.invoice_number}</p>
                      {r.has_attachment && <Paperclip size={12} className="text-muted shrink-0" />}
                    </div>
                    <p className="text-xs text-muted truncate max-w-55">{r.description}</p>
                  </td>
                  <td className="px-4 py-3.5 text-ink whitespace-nowrap">{r.supplier_name || supplierName(r.supplier_id)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(r.due_date)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap tabular-nums">
                    <span className="text-ink font-medium">{formatCurrency(r.remaining_balance)}</span>
                    {r.paid_amount > 0 && (
                      <span className="block text-xs text-muted line-through">{formatCurrency(r.amount)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] || 'bg-gray-100 text-muted'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip label="View full record" align="start">
                        <button type="button" onClick={() => openDetail(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Print bill" align="start">
                        <button type="button" onClick={() => handlePrint(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Printer size={15} />
                        </button>
                      </Tooltip>
                      {!r.is_archived && (
                        <Tooltip label="Edit bill" align="start">
                          <button type="button" onClick={() => openEdit(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip>
                      )}
                      <Tooltip label={r.is_archived ? 'Restore bill' : 'Archive bill'} align="end">
                        <button
                          type="button"
                          onClick={() => (r.is_archived ? restoreBill(r.ap_id) : archiveBill(r.ap_id))}
                          disabled={actionBusyId === r.ap_id}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50"
                        >
                          {r.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                        </button>
                      </Tooltip>
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

          {!isEditing && <BillScanUpload onScanned={handleScanned} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Supplier</label>
              <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))} className={INPUT}>
                {suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Invoice Number</label>
              <input type="text" value={form.invoice_number} onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))} className={INPUT} placeholder="SUP-INV-3301" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Invoice Date</label>
              <input type="date" value={form.invoice_date} onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Original Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={INPUT} placeholder="0.00" />
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
              <label className={LABEL}>Reference Number</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))} className={INPUT} placeholder="REF-AP-001" />
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
          <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_attachment}
              onChange={(e) => setForm((f) => ({ ...f, has_attachment: e.target.checked }))}
              className="rounded border-border accent-primary"
            />
            Has a supporting document attached
          </label>

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
            {detailRecord && !detailRecord.approved_by && !detailRecord.is_archived && (
              <Button
                variant="secondary"
                size="md"
                icon={CheckCircle2}
                loading={actionBusyId === detailRecord.ap_id}
                onClick={() => handleApprove(detailRecord)}
              >
                Approve
              </Button>
            )}
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Bill</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.invoice_number}</p>
                <p className="text-xs text-muted">{detailRecord.supplier_name || supplierName(detailRecord.supplier_id)}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status] || 'bg-gray-100 text-muted'}`}>{detailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
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
          </div>
        )}
      </Modal>
    </div>
  )
}