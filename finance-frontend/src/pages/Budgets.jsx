import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, PiggyBank, TrendingDown, Building2, Info, Printer, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Paperclip, Loader2 } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useBudgets } from '../hooks/useBudgets'
import { useDepartments } from '../hooks/useDepartments' // TODO: adjust to your real Departments hook/import if named differently

/**
 * NOTE on field names below: BudgetResource.php wasn't in what you shared,
 * so `department`, `creator`, and `approver` are assumed to be nested
 * objects (e.g. department: { id, name }) the way BudgetController's
 * ->load(['department','creator','approver']) implies. If your resource
 * shapes these differently, adjust deptName()/userName() below — the rest
 * of the page doesn't care how those two functions resolve a display name.
 */
const deptName = (b) => b?.department?.department_name || b?.department?.name || '—'
const userName = (u) => (u ? `${u.first_name ?? ''} ${u.last_name ?? u.name ?? ''}`.trim() || u.name || '—' : '—')

// Budget.status in the backend IS the approval status (Pending/Approved/
// Rejected) — there's no separate Active/Closed lifecycle field on the
// model. "Archived" is a soft delete (deleted_at), not a status value.
const APPROVAL_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Approved: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}
const APPROVAL_ICONS = { Pending: Clock, Approved: CheckCircle2, Rejected: XCircle }

const EMPTY_FORM = {
  department_id: '',
  budget_code: '',
  budget_name: '',
  budget_type: '',
  fiscal_year: new Date().getFullYear(),
  allocated_amount: '',
  warning_percentage: '',
  start_date: '',
  end_date: '',
  remarks: '',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }
const INPUT_LOCKED = `w-full h-9 px-3 rounded-lg border border-border bg-bg/60 text-sm text-muted
  cursor-not-allowed select-none flex items-center`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

function usedPct(allocated, remaining) {
  if (!allocated) return 0
  return Math.min(100, Math.round(((allocated - remaining) / allocated) * 100))
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

function ApprovalBadge({ status }) {
  const Icon = APPROVAL_ICONS[status] ?? Clock
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${APPROVAL_STYLES[status] ?? APPROVAL_STYLES.Pending}`}>
      <Icon size={12} />
      {status}
    </span>
  )
}

export default function Budgets({ title = 'Budgets', crumbs = ['Financial Transactions', 'Budgets'] }) {
  const {
    budgets, meta, stats, loading, saving, error,
    fetchBudgets, fetchStats, createBudget, updateBudget,
    uploadPlan, approveBudget, rejectBudget, archiveBudget, restoreBudget,
  } = useBudgets()

  // TODO: replace with however Departments are actually fetched elsewhere
  // in the app (e.g. a shared useDepartments hook, or a DepartmentContext) —
  // this page needs the list to populate the "Department" select on Add.
  const { departments } = useDepartments?.() ?? { departments: [] }

  const [search, setSearch] = useState('')
  const [approvalFilter, setApprovalFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)

  const [modalMode, setModalMode] = useState(null) // null | 'add' | budget object being edited
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)
  const [planFileFor, setPlanFileFor] = useState(null) // budget currently attaching a plan
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = () => {
    fetchBudgets(
      {
        status: approvalFilter !== 'all' ? approvalFilter : undefined,
        search: search || undefined,
        archived: showArchived ? 1 : undefined,
      },
      page
    )
  }

  useEffect(() => { load() }, [approvalFilter, showArchived, page]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchStats() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce free-text search instead of firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load() }, 350)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const statCards = useMemo(() => ([
    { key: 'total', label: 'Total Budgets', value: stats?.total ?? '—', icon: PiggyBank, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: approvalFilter === 'all' && !showArchived, onClick: () => { setShowArchived(false); setApprovalFilter('all') } },
    { key: 'pending', label: 'Pending Approval', value: stats?.pending ?? '—', icon: Clock, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: approvalFilter === 'Pending', onClick: () => { setShowArchived(false); setApprovalFilter('Pending') } },
    { key: 'allocated', label: 'Total Allocated', value: stats?.allocated != null ? formatCurrency(stats.allocated) : '—', icon: Building2, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => { setShowArchived(false); setApprovalFilter('all') } },
    { key: 'remaining', label: 'Total Remaining', value: stats?.remaining != null ? formatCurrency(stats.remaining) : '—', icon: TrendingDown, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => { setShowArchived(false); setApprovalFilter('all') } },
    { key: 'archived', label: 'Archived', value: stats?.archived ?? '—', icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: showArchived, onClick: () => setShowArchived(true) },
  ]), [stats, approvalFilter, showArchived])
  // NOTE: BudgetController::stats() as shared only returns { total }. The
  // pending/allocated/remaining/archived figures above assume you extend
  // that endpoint (same as the other totals) — until then those cards will
  // just show "—".

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (b) => {
    // An approved budget is locked from editing entirely, per
    // UpdateBudgetRequest::authorize() ($budget->status !== 'Approved').
    if (b.status === 'Approved') return
    setForm({
      department_id: b.department_id,
      budget_code: b.budget_code,
      budget_name: b.budget_name,
      budget_type: b.budget_type,
      fiscal_year: b.fiscal_year,
      allocated_amount: b.allocated_amount,
      warning_percentage: b.warning_percentage ?? '',
      start_date: b.start_date?.slice(0, 10) ?? '',
      end_date: b.end_date?.slice(0, 10) ?? '',
      remarks: b.remarks ?? '',
    })
    setFormError('')
    setModalMode(b)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const openDetail = (b) => setDetailRecord(b)
  const closeDetail = () => setDetailRecord(null)
  const isEditing = modalMode !== null && modalMode !== 'add'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.fiscal_year || !form.allocated_amount || !form.start_date || !form.end_date) {
      setFormError('Fiscal year, allocated amount, start date, and end date are required.')
      return
    }

    let result
    if (modalMode === 'add') {
      if (!form.budget_code || !form.budget_name || !form.budget_type || !form.department_id) {
        setFormError('Department, budget code, name, and type are required.')
        return
      }
      result = await createBudget({
        department_id: Number(form.department_id),
        budget_code: form.budget_code,
        budget_name: form.budget_name,
        budget_type: form.budget_type,
        fiscal_year: Number(form.fiscal_year),
        allocated_amount: Number(form.allocated_amount),
        warning_percentage: form.warning_percentage === '' ? undefined : Number(form.warning_percentage),
        start_date: form.start_date,
        end_date: form.end_date,
        remarks: form.remarks || undefined,
      })
    } else {
      result = await updateBudget(modalMode.id, {
        allocated_amount: Number(form.allocated_amount),
        warning_percentage: form.warning_percentage === '' ? undefined : Number(form.warning_percentage),
        start_date: form.start_date,
        end_date: form.end_date,
        remarks: form.remarks || undefined,
      })
    }

    if (!result.success) {
      setFormError(result.message)
      return
    }
    fetchStats()
    closeModal()
  }

  const handleApprove = async (id) => {
    const result = await approveBudget(id)
    if (result.success) {
      fetchStats()
      setDetailRecord((prev) => (prev && prev.id === id ? result.data : prev))
    } else {
      setFormError(result.message)
    }
  }

  const openReject = (id) => { setRejectingId(id); setRejectReason('') }
  const confirmReject = async () => {
    const result = await rejectBudget(rejectingId, rejectReason || undefined)
    if (result.success) {
      fetchStats()
      setDetailRecord((prev) => (prev && prev.id === rejectingId ? result.data : prev))
    }
    setRejectingId(null)
  }

  const handleArchiveToggle = async (b) => {
    const result = b.deleted_at ? await restoreBudget(b.id) : await archiveBudget(b.id)
    if (result.success) fetchStats()
  }

  const handlePlanFileChange = async (b, file) => {
    if (!file) return
    const result = await uploadPlan(b.id, file)
    setPlanFileFor(null)
    if (result.success) {
      setDetailRecord((prev) => (prev && prev.id === b.id ? result.data : prev))
    }
  }

  const handlePrint = (b) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Department', deptName(b)],
      ['Budget Code', b.budget_code],
      ['Fiscal Year', b.fiscal_year],
      ['Allocated Amount', formatCurrency(b.allocated_amount)],
      ['Remaining Amount', formatCurrency(b.remaining_amount)],
      ['Utilization', `${usedPct(b.allocated_amount, b.remaining_amount)}%`],
      ['Budget Plan', b.has_plan ? 'Attached' : 'Not attached'],
      ['Approval Status', b.status],
      ['Approved By', userName(b.approver)],
      ...(b.remarks ? [['Remarks', b.remarks]] : []),
    ]
    win.document.write(`
      <html>
        <head>
          <title>Budget — ${deptName(b)} FY${b.fiscal_year}</title>
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
            <div><h1>Budget Report</h1><p>${deptName(b)} &middot; FY${b.fiscal_year}</p></div>
            <span class="status">${b.status}</span>
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

  const totalPages = meta.last_page || 1
  const rangeStart = meta.total === 0 ? 0 : (meta.current_page - 1) * 20 + 1
  const rangeEnd = Math.min(meta.current_page * 20, meta.total)

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Allocate, approve, and monitor department budgets by fiscal year.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Budget</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
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
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by budget name or code..." className={`${INPUT} pl-9`} style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0 }} autoComplete="off" />
        </div>
        <select value={approvalFilter} onChange={(e) => { setApprovalFilter(e.target.value); setPage(1) }} className={INPUT} style={INPUT_TEXT_STYLE}>
          <option value="all">All Approval States</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <Button
          variant={showArchived ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => { setShowArchived((prev) => !prev); setPage(1) }}
          className="shrink-0 whitespace-nowrap"
        >
          Show Archived
        </Button>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Budget</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Fiscal Year</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Allocated / Remaining</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Utilization</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Approval</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  <Loader2 size={16} className="inline animate-spin mr-2" /> Loading budgets...
                </td></tr>
              ) : budgets.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No budgets match your filters.</td></tr>
              ) : budgets.map((b) => {
                const pct = usedPct(b.allocated_amount, b.remaining_amount)
                const isPending = b.status === 'Pending'
                return (
                  <tr key={b.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{b.budget_name}</p>
                      <p className="text-xs text-muted">{deptName(b)} · {b.budget_code}</p>
                      {isPending && !b.has_plan && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle size={11} />
                          No budget plan attached
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{b.fiscal_year}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink tabular-nums">{formatCurrency(b.allocated_amount)}</p>
                      <p className="text-xs text-muted tabular-nums">Left: {formatCurrency(b.remaining_amount)}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-bg overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted tabular-nums">{pct}%</span>
                        {pct >= 90 && <Tooltip label="Nearing budget limit"><AlertTriangle size={13} className="text-red-500" /></Tooltip>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap"><ApprovalBadge status={b.status} /></td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isPending && (
                          <>
                            <Tooltip label={b.has_plan ? 'Approve budget' : 'Attach a budget plan before approving'} align="start">
                              <button
                                type="button"
                                onClick={() => handleApprove(b.id)}
                                disabled={!b.has_plan || saving}
                                aria-disabled={!b.has_plan || saving}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 ${
                                  b.has_plan ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10' : 'text-muted/40 cursor-not-allowed'
                                }`}
                              >
                                <CheckCircle2 size={15} />
                              </button>
                            </Tooltip>
                            <Tooltip label="Reject budget" align="start">
                              <button type="button" onClick={() => openReject(b.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-150">
                                <XCircle size={15} />
                              </button>
                            </Tooltip>
                            {!b.has_plan && (
                              <Tooltip label="Attach budget plan" align="start">
                                <label className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 cursor-pointer">
                                  <Paperclip size={15} />
                                  <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                                    className="hidden"
                                    onChange={(e) => handlePlanFileChange(b, e.target.files?.[0])}
                                  />
                                </label>
                              </Tooltip>
                            )}
                          </>
                        )}
                        <Tooltip label="View full record" align="start">
                          <button type="button" onClick={() => openDetail(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Info size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label="Print budget report" align="start">
                          <button type="button" onClick={() => handlePrint(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Printer size={15} />
                          </button>
                        </Tooltip>
                        {b.status !== 'Approved' && (
                          <Tooltip label="Edit budget" align="start">
                            <button type="button" onClick={() => openEdit(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <Pencil size={15} />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip label={b.deleted_at ? 'Restore budget' : 'Archive budget'} align="end">
                          <button type="button" onClick={() => handleArchiveToggle(b)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            {b.deleted_at ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!loading && meta.total > 0 && (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">Showing {rangeStart}–{rangeEnd} of {meta.total} budgets</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Previous page">
                <ChevronLeft size={15} />
              </button>
              <span className="px-2 text-xs font-medium text-ink whitespace-nowrap">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Next page">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={modalMode !== null}
        onClose={closeModal}
        title={isEditing ? 'Edit Budget' : 'Add Budget'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Budget'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Department</label>
              {isEditing ? (
                <div className={INPUT_LOCKED}><span className="truncate">{deptName(modalMode)}</span></div>
              ) : (
                <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE}>
                  <option value="">Select department</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name || d.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={LABEL}>Fiscal Year</label>
              {isEditing ? (
                <div className={INPUT_LOCKED}><span>{form.fiscal_year}</span></div>
              ) : (
                <input type="number" value={form.fiscal_year} onChange={(e) => setForm((f) => ({ ...f, fiscal_year: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="2026" />
              )}
            </div>
          </div>

          {!isEditing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Budget Code</label>
                <input type="text" value={form.budget_code} onChange={(e) => setForm((f) => ({ ...f, budget_code: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="e.g. BUD-2026-IT-01" />
              </div>
              <div>
                <label className={LABEL}>Budget Type</label>
                <input type="text" value={form.budget_type} onChange={(e) => setForm((f) => ({ ...f, budget_type: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="e.g. Operating" />
              </div>
            </div>
          )}

          {!isEditing && (
            <div>
              <label className={LABEL}>Budget Name</label>
              <input type="text" value={form.budget_name} onChange={(e) => setForm((f) => ({ ...f, budget_name: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="e.g. IT Infrastructure FY2026" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Allocated Amount</label>
              <input type="number" value={form.allocated_amount} onChange={(e) => setForm((f) => ({ ...f, allocated_amount: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>Warning % (optional)</label>
              <input type="number" min="1" max="100" value={form.warning_percentage} onChange={(e) => setForm((f) => ({ ...f, warning_percentage: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="e.g. 80" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className={`${INPUT} scheme-light dark:scheme-dark`} style={INPUT_TEXT_STYLE} />
            </div>
            <div>
              <label className={LABEL}>End Date</label>
              <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className={`${INPUT} scheme-light dark:scheme-dark`} style={INPUT_TEXT_STYLE} />
            </div>
          </div>

          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="Optional notes" />
          </div>

          {!isEditing && (
            <p className="text-xs text-muted">New budgets start as <span className="font-medium text-ink">Pending</span> approval. You can attach the budget plan file from the table once it's saved.</p>
          )}

          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <DetailRow label="Remaining amount" value={formatCurrency(modalMode.remaining_amount)} />
              <DetailRow label="Approval status" value={<ApprovalBadge status={modalMode.status} />} />
              <DetailRow label="Budget plan" value={modalMode.has_plan ? 'Attached' : 'Not attached'} />
              <DetailRow label="Created by" value={userName(modalMode.creator)} />
              <DetailRow label="Created at" value={formatDateTime(modalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(modalMode.updated_at)} />
            </div>
          )}
        </form>
      </Modal>

      {/* Reject reason modal */}
      <Modal
        open={rejectingId !== null}
        onClose={() => setRejectingId(null)}
        title="Reject Budget"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRejectingId(null)}>Cancel</Button>
            <Button variant="primary" size="md" onClick={confirmReject} disabled={saving}>{saving ? 'Rejecting...' : 'Reject Budget'}</Button>
          </>
        }
      >
        <label className={LABEL}>Reason (optional)</label>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-bg text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          style={INPUT_TEXT_STYLE}
          placeholder="Explain why this budget is being rejected..."
          maxLength={2000}
        />
      </Modal>

      {/* Detail modal */}
      <Modal
        open={!!detailRecord}
        onClose={closeDetail}
        title="Budget Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && detailRecord.status === 'Pending' && (
              <>
                <Button variant="secondary" size="md" icon={XCircle} onClick={() => openReject(detailRecord.id)}>Reject</Button>
                <Tooltip label={detailRecord.has_plan ? 'Approve budget' : 'Attach a budget plan before approving'}>
                  <Button variant="primary" size="md" icon={CheckCircle2} disabled={!detailRecord.has_plan} onClick={() => handleApprove(detailRecord.id)}>Approve</Button>
                </Tooltip>
              </>
            )}
            {detailRecord && detailRecord.status !== 'Pending' && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Report</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.budget_name}</p>
                <p className="text-xs text-muted">{deptName(detailRecord)} · FY{detailRecord.fiscal_year} · {detailRecord.budget_code}</p>
              </div>
              <ApprovalBadge status={detailRecord.status} />
            </div>

            {detailRecord.status === 'Pending' && !detailRecord.has_plan && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <span className="flex items-center gap-2"><AlertTriangle size={14} className="shrink-0" /> No budget plan attached yet.</span>
                <label className="inline-flex items-center gap-1 font-medium underline cursor-pointer shrink-0">
                  Attach file
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => handlePlanFileChange(detailRecord, e.target.files?.[0])} />
                </label>
              </div>
            )}

            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Allocated Amount" value={formatCurrency(detailRecord.allocated_amount)} />
                <DetailRow label="Remaining Amount" value={formatCurrency(detailRecord.remaining_amount)} />
                <DetailRow label="Utilization" value={`${usedPct(detailRecord.allocated_amount, detailRecord.remaining_amount)}%`} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Budget Type" value={detailRecord.budget_type} />
                <DetailRow label="Budget Plan" value={detailRecord.has_plan ? 'Attached' : <span className="text-amber-600 dark:text-amber-400">Not attached</span>} />
                <DetailRow label="Remarks" value={detailRecord.remarks || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={userName(detailRecord.creator)} />
                <DetailRow label="Approved by" value={userName(detailRecord.approver)} />
                <DetailRow label="Approved at" value={formatDateTime(detailRecord.approved_at)} />
                <DetailRow label="Created at" value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(detailRecord.updated_at)} />
                {detailRecord.deleted_at && <DetailRow label="Archived at" value={formatDateTime(detailRecord.deleted_at)} />}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}