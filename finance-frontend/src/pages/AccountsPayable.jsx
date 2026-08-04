import { useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, FileText, Wallet, AlertTriangle, Info, Printer } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'

const SUPPLIERS = [
  { supplier_id: 1, supplier_name: 'Northgate Supplies Inc.' },
  { supplier_id: 2, supplier_name: 'Pinnacle Freight Co.' },
  { supplier_id: 3, supplier_name: 'Coastal Steel Traders' },
  { supplier_id: 4, supplier_name: 'Alliance Fuel Depot' },
  { supplier_id: 5, supplier_name: 'Sunrise Office Depot' },
]
const USERS = [
  { user_id: 1, first_name: 'Ana', last_name: 'Reyes' },
  { user_id: 2, first_name: 'Marco', last_name: 'Santos' },
  { user_id: 3, first_name: 'Liza', last_name: 'Fernandez' },
]
const supplierName = (id) => SUPPLIERS.find((s) => s.supplier_id === Number(id))?.supplier_name || 'Unknown'
const userName = (id) => {
  const u = USERS.find((u) => u.user_id === Number(id))
  return u ? `${u.first_name} ${u.last_name}` : '—'
}

const initialAP = [
  { ap_id: 1, supplier_id: 1, invoice_number: 'SUP-INV-3301', invoice_date: '2026-06-05', due_date: '2026-07-05', amount: 98000, payment_method: 'Bank Transfer', billing_address: 'Pasig City, Metro Manila', description: 'Raw materials Q3 order', reference_number: 'REF-AP-001', status: 'Overdue', created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-06-05T09:00:00', updated_at: '2026-07-25T10:00:00' },
  { ap_id: 2, supplier_id: 2, invoice_number: 'SUP-INV-3312', invoice_date: '2026-07-08', due_date: '2026-08-08', amount: 45000, payment_method: 'Check', billing_address: 'Mandaluyong City, Metro Manila', description: 'Freight services June', reference_number: 'REF-AP-002', status: 'Partial', created_by: 2, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-08T13:20:00', updated_at: '2026-07-22T09:40:00' },
  { ap_id: 3, supplier_id: 3, invoice_number: 'SUP-INV-3325', invoice_date: '2026-07-12', due_date: '2026-08-12', amount: 132000, payment_method: 'Bank Transfer', billing_address: 'Iloilo City, Iloilo', description: 'Steel supplies delivery', reference_number: 'REF-AP-003', status: 'Open', created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-12T10:15:00', updated_at: '2026-07-12T10:15:00' },
  { ap_id: 4, supplier_id: 4, invoice_number: 'SUP-INV-3298', invoice_date: '2026-05-20', due_date: '2026-06-20', amount: 76000, payment_method: 'Bank Transfer', billing_address: 'Cagayan de Oro, Misamis Oriental', description: 'Fuel supply May', reference_number: 'REF-AP-004', status: 'Paid', created_by: 3, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-05-20T08:30:00', updated_at: '2026-06-19T16:00:00' },
  { ap_id: 5, supplier_id: 5, invoice_number: 'SUP-INV-3270', invoice_date: '2026-04-18', due_date: '2026-05-18', amount: 21000, payment_method: 'Cash', billing_address: 'Taguig City, Metro Manila', description: 'Office supplies restock', reference_number: 'REF-AP-005', status: 'Overdue', created_by: 2, is_archived: true, archived_at: '2026-07-27T15:00:00', archived_by: 2, created_at: '2026-04-18T11:45:00', updated_at: '2026-07-27T15:00:00' },
]

const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'Credit Card', 'GCash']
const STATUS_OPTIONS = ['Open', 'Partial', 'Paid', 'Overdue']

const EMPTY_FORM = { supplier_id: SUPPLIERS[0].supplier_id, invoice_number: '', invoice_date: '', due_date: '', amount: '', payment_method: 'Bank Transfer', billing_address: '', description: '', reference_number: '', status: 'Open' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Open: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Partial: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
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

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-ink text-right">{value ?? '—'}</span>
    </div>
  )
}

export default function AccountsPayable({ title = 'Accounts Payable', crumbs = ['Financial Transactions', 'Accounts Payable'] }) {
  const [records, setRecords] = useState(initialAP)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (!showArchived && r.is_archived) return false
      if (showArchived && !r.is_archived) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      const q = search.toLowerCase()
      if (search && !r.invoice_number.toLowerCase().includes(q) && !supplierName(r.supplier_id).toLowerCase().includes(q) && !r.reference_number.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [records, search, statusFilter, showArchived])

  const stats = useMemo(() => {
    const active = records.filter((r) => !r.is_archived)
    return {
      total: active.length,
      payable: active.filter((r) => r.status !== 'Paid').reduce((sum, r) => sum + r.amount, 0),
      overdue: active.filter((r) => r.status === 'Overdue').length,
      archived: records.filter((r) => r.is_archived).length,
    }
  }, [records])

  const toggleArchive = (id) => {
    setRecords((prev) => prev.map((r) => {
      if (r.ap_id !== id) return r
      const nextArchived = !r.is_archived
      return { ...r, is_archived: nextArchived, archived_at: nextArchived ? new Date().toISOString() : null, archived_by: nextArchived ? 1 : null, updated_at: new Date().toISOString() }
    }))
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (r) => {
    setForm({ supplier_id: r.supplier_id, invoice_number: r.invoice_number, invoice_date: r.invoice_date, due_date: r.due_date, amount: r.amount, payment_method: r.payment_method, billing_address: r.billing_address, description: r.description, reference_number: r.reference_number, status: r.status })
    setFormError('')
    setModalMode(r)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const openDetail = (r) => setDetailRecord(r)
  const closeDetail = () => setDetailRecord(null)

  const handlePrint = (r) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Supplier', supplierName(r.supplier_id)],
      ['Invoice Date', formatDate(r.invoice_date)],
      ['Due Date', formatDate(r.due_date)],
      ['Amount', formatCurrency(r.amount)],
      ['Payment Method', r.payment_method],
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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.invoice_number.trim() || !form.due_date || !form.amount) {
      setFormError('Invoice number, due date, and amount are required.')
      return
    }
    const payload = { ...form, supplier_id: Number(form.supplier_id), amount: Number(form.amount) || 0 }
    const now = new Date().toISOString()
    if (modalMode === 'add') {
      const nextId = Math.max(0, ...records.map((r) => r.ap_id)) + 1
      setRecords((prev) => [...prev, { ap_id: nextId, ...payload, created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: now, updated_at: now }])
    } else if (modalMode) {
      const editingId = modalMode.ap_id
      setRecords((prev) => prev.map((r) => (r.ap_id === editingId ? { ...r, ...payload, updated_at: now } : r)))
    }
    closeModal()
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
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Bill</Button>
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
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={18} className={card.iconColor} />
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
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.ap_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{r.invoice_number}</p>
                    <p className="text-xs text-muted truncate max-w-55">{r.description}</p>
                  </td>
                  <td className="px-4 py-3.5 text-ink whitespace-nowrap">{supplierName(r.supplier_id)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(r.due_date)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(r.amount)}</td>
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
                      <Tooltip label="Print bill" align="start">
                        <button type="button" onClick={() => handlePrint(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Printer size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Edit bill" align="start">
                        <button type="button" onClick={() => openEdit(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Pencil size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label={r.is_archived ? 'Restore bill' : 'Archive bill'} align="end">
                        <button type="button" onClick={() => toggleArchive(r.ap_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          {r.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
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
            <Button variant="primary" size="md" onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Bill'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Supplier</label>
              <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))} className={INPUT}>
                {SUPPLIERS.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
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
              <label className={LABEL}>Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={INPUT} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className={INPUT}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Reference Number</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))} className={INPUT} placeholder="REF-AP-001" />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
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
        title="Bill Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Bill</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.invoice_number}</p>
                <p className="text-xs text-muted">{supplierName(detailRecord.supplier_id)}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status]}`}>{detailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Invoice Date" value={formatDate(detailRecord.invoice_date)} />
                <DetailRow label="Due Date" value={formatDate(detailRecord.due_date)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Amount" value={formatCurrency(detailRecord.amount)} />
                <DetailRow label="Payment Method" value={detailRecord.payment_method} />
                <DetailRow label="Billing Address" value={detailRecord.billing_address || '—'} />
                <DetailRow label="Reference No." value={detailRecord.reference_number} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Description" value={detailRecord.description || '—'} />
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