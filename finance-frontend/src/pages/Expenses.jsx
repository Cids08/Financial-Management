import { useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Receipt, Wallet, Tag, Info, Printer } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'

const BUDGETS = [
  { budget_id: 1, label: 'Operations — FY2026' },
  { budget_id: 2, label: 'Sales & Marketing — FY2026' },
  { budget_id: 3, label: 'IT — FY2026' },
  { budget_id: 4, label: 'Human Resources — FY2026' },
]
const SUPPLIERS = [
  { supplier_id: 0, supplier_name: 'N/A' },
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
const budgetLabel = (id) => BUDGETS.find((b) => b.budget_id === Number(id))?.label || 'Unknown'
const supplierName = (id) => SUPPLIERS.find((s) => s.supplier_id === Number(id))?.supplier_name || 'N/A'
const userName = (id) => {
  const u = USERS.find((u) => u.user_id === Number(id))
  return u ? `${u.first_name} ${u.last_name}` : '—'
}

const EXPENSE_CATEGORIES = ['Office Supplies', 'Utilities', 'Travel', 'Marketing', 'Maintenance', 'Professional Fees', 'Other']

const initialExpenses = [
  { expense_id: 1, budget_id: 1, expense_date: '2026-07-10', expense_category: 'Maintenance', description: 'Delivery truck servicing', amount: 18500, receipt_number: 'RCPT-4401', supplier_id: 0, created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-10T09:00:00', updated_at: '2026-07-10T09:00:00' },
  { expense_id: 2, budget_id: 2, expense_date: '2026-07-15', expense_category: 'Marketing', description: 'Social media ad spend', amount: 65000, receipt_number: 'RCPT-4412', supplier_id: 0, created_by: 2, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-15T10:20:00', updated_at: '2026-07-15T10:20:00' },
  { expense_id: 3, budget_id: 3, expense_date: '2026-07-18', expense_category: 'Office Supplies', description: 'Laptop peripherals restock', amount: 12300, receipt_number: 'RCPT-4420', supplier_id: 5, created_by: 3, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-18T11:00:00', updated_at: '2026-07-18T11:00:00' },
  { expense_id: 4, budget_id: 4, expense_date: '2026-07-05', expense_category: 'Professional Fees', description: 'Recruitment agency fee', amount: 40000, receipt_number: 'RCPT-4390', supplier_id: 0, created_by: 2, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-05T13:30:00', updated_at: '2026-07-05T13:30:00' },
  { expense_id: 5, budget_id: 1, expense_date: '2026-06-01', expense_category: 'Utilities', description: 'Warehouse electricity bill', amount: 22750, receipt_number: 'RCPT-4350', supplier_id: 0, created_by: 1, is_archived: true, archived_at: '2026-07-29T09:00:00', archived_by: 1, created_at: '2026-06-01T08:00:00', updated_at: '2026-07-29T09:00:00' },
]

const EMPTY_FORM = { budget_id: BUDGETS[0].budget_id, expense_date: '', expense_category: EXPENSE_CATEGORIES[0], description: '', amount: '', receipt_number: '', supplier_id: 0 }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const CATEGORY_STYLES = 'bg-primary/10 text-primary-dark dark:bg-primary/15'

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

export default function Expenses({ title = 'Expenses', crumbs = ['Financial Transactions', 'Expenses'] }) {
  const [expenses, setExpenses] = useState(initialExpenses)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)

  const filtered = useMemo(() => {
    return expenses.filter((x) => {
      if (!showArchived && x.is_archived) return false
      if (showArchived && !x.is_archived) return false
      if (categoryFilter !== 'all' && x.expense_category !== categoryFilter) return false
      const q = search.toLowerCase()
      if (search && !x.description.toLowerCase().includes(q) && !x.receipt_number.toLowerCase().includes(q)) return false
      return true
    })
  }, [expenses, search, categoryFilter, showArchived])

  const stats = useMemo(() => {
    const active = expenses.filter((x) => !x.is_archived)
    const thisMonth = active.filter((x) => x.expense_date?.startsWith('2026-07'))
    return {
      total: active.length,
      totalAmount: active.reduce((sum, x) => sum + x.amount, 0),
      thisMonth: thisMonth.reduce((sum, x) => sum + x.amount, 0),
      archived: expenses.filter((x) => x.is_archived).length,
    }
  }, [expenses])

  const toggleArchive = (id) => {
    setExpenses((prev) => prev.map((x) => {
      if (x.expense_id !== id) return x
      const nextArchived = !x.is_archived
      return { ...x, is_archived: nextArchived, archived_at: nextArchived ? new Date().toISOString() : null, archived_by: nextArchived ? 1 : null, updated_at: new Date().toISOString() }
    }))
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (x) => {
    setForm({ budget_id: x.budget_id, expense_date: x.expense_date, expense_category: x.expense_category, description: x.description, amount: x.amount, receipt_number: x.receipt_number, supplier_id: x.supplier_id })
    setFormError('')
    setModalMode(x)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const openDetail = (x) => setDetailRecord(x)
  const closeDetail = () => setDetailRecord(null)

  const handlePrint = (x) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Budget', budgetLabel(x.budget_id)],
      ['Expense Date', formatDate(x.expense_date)],
      ['Category', x.expense_category],
      ['Amount', formatCurrency(x.amount)],
      ['Receipt No.', x.receipt_number || '—'],
      ['Supplier', supplierName(x.supplier_id)],
      ['Description', x.description || '—'],
    ]
    win.document.write(`
      <html>
        <head>
          <title>${x.receipt_number}</title>
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
            <div><h1>Expense Slip</h1><p>${x.description}</p></div>
            <span class="status">${x.expense_category}</span>
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
    if (!form.description.trim() || !form.expense_date || !form.amount) {
      setFormError('Description, date, and amount are required.')
      return
    }
    const payload = { ...form, budget_id: Number(form.budget_id), supplier_id: Number(form.supplier_id), amount: Number(form.amount) || 0 }
    const now = new Date().toISOString()
    if (modalMode === 'add') {
      const nextId = Math.max(0, ...expenses.map((x) => x.expense_id)) + 1
      setExpenses((prev) => [...prev, { expense_id: nextId, ...payload, created_by: 1, is_archived: false, archived_at: null, archived_by: null, created_at: now, updated_at: now }])
    } else if (modalMode) {
      const editingId = modalMode.expense_id
      setExpenses((prev) => prev.map((x) => (x.expense_id === editingId ? { ...x, ...payload, updated_at: now } : x)))
    }
    closeModal()
  }

  const statCards = [
    { key: 'total', label: 'Total Expenses', value: stats.total, icon: Receipt, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: categoryFilter === 'all' && !showArchived, onClick: () => { setCategoryFilter('all'); setShowArchived(false) } },
    { key: 'totalAmount', label: 'Total Amount', value: formatCurrency(stats.totalAmount), icon: Wallet, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => { setCategoryFilter('all'); setShowArchived(false) } },
    { key: 'thisMonth', label: 'This Month (Jul)', value: formatCurrency(stats.thisMonth), icon: Tag, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => { setCategoryFilter('all'); setShowArchived(false) } },
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
          <p className="mt-1 text-xs text-muted">Log expenses charged against department budgets.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Expense</Button>
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
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by description or receipt no..." className={`${INPUT} pl-9`} />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={INPUT}>
          <option value="all">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Expense</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Budget</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Category</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Date</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((x) => (
                <tr key={x.expense_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{x.description}</p>
                    <p className="text-xs text-muted">{x.receipt_number} {x.supplier_id ? `\u00b7 ${supplierName(x.supplier_id)}` : ''}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink text-xs">{budgetLabel(x.budget_id)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_STYLES}`}>{x.expense_category}</span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(x.expense_date)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(x.amount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip label="View full record" align="start">
                        <button type="button" onClick={() => openDetail(x)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Print expense slip" align="start">
                        <button type="button" onClick={() => handlePrint(x)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Printer size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Edit expense" align="start">
                        <button type="button" onClick={() => openEdit(x)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Pencil size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label={x.is_archived ? 'Restore expense' : 'Archive expense'} align="end">
                        <button type="button" onClick={() => toggleArchive(x.expense_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          {x.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No expenses match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Expense' : 'Add Expense'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Expense'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Budget</label>
              <select value={form.budget_id} onChange={(e) => setForm((f) => ({ ...f, budget_id: e.target.value }))} className={INPUT}>
                {BUDGETS.map((b) => <option key={b.budget_id} value={b.budget_id}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Category</label>
              <select value={form.expense_category} onChange={(e) => setForm((f) => ({ ...f, expense_category: e.target.value }))} className={INPUT}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={INPUT} placeholder="What this expense was for" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Expense Date</label>
              <input type="date" value={form.expense_date} onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={INPUT} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Receipt Number</label>
              <input type="text" value={form.receipt_number} onChange={(e) => setForm((f) => ({ ...f, receipt_number: e.target.value }))} className={INPUT} placeholder="RCPT-4401" />
            </div>
            <div>
              <label className={LABEL}>Supplier (optional)</label>
              <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))} className={INPUT}>
                {SUPPLIERS.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
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
        title="Expense Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Slip</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.description}</p>
                <p className="text-xs text-muted">{budgetLabel(detailRecord.budget_id)}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_STYLES}`}>{detailRecord.expense_category}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Expense Date" value={formatDate(detailRecord.expense_date)} />
                <DetailRow label="Amount" value={formatCurrency(detailRecord.amount)} />
                <DetailRow label="Receipt No." value={detailRecord.receipt_number} />
                <DetailRow label="Supplier" value={supplierName(detailRecord.supplier_id)} />
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