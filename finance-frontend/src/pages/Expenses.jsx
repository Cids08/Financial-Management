import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Receipt, Wallet, Tag, Info, Printer, CheckCircle2, XCircle, ChevronLeft, ChevronRight, CalendarRange, X } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { apiFetch } from '../utils/api'
import { useExpenses } from '../hooks/useExpenses'

const EMPTY_FORM = {
  budget_id: '',
  expense_category_id: '',
  expense_date: '',
  description: '',
  expense_amount: '',
  expense_source: '',
  receipt_number: '',
  receipt_status: 'Pending',
  supplier_id: '',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const CATEGORY_STYLES = 'bg-primary/10 text-primary-dark dark:bg-primary/15'
const STATUS_STYLES = {
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  Approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
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
    expenses, listLoading, listError, filters, setFilter, refetch,
    stats, statsLoading,
    mutating, mutateError,
    createExpense, updateExpense, approveExpense, rejectExpense, archiveExpense, restoreExpense,
  } = useExpenses()

  const { options: budgets } = useLookup('/api/budgets')
  const { options: categories } = useLookup('/api/expense-categories')
  const { options: suppliers } = useLookup('/api/suppliers')

  const budgetLabel = (id) => budgets.find((b) => b.id === Number(id))?.budget_name || '—'
  const categoryName = (id) => categories.find((c) => c.id === Number(id))?.category_name || '—'
  const supplierName = (id) => suppliers.find((s) => s.id === Number(id))?.supplier_name || 'N/A'

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

  // Client-side pagination over the currently-loaded/filtered expense list.
  // NOTE: this paginates whatever `expenses` already holds. If useExpenses /
  // the backend end up paginating server-side (Laravel's default paginator),
  // swap this for real page/meta state from the hook instead of slicing here.
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [filters.status, filters.expense_category_id, filters.trashed, filters.search, filters.expense_date_from, filters.expense_date_to])

  const totalPages = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE))
  const paginatedExpenses = useMemo(
    () => expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [expenses, page]
  )
  const rangeStart = expenses.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, expenses.length)

  const [modalMode, setModalMode] = useState(null) // 'add' | expense object | null
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectRemarks, setRejectRemarks] = useState('')

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (x) => {
    setForm({
      budget_id: x.budget_id,
      expense_category_id: x.expense_category_id,
      expense_date: x.expense_date,
      description: x.description,
      expense_amount: x.expense_amount,
      expense_source: x.expense_source,
      receipt_number: x.receipt_number || '',
      receipt_status: x.receipt_status,
      supplier_id: x.supplier_id || '',
    })
    setFormError('')
    setModalMode(x)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.description.trim() || !form.expense_date || !form.expense_amount || !form.budget_id || !form.expense_category_id || !form.expense_source.trim()) {
      setFormError('Budget, category, date, amount, source, and description are required.')
      return
    }
    const payload = {
      ...form,
      budget_id: Number(form.budget_id),
      expense_category_id: Number(form.expense_category_id),
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      expense_amount: Number(form.expense_amount) || 0,
    }
    const result = isEditing
      ? await updateExpense(modalMode.id, payload)
      : await createExpense(payload)

    if (result.success) {
      closeModal()
    } else {
      setFormError(result.message)
    }
  }

  const handleApprove = async (x) => { await approveExpense(x.id) }
  const openReject = (x) => { setRejectTarget(x); setRejectRemarks('') }
  const confirmReject = async () => {
    const result = await rejectExpense(rejectTarget.id, rejectRemarks)
    if (result.success) setRejectTarget(null)
  }
  const handleArchive = async (x) => { await archiveExpense(x.id) }
  const handleRestore = async (x) => { await restoreExpense(x.id) }

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
      ['Source', x.expense_source],
      ['Status', x.status],
      ['Description', x.description || '—'],
    ]
    win.document.write(`
      <html>
        <head>
          <title>${x.receipt_number || 'Expense'}</title>
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
            <span class="status">${categoryName(x.expense_category_id)}</span>
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
    { key: 'total', label: 'Total Expenses', value: statsLoading ? '—' : stats.total, icon: Receipt, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: !filters.status && !filters.trashed, onClick: () => setFilter({ status: '', trashed: false }) },
    { key: 'totalAmount', label: 'Total Amount', value: statsLoading ? '—' : formatCurrency(stats.total_amount), icon: Wallet, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => setFilter({ status: '', trashed: false }) },
    { key: 'thisMonth', label: `This Month (${CURRENT_MONTH_LABEL})`, value: statsLoading ? '—' : formatCurrency(stats.this_month_amount), icon: Tag, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => setFilter({ status: '', trashed: false }) },
    { key: 'archived', label: 'Archived', value: statsLoading ? '—' : stats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: filters.trashed, onClick: () => setFilter({ trashed: true }) },
  ]

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
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by description, receipt no., or source..." className={`${INPUT} pl-9`} />
        </div>
        <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className={INPUT}>
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <select value={filters.expense_category_id} onChange={(e) => setFilter({ expense_category_id: e.target.value })} className={INPUT}>
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
            style={{ width: '9.5rem' }}
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={filters.expense_date_to}
            onChange={(e) => setFilter({ expense_date_to: e.target.value })}
            min={filters.expense_date_from || undefined}
            aria-label="Expense date to"
            className={`${INPUT} scheme-light dark:scheme-dark`}
            style={{ width: '9.5rem' }}
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
          variant={filters.trashed ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => setFilter({ trashed: !filters.trashed })}
          className="shrink-0 whitespace-nowrap"
        >
          Show Archived
        </Button>
      </div>

      {listError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{listError}</div>
      )}
      {mutateError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{mutateError}</div>
      )}

      {/* max-h + overflow-y-auto gives the sticky header a scroll container
          to stick within — without this, "sticky" has nothing to pin
          against once the whole page (not just the table) is what scrolls. */}
      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Expense</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Budget</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Category</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Date</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">Loading expenses…</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                  {hasDateFilter ? 'No expenses fall within the selected date range.' : 'No expenses match your filters.'}
                </td></tr>
              ) : paginatedExpenses.map((x) => (
                <tr key={x.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{x.description}</p>
                    <p className="text-xs text-muted">{x.receipt_number || x.expense_source} {x.supplier_id ? `\u00b7 ${x.supplier_name || supplierName(x.supplier_id)}` : ''}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink text-xs">{x.budget_name || budgetLabel(x.budget_id)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_STYLES}`}>{x.expense_category_name || categoryName(x.expense_category_id)}</span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(x.expense_date)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">
                    {formatCurrency(x.expense_amount)}
                    {x.is_over_budget && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">Over budget</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[x.status] || ''}`}>{x.status}</span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      {x.status === 'Pending' && !filters.trashed && (
                        <>
                          <Tooltip label="Approve" align="start">
                            <button type="button" onClick={() => handleApprove(x)} disabled={mutating} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 transition-colors duration-150 disabled:opacity-50">
                              <CheckCircle2 size={15} />
                            </button>
                          </Tooltip>
                          <Tooltip label="Reject" align="start">
                            <button type="button" onClick={() => openReject(x)} disabled={mutating} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors duration-150 disabled:opacity-50">
                              <XCircle size={15} />
                            </button>
                          </Tooltip>
                        </>
                      )}
                      <Tooltip label="View full record" align="start">
                        <button type="button" onClick={() => setDetailRecord(x)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Print expense slip" align="start">
                        <button type="button" onClick={() => handlePrint(x)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Printer size={15} />
                        </button>
                      </Tooltip>
                      {x.status !== 'Approved' && !filters.trashed && (
                        <Tooltip label="Edit expense" align="start">
                          <button type="button" onClick={() => openEdit(x)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip>
                      )}
                      <Tooltip label={filters.trashed ? 'Restore expense' : 'Archive expense'} align="end">
                        <button type="button" onClick={() => (filters.trashed ? handleRestore(x) : handleArchive(x))} disabled={mutating} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50">
                          {filters.trashed ? <RotateCcw size={15} /> : <Archive size={15} />}
                        </button>
                      </Tooltip>
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
              Showing {rangeStart}–{rangeEnd} of {expenses.length} expenses
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Budget</label>
              <select value={form.budget_id} onChange={(e) => setForm((f) => ({ ...f, budget_id: e.target.value }))} className={INPUT}>
                <option value="">Select budget</option>
                {budgets.map((b) => <option key={b.id} value={b.id}>{b.budget_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Category</label>
              <select value={form.expense_category_id} onChange={(e) => setForm((f) => ({ ...f, expense_category_id: e.target.value }))} className={INPUT}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.category_name}</option>)}
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
              <input type="number" step="0.01" value={form.expense_amount} onChange={(e) => setForm((f) => ({ ...f, expense_amount: e.target.value }))} className={INPUT} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Source</label>
              <input type="text" value={form.expense_source} onChange={(e) => setForm((f) => ({ ...f, expense_source: e.target.value }))} className={INPUT} placeholder="e.g. Petty Cash, Company Card" />
            </div>
            <div>
              <label className={LABEL}>Receipt Number</label>
              <input type="text" value={form.receipt_number} onChange={(e) => setForm((f) => ({ ...f, receipt_number: e.target.value }))} className={INPUT} placeholder="RCPT-4401" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Receipt Status</label>
              <select value={form.receipt_status} onChange={(e) => setForm((f) => ({ ...f, receipt_status: e.target.value }))} className={INPUT}>
                <option value="Pending">Pending</option>
                <option value="Verified">Verified</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Supplier (optional)</label>
              <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))} className={INPUT}>
                <option value="">N/A</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
              </select>
            </div>
          </div>

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
        title="Expense Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setDetailRecord(null)}>Close</Button>
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Slip</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
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
                <DetailRow label="Expense Date" value={formatDate(detailRecord.expense_date)} />
                <DetailRow label="Amount" value={formatCurrency(detailRecord.expense_amount)} />
                <DetailRow label="Over Budget" value={detailRecord.is_over_budget ? 'Yes' : 'No'} />
                <DetailRow label="Source" value={detailRecord.expense_source} />
                <DetailRow label="Receipt No." value={detailRecord.receipt_number} />
                <DetailRow label="Receipt Status" value={detailRecord.receipt_status} />
                <DetailRow label="Supplier" value={detailRecord.supplier_name || supplierName(detailRecord.supplier_id)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={detailRecord.created_by_name} />
                <DetailRow label="Created at" value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(detailRecord.updated_at)} />
                {detailRecord.deleted_at && (
                  <>
                    <DetailRow label="Archived by" value={detailRecord.deleted_by_name} />
                    <DetailRow label="Archived at" value={formatDateTime(detailRecord.deleted_at)} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Expense"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="danger" size="md" loading={mutating} onClick={confirmReject}>Reject</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">This expense will be marked Rejected. No budget or ledger impact will be made.</p>
          <div>
            <label className={LABEL}>Remarks (optional)</label>
            <input type="text" value={rejectRemarks} onChange={(e) => setRejectRemarks(e.target.value)} className={INPUT} placeholder="Reason for rejection" />
          </div>
        </div>
      </Modal>
    </div>
  )
}