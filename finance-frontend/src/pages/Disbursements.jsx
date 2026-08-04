import { useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Send, CheckCircle2, Clock3, Wallet, Info, Printer } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'

const AP_RECORDS = [
  { ap_id: 1, invoice_number: 'SUP-INV-3301', supplier_name: 'Northgate Supplies Inc.' },
  { ap_id: 2, invoice_number: 'SUP-INV-3312', supplier_name: 'Pinnacle Freight Co.' },
  { ap_id: 3, invoice_number: 'SUP-INV-3325', supplier_name: 'Coastal Steel Traders' },
  { ap_id: 4, invoice_number: 'SUP-INV-3298', supplier_name: 'Alliance Fuel Depot' },
  { ap_id: 5, invoice_number: 'SUP-INV-3270', supplier_name: 'Sunrise Office Depot' },
]
const DEPARTMENTS = [
  { department_id: 1, department_name: 'Finance' },
  { department_id: 2, department_name: 'Operations' },
  { department_id: 3, department_name: 'Sales & Marketing' },
  { department_id: 4, department_name: 'IT' },
  { department_id: 5, department_name: 'Human Resources' },
]
const CASH_ACCOUNTS = [
  { cash_account_id: 1, account_name: 'BDO Operating Account' },
  { cash_account_id: 2, account_name: 'BPI Payroll Account' },
  { cash_account_id: 3, account_name: 'Metrobank Reserve Fund' },
  { cash_account_id: 4, account_name: 'Head Office Petty Cash' },
]
const USERS = [
  { user_id: 1, first_name: 'Ana', last_name: 'Reyes' },
  { user_id: 2, first_name: 'Marco', last_name: 'Santos' },
  { user_id: 3, first_name: 'Liza', last_name: 'Fernandez' },
]
const apInfo = (id) => AP_RECORDS.find((a) => a.ap_id === Number(id))
const deptName = (id) => DEPARTMENTS.find((d) => d.department_id === Number(id))?.department_name || 'Unknown'
const accountName = (id) => CASH_ACCOUNTS.find((a) => a.cash_account_id === Number(id))?.account_name || 'Unknown'
const userName = (id) => {
  const u = USERS.find((u) => u.user_id === Number(id))
  return u ? `${u.first_name} ${u.last_name}` : '—'
}

const initialDisbursements = [
  { disbursement_id: 1, ap_id: 1, department_id: 2, cash_account_id: 1, payee: 'Northgate Supplies Inc.', payment_date: '2026-07-18', amount_paid: 98000, payment_method: 'Bank Transfer', reference_number: 'REF-DIS-001', status: 'Released', released_by: 1, approved_by: 3, approved_at: '2026-07-17T09:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-16T10:00:00', updated_at: '2026-07-18T14:00:00' },
  { disbursement_id: 2, ap_id: 2, department_id: 2, cash_account_id: 1, payee: 'Pinnacle Freight Co.', payment_date: '2026-07-22', amount_paid: 20000, payment_method: 'Check', reference_number: 'REF-DIS-002', status: 'Approved', released_by: null, approved_by: 3, approved_at: '2026-07-21T11:30:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-20T08:00:00', updated_at: '2026-07-21T11:30:00' },
  { disbursement_id: 3, ap_id: 3, department_id: 2, cash_account_id: 2, payee: 'Coastal Steel Traders', payment_date: '', amount_paid: 132000, payment_method: 'Bank Transfer', reference_number: 'REF-DIS-003', status: 'Pending', released_by: null, approved_by: null, approved_at: null, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-19T09:15:00', updated_at: '2026-07-19T09:15:00' },
  { disbursement_id: 4, ap_id: 4, department_id: 4, cash_account_id: 1, payee: 'Alliance Fuel Depot', payment_date: '2026-06-19', amount_paid: 76000, payment_method: 'Bank Transfer', reference_number: 'REF-DIS-004', status: 'Released', released_by: 2, approved_by: 3, approved_at: '2026-06-18T10:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-06-17T13:00:00', updated_at: '2026-06-19T15:30:00' },
  { disbursement_id: 5, ap_id: 5, department_id: 5, cash_account_id: 4, payee: 'Sunrise Office Depot', payment_date: '2026-05-10', amount_paid: 21000, payment_method: 'Cash', reference_number: 'REF-DIS-005', status: 'Rejected', released_by: null, approved_by: null, approved_at: null, is_archived: true, archived_at: '2026-07-26T09:00:00', archived_by: 1, created_at: '2026-05-08T09:00:00', updated_at: '2026-07-26T09:00:00' },
]

const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'GCash']
const STATUS_OPTIONS = ['Pending', 'Approved', 'Released', 'Rejected']

const EMPTY_FORM = { ap_id: AP_RECORDS[0].ap_id, department_id: DEPARTMENTS[0].department_id, cash_account_id: CASH_ACCOUNTS[0].cash_account_id, payee: '', payment_date: '', amount_paid: '', payment_method: 'Bank Transfer', reference_number: '', status: 'Pending' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Approved: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Released: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
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

export default function Disbursements({ title = 'Disbursements', crumbs = ['Financial Transactions', 'Disbursements'] }) {
  const [disbursements, setDisbursements] = useState(initialDisbursements)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)

  const filtered = useMemo(() => {
    return disbursements.filter((d) => {
      if (!showArchived && d.is_archived) return false
      if (showArchived && !d.is_archived) return false
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      const q = search.toLowerCase()
      if (search && !d.payee.toLowerCase().includes(q) && !d.reference_number.toLowerCase().includes(q)) return false
      return true
    })
  }, [disbursements, search, statusFilter, showArchived])

  const stats = useMemo(() => {
    const active = disbursements.filter((d) => !d.is_archived)
    return {
      total: active.length,
      released: active.filter((d) => d.status === 'Released').reduce((sum, d) => sum + d.amount_paid, 0),
      pending: active.filter((d) => d.status === 'Pending').length,
      archived: disbursements.filter((d) => d.is_archived).length,
    }
  }, [disbursements])

  const toggleArchive = (id) => {
    setDisbursements((prev) => prev.map((d) => {
      if (d.disbursement_id !== id) return d
      const nextArchived = !d.is_archived
      return { ...d, is_archived: nextArchived, archived_at: nextArchived ? new Date().toISOString() : null, archived_by: nextArchived ? 1 : null, updated_at: new Date().toISOString() }
    }))
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (d) => {
    setForm({ ap_id: d.ap_id, department_id: d.department_id, cash_account_id: d.cash_account_id, payee: d.payee, payment_date: d.payment_date, amount_paid: d.amount_paid, payment_method: d.payment_method, reference_number: d.reference_number, status: d.status })
    setFormError('')
    setModalMode(d)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const openDetail = (d) => setDetailRecord(d)
  const closeDetail = () => setDetailRecord(null)

  const handlePrint = (d) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const info = apInfo(d.ap_id)
    const rows = [
      ['Payee', d.payee],
      ['Related Bill', info?.invoice_number || '—'],
      ['Department', deptName(d.department_id)],
      ['Payment Date', formatDate(d.payment_date)],
      ['Amount Paid', formatCurrency(d.amount_paid)],
      ['Payment Method', d.payment_method],
      ['Cash Account', accountName(d.cash_account_id)],
      ['Reference No.', d.reference_number || '—'],
      ['Approved By', userName(d.approved_by)],
      ['Status', d.status],
    ]
    win.document.write(`
      <html>
        <head>
          <title>Disbursement Voucher ${d.reference_number}</title>
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
            <div><h1>Disbursement Voucher</h1><p>${d.payee}</p></div>
            <span class="status">${d.status}</span>
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
    if (!form.payee.trim() || !form.amount_paid) {
      setFormError('Payee and amount are required.')
      return
    }
    const payload = { ...form, ap_id: Number(form.ap_id), department_id: Number(form.department_id), cash_account_id: Number(form.cash_account_id), amount_paid: Number(form.amount_paid) || 0 }
    const now = new Date().toISOString()
    if (modalMode === 'add') {
      const nextId = Math.max(0, ...disbursements.map((d) => d.disbursement_id)) + 1
      setDisbursements((prev) => [...prev, { disbursement_id: nextId, ...payload, released_by: null, approved_by: null, approved_at: null, is_archived: false, archived_at: null, archived_by: null, created_at: now, updated_at: now }])
    } else if (modalMode) {
      const editingId = modalMode.disbursement_id
      setDisbursements((prev) => prev.map((d) => (d.disbursement_id === editingId ? { ...d, ...payload, updated_at: now } : d)))
    }
    closeModal()
  }

  const statCards = [
    { key: 'total', label: 'Total Disbursements', value: stats.total, icon: Send, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'released', label: 'Released Amount', value: formatCurrency(stats.released), icon: CheckCircle2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Released' && !showArchived, onClick: () => { setStatusFilter('Released'); setShowArchived(false) } },
    { key: 'pending', label: 'Pending', value: stats.pending, icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: statusFilter === 'Pending' && !showArchived, onClick: () => { setStatusFilter('Pending'); setShowArchived(false) } },
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
          <p className="mt-1 text-xs text-muted">Track outgoing payments released against supplier bills.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Disbursement</Button>
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
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by payee or reference..." className={`${INPUT} pl-9`} />
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
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Payee</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Bill / Department</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Payment Date</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const info = apInfo(d.ap_id)
                return (
                  <tr key={d.disbursement_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{d.payee}</p>
                      <p className="text-xs text-muted">{d.reference_number} &middot; {accountName(d.cash_account_id)}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink">{info?.invoice_number}</p>
                      <p className="text-xs text-muted">{deptName(d.department_id)}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(d.payment_date)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(d.amount_paid)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[d.status]}`}>{d.status}</span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="View full record" align="start">
                          <button type="button" onClick={() => openDetail(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Info size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Print voucher" align="start">
                          <button type="button" onClick={() => handlePrint(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Printer size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Edit disbursement" align="start">
                          <button type="button" onClick={() => openEdit(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label={d.is_archived ? 'Restore disbursement' : 'Archive disbursement'} align="end">
                          <button type="button" onClick={() => toggleArchive(d.disbursement_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            {d.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No disbursements match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Disbursement' : 'Add Disbursement'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Disbursement'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Related Bill</label>
              <select value={form.ap_id} onChange={(e) => setForm((f) => ({ ...f, ap_id: e.target.value }))} className={INPUT}>
                {AP_RECORDS.map((a) => <option key={a.ap_id} value={a.ap_id}>{a.invoice_number} — {a.supplier_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Department</label>
              <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} className={INPUT}>
                {DEPARTMENTS.map((dp) => <option key={dp.department_id} value={dp.department_id}>{dp.department_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Payee</label>
            <input type="text" value={form.payee} onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))} className={INPUT} placeholder="Northgate Supplies Inc." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Date</label>
              <input type="date" value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Amount Paid</label>
              <input type="number" value={form.amount_paid} onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))} className={INPUT} placeholder="0.00" />
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
              <label className={LABEL}>Cash Account</label>
              <select value={form.cash_account_id} onChange={(e) => setForm((f) => ({ ...f, cash_account_id: e.target.value }))} className={INPUT}>
                {CASH_ACCOUNTS.map((a) => <option key={a.cash_account_id} value={a.cash_account_id}>{a.account_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Reference Number</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))} className={INPUT} placeholder="REF-DIS-001" />
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
              <DetailRow label="Approved by" value={userName(modalMode.approved_by)} />
              <DetailRow label="Approved at" value={formatDateTime(modalMode.approved_at)} />
              <DetailRow label="Released by" value={userName(modalMode.released_by)} />
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
        title="Disbursement Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Voucher</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.payee}</p>
                <p className="text-xs text-muted">{apInfo(detailRecord.ap_id)?.invoice_number}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status]}`}>{detailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Department" value={deptName(detailRecord.department_id)} />
                <DetailRow label="Payment Date" value={formatDate(detailRecord.payment_date)} />
                <DetailRow label="Amount Paid" value={formatCurrency(detailRecord.amount_paid)} />
                <DetailRow label="Payment Method" value={detailRecord.payment_method} />
                <DetailRow label="Cash Account" value={accountName(detailRecord.cash_account_id)} />
                <DetailRow label="Reference No." value={detailRecord.reference_number} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Approved by" value={userName(detailRecord.approved_by)} />
                <DetailRow label="Approved at" value={formatDateTime(detailRecord.approved_at)} />
                <DetailRow label="Released by" value={userName(detailRecord.released_by)} />
              </div>
              <div className="px-3 py-2">
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