import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Receipt, Wallet, AlertTriangle, Info, Printer, Upload, ScanLine, X, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useAccountsReceivable } from '../hooks/useAccountsReceivable'
import { apiFetch } from '../utils/api'
import { usePermissions } from '../context/PermissionsContext'

const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'Credit Card', 'GCash']
const STATUS_OPTIONS = ['Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled']
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_MB = 8
const PAGE_SIZE = 10

const EMPTY_FORM = { customer_id: '', collector_id: '', invoice_number: '', invoice_date: '', due_date: '', original_amount: '', balance: '', payment_method: 'Bank Transfer', payment_terms: 'Net 30', purchase_order_no: '', reference_no: '', penalty_rate: '', remarks: '', status: 'Pending' }

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

/**
 * Lightweight fetch-on-mount lookups for the form's dropdowns — same
 * pattern used for collectors/budgets/categories elsewhere.
 */
function useLookup(path) {
  const [options, setOptions] = useState([])

  useEffect(() => {
    let cancelled = false
    apiFetch(path)
      .then((res) => res.json())
      .then((json) => { if (!cancelled && json.success) setOptions(json.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [path])

  return options
}

// Read-only "detail row" used inside the record info panel — keeps every DB
// column visible somewhere in the UI even when it isn't part of the editable form.
function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-ink text-right">{value ?? '—'}</span>
    </div>
  )
}

// Upload + scan panel shown at the top of the Add/Edit form. Owns its own
// image/drag-state; calls onScanned(fields) once the "scan" resolves so the
// parent form can be auto-filled.
function InvoiceScanUpload({ onScanned }) {
  const [preview, setPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'scanning' | 'done'
  const inputRef = useRef(null)

  const processFile = (file) => {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Please upload a JPG, PNG, or WEBP photo or scan of the invoice.')
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
        setError(json.message || "Couldn't read this image. Please fill in the details manually.")
        setStatus('idle')
        setPreview(null)
        return
      }

      onScanned({
        invoice_number: json.data.invoice_number || '',
        invoice_date: json.data.invoice_date || '',
        due_date: json.data.due_date || '',
        original_amount: json.data.amount || '',
        balance: json.data.amount || '',
        reference_no: json.data.reference_no || '',
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
        <p className="text-xs font-semibold text-ink">Upload invoice photo to auto-fill this form</p>
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
          <img src={preview} alt="Invoice preview" className="h-14 w-14 rounded-md object-cover shrink-0 border border-border" />
          <div className="min-w-0 flex-1">
            {status === 'scanning' && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                </span>
                Reading invoice details...
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

export default function AccountsReceivable({ title = 'Accounts Receivable', crumbs = ['Financial Transactions', 'Accounts Receivable'] }) {
  const { records, loading, saving, error, fetchRecords, createRecord, updateRecord, toggleArchive } = useAccountsReceivable()
  const { hasPermission } = usePermissions()
  // Backend gates POST/PUT/toggle-archive on accounts-receivable behind
  // ar.manage — Collector only has ar.view (see RolesAndPermissionsSeeder),
  // so Add/Edit/Archive buttons are hidden rather than shown-then-403ing.
  const canManage = hasPermission('ar.manage')
  const customers = useLookup('/api/customers')
  const users = useLookup('/api/users')
  const collectors = useLookup('/api/collectors?archived=0&per_page=200')

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const [detailRecord, setDetailRecord] = useState(null)

  const customerName = (id) => {
    const found = records.find((r) => r.customer_id === Number(id))
    if (found?.customer_name) return found.customer_name
    return customers.find((c) => c.customer_id === Number(id))?.customer_name || 'Unknown'
  }

  const userName = (id) => {
    const u = users.find((u) => u.user_id === Number(id))
    return u ? `${u.first_name} ${u.last_name}` : '—'
  }

  const collectorName = (id) => {
    if (!id) return 'Unassigned'
    const found = records.find((r) => r.collector_id === Number(id))
    if (found?.collector_name) return found.collector_name
    const c = collectors.find((c) => c.collector_id === Number(id))
    return c ? `${c.first_name} ${c.last_name}` : 'Unassigned'
  }

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (!showArchived && r.is_archived) return false
      if (showArchived && !r.is_archived) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      const q = search.toLowerCase()
      if (search && !r.invoice_number.toLowerCase().includes(q) && !customerName(r.customer_id).toLowerCase().includes(q) && !(r.reference_no || '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [records, search, statusFilter, showArchived])

  // Pagination is purely client-side over `filtered` — consistent with the
  // rest of this page's filtering, which already runs entirely in-browser
  // against the full `records` array (no server-side paging exists here).
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, showArchived])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )
  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length)

  const stats = useMemo(() => {
    const active = records.filter((r) => !r.is_archived)
    return {
      total: active.length,
      outstanding: active.reduce((sum, r) => sum + r.balance, 0),
      overdue: active.filter((r) => r.status === 'Overdue').length,
      archived: records.filter((r) => r.is_archived).length,
    }
  }, [records])

  const handleToggleArchive = async (id) => {
    await toggleArchive(id)
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, customer_id: customers[0]?.customer_id ?? '' })
    setFormError('')
    setModalMode('add')
  }
  const openEdit = (r) => {
    setForm({ customer_id: r.customer_id, collector_id: r.collector_id || '', invoice_number: r.invoice_number, invoice_date: r.invoice_date, due_date: r.due_date, original_amount: r.original_amount, balance: r.balance, payment_method: r.payment_method, payment_terms: r.payment_terms, purchase_order_no: r.purchase_order_no, reference_no: r.reference_no, penalty_rate: r.penalty_rate, remarks: r.remarks, status: r.status })
    setFormError('')
    setModalMode(r)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const openDetail = (r) => setDetailRecord(r)
  const closeDetail = () => setDetailRecord(null)

  // Merges scanned fields into the form without clobbering anything the user
  // already typed by hand.
  const handleScanned = (extracted) => {
    setForm((f) => ({
      ...f,
      invoice_number: f.invoice_number || extracted.invoice_number,
      invoice_date: f.invoice_date || extracted.invoice_date,
      due_date: f.due_date || extracted.due_date,
      original_amount: f.original_amount || extracted.original_amount,
      balance: f.balance || extracted.balance,
      payment_terms: f.payment_terms || extracted.payment_terms,
      reference_no: f.reference_no || extracted.reference_no,
    }))
  }

  const handlePrint = (r) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Invoice Number', r.invoice_number],
      ['Customer', customerName(r.customer_id)],
      ['Collector', collectorName(r.collector_id)],
      ['Invoice Date', formatDate(r.invoice_date)],
      ['Due Date', formatDate(r.due_date)],
      ['Payment Method', r.payment_method],
      ['Payment Terms', r.payment_terms],
      ['Purchase Order No.', r.purchase_order_no || '—'],
      ['Reference No.', r.reference_no || '—'],
      ['Original Amount', formatCurrency(r.original_amount)],
      ['Balance', formatCurrency(r.balance)],
      ...(r.penalty_rate ? [['Penalty', `${r.penalty_rate}% (${formatCurrency(r.penalty_amount)})`]] : []),
      ['Status', r.status],
      ...(r.remarks ? [['Remarks', r.remarks]] : []),
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
            <div>
              <h1>${r.invoice_number}</h1>
              <p>${customerName(r.customer_id)}</p>
            </div>
            <span class="status">${r.status}</span>
          </div>
          <table>
            ${rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('')}
          </table>
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
    if (!form.customer_id || !form.invoice_number.trim() || !form.due_date || !form.original_amount) {
      setFormError('Customer, invoice number, due date, and original amount are required.')
      return
    }
    setFormError('')

    const payload = {
      customer_id: Number(form.customer_id),
      collector_id: form.collector_id ? Number(form.collector_id) : null,
      invoice_number: form.invoice_number.trim(),
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      original_amount: Number(form.original_amount) || 0,
      balance: form.balance === '' ? undefined : Number(form.balance),
      payment_method: form.payment_method,
      payment_terms: form.payment_terms,
      purchase_order_no: form.purchase_order_no,
      reference_no: form.reference_no,
      penalty_rate: form.penalty_rate === '' ? undefined : Number(form.penalty_rate),
      remarks: form.remarks,
      status: form.status,
    }

    const result = modalMode === 'add'
      ? await createRecord(payload)
      : await updateRecord(modalMode.ar_id, payload)

    if (!result.success) {
      setFormError(result.message || 'Failed to save invoice.')
      return
    }
    closeModal()
  }

  const statCards = [
    { key: 'total', label: 'Total Invoices', value: stats.total, icon: Receipt, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'outstanding', label: 'Outstanding Balance', value: formatCurrency(stats.outstanding), icon: Wallet, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
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
          <p className="mt-1 text-xs text-muted">Track customer invoices, balances, and aging.</p>
        </div>
        {/* Add Invoice hidden entirely for view-only roles (Collector) —
            the backend POST route requires ar.manage, which they don't have. */}
        {canManage && <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Invoice</Button>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
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
                <p className="text-lg font-bold text-ink">{loading ? '—' : card.value}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice no., customer, or reference..." className={`${INPUT} pl-9`} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
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

      {/* max-h + overflow-y-auto gives the sticky header a scroll container
          to stick within — without this, "sticky" has nothing to pin
          against once the whole page (not just the table) is what scrolls. */}
      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Invoice</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Customer / Collector</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Terms / PO</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Due Date</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Original / Balance</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Penalty</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">Loading invoices…</td></tr>
              )}
              {!loading && paginated.map((r) => (
                <tr key={r.ar_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{r.invoice_number}</p>
                    <p className="text-xs text-muted">{r.reference_no} &middot; {r.payment_method}</p>
                  </td>
                  <td className="px-4 py-3.5 text-ink whitespace-nowrap">
                    <p>{customerName(r.customer_id)}</p>
                    <p className={`text-xs ${r.collector_id ? 'text-muted' : 'text-amber-600 dark:text-amber-400'}`}>{collectorName(r.collector_id)}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink text-xs">
                    <p>{r.payment_terms}</p>
                    <p className="text-muted">{r.purchase_order_no}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink">
                    <p>{formatDate(r.due_date)}</p>
                    <p className="text-xs text-muted">Inv: {formatDate(r.invoice_date)}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <p className="text-ink tabular-nums">{formatCurrency(r.original_amount)}</p>
                    <p className="text-xs text-muted tabular-nums">Bal: {formatCurrency(r.balance)}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                    {r.penalty_rate > 0 ? (
                      <>
                        <p className="text-red-600 dark:text-red-400 tabular-nums">{r.penalty_rate}%</p>
                        <p className="text-muted tabular-nums">{formatCurrency(r.penalty_amount)}</p>
                      </>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip label="View full record" align="start">
                        <button type="button" onClick={() => openDetail(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Print invoice" align="start">
                        <button type="button" onClick={() => handlePrint(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Printer size={15} />
                        </button>
                      </Tooltip>
                      {/* Edit and Archive/Restore both hit ar.manage-gated
                          routes — hidden for view-only roles like Collector. */}
                      {canManage && (
                        <Tooltip label="Edit invoice" align="start">
                          <button type="button" onClick={() => openEdit(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip>
                      )}
                      {canManage && (
                        <Tooltip label={r.is_archived ? 'Restore invoice' : 'Archive invoice'} align="end">
                          <button type="button" onClick={() => handleToggleArchive(r.ar_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            {r.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">No invoices match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              Showing {rangeStart}–{rangeEnd} of {filtered.length} invoices
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="px-2 text-xs font-medium text-ink whitespace-nowrap">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit modal — editable business fields only. Only ever
          reachable via openAdd/openEdit, both of which are now behind
          canManage-gated buttons — kept unconditionally rendered here
          since Modal's own `open` prop already controls visibility. */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Invoice' : 'Add Invoice'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" loading={saving} onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Invoice'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}

          {!isEditing && <InvoiceScanUpload onScanned={handleScanned} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Customer</label>
              <select value={form.customer_id} onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))} className={INPUT}>
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Invoice Number</label>
              <input type="text" value={form.invoice_number} onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))} className={INPUT} placeholder="INV-2026-0001" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Collector</label>
            <select value={form.collector_id} onChange={(e) => setForm((f) => ({ ...f, collector_id: e.target.value }))} className={INPUT}>
              <option value="">Unassigned</option>
              {collectors.map((c) => <option key={c.collector_id} value={c.collector_id}>{c.first_name} {c.last_name}</option>)}
            </select>
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
              <input type="number" value={form.original_amount} onChange={(e) => setForm((f) => ({ ...f, original_amount: e.target.value }))} className={INPUT} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>Balance</label>
              <input type="number" value={form.balance} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} className={INPUT} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className={INPUT}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Payment Terms</label>
              <input type="text" value={form.payment_terms} onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))} className={INPUT} placeholder="Net 30" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Purchase Order No.</label>
              <input type="text" value={form.purchase_order_no} onChange={(e) => setForm((f) => ({ ...f, purchase_order_no: e.target.value }))} className={INPUT} placeholder="PO-5521" />
            </div>
            <div>
              <label className={LABEL}>Reference No.</label>
              <input type="text" value={form.reference_no} onChange={(e) => setForm((f) => ({ ...f, reference_no: e.target.value }))} className={INPUT} placeholder="REF-AR-001" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Penalty Rate (%)</label>
              <input type="number" step="0.1" value={form.penalty_rate} onChange={(e) => setForm((f) => ({ ...f, penalty_rate: e.target.value }))} className={INPUT} placeholder="0" />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
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

      {/* Full record detail modal — surfaces every column from the accounts_receivable table */}
      <Modal
        open={!!detailRecord}
        onClose={closeDetail}
        title="Invoice Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && (
              <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Invoice</Button>
            )}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.invoice_number}</p>
                <p className="text-xs text-muted">{customerName(detailRecord.customer_id)}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status]}`}>{detailRecord.status}</span>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Invoice Number" value={detailRecord.invoice_number} />
                <DetailRow label="Invoice Date" value={formatDate(detailRecord.invoice_date)} />
                <DetailRow label="Due Date" value={formatDate(detailRecord.due_date)} />
                <DetailRow label="Collector" value={collectorName(detailRecord.collector_id)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Original Amount" value={formatCurrency(detailRecord.original_amount)} />
                <DetailRow label="Balance" value={formatCurrency(detailRecord.balance)} />
                <DetailRow label="Payment Method" value={detailRecord.payment_method} />
                <DetailRow label="Payment Terms" value={detailRecord.payment_terms} />
                <DetailRow label="Purchase Order No." value={detailRecord.purchase_order_no} />
                <DetailRow label="Reference No." value={detailRecord.reference_no} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Penalty Rate" value={detailRecord.penalty_rate ? `${detailRecord.penalty_rate}%` : '—'} />
                <DetailRow label="Penalty Amount" value={formatCurrency(detailRecord.penalty_amount)} />
                <DetailRow label="Remarks" value={detailRecord.remarks || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={userName(detailRecord.created_by)} />
                <DetailRow label="Created at" value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(detailRecord.updated_at)} />
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