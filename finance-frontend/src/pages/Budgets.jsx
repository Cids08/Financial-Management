import { useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, PiggyBank, TrendingDown, Building2, Info, Printer, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'

const DEPARTMENTS = [
  { department_id: 1, department_name: 'Finance' },
  { department_id: 2, department_name: 'Operations' },
  { department_id: 3, department_name: 'Sales & Marketing' },
  { department_id: 4, department_name: 'IT' },
  { department_id: 5, department_name: 'Human Resources' },
]
const USERS = [
  { user_id: 1, first_name: 'Ana', last_name: 'Reyes' },
  { user_id: 2, first_name: 'Marco', last_name: 'Santos' },
  { user_id: 3, first_name: 'Liza', last_name: 'Fernandez' },
]
const deptName = (id) => DEPARTMENTS.find((d) => d.department_id === Number(id))?.department_name || 'Unknown'
const userName = (id) => {
  const u = USERS.find((u) => u.user_id === Number(id))
  return u ? `${u.first_name} ${u.last_name}` : '—'
}
// The user currently signed in — used to auto-stamp who created/approved a record
// instead of asking for it on every form.
const CURRENT_USER_ID = 1

const initialBudgets = [
  { budget_id: 1, department_id: 2, fiscal_year: 2026, allocated_amount: 1500000, remaining_amount: 620000, status: 'Active', approval_status: 'Approved', remarks: 'Includes logistics contingency', created_by: 1, approved_by: 3, approved_at: '2026-01-05T09:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-01-02T09:00:00', updated_at: '2026-07-20T10:00:00' },
  { budget_id: 2, department_id: 3, fiscal_year: 2026, allocated_amount: 800000, remaining_amount: 145000, status: 'Active', approval_status: 'Approved', remarks: 'Q3 campaign heavy spend', created_by: 1, approved_by: 3, approved_at: '2026-01-06T09:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-01-02T09:30:00', updated_at: '2026-07-18T14:00:00' },
  { budget_id: 3, department_id: 4, fiscal_year: 2026, allocated_amount: 650000, remaining_amount: 650000, status: 'Active', approval_status: 'Pending', remarks: '', created_by: 2, approved_by: null, approved_at: null, is_archived: false, archived_at: null, archived_by: null, created_at: '2026-07-28T10:00:00', updated_at: '2026-07-28T10:00:00' },
  { budget_id: 4, department_id: 5, fiscal_year: 2026, allocated_amount: 300000, remaining_amount: 90000, status: 'Active', approval_status: 'Approved', remarks: 'Recruitment drive ongoing', created_by: 2, approved_by: 3, approved_at: '2026-01-08T09:00:00', is_archived: false, archived_at: null, archived_by: null, created_at: '2026-01-03T11:00:00', updated_at: '2026-07-05T13:00:00' },
  { budget_id: 5, department_id: 1, fiscal_year: 2025, allocated_amount: 500000, remaining_amount: 0, status: 'Closed', approval_status: 'Approved', remarks: 'FY2025 closed out', created_by: 1, approved_by: 3, approved_at: '2025-01-05T09:00:00', is_archived: true, archived_at: '2026-01-15T09:00:00', archived_by: 1, created_at: '2025-01-02T09:00:00', updated_at: '2026-01-15T09:00:00' },
]

const STATUS_OPTIONS = ['Active', 'Closed']
const EMPTY_FORM = { department_id: DEPARTMENTS[0].department_id, fiscal_year: new Date().getFullYear(), allocated_amount: '', remarks: '' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_LOCKED = `w-full h-9 px-3 rounded-lg border border-border bg-bg/60 text-sm text-muted
  cursor-not-allowed select-none flex items-center`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

const APPROVAL_STYLES = {
  Pending: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Approved: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Rejected: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}
const APPROVAL_ICONS = { Pending: Clock, Approved: CheckCircle2, Rejected: XCircle }

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
  const Icon = APPROVAL_ICONS[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${APPROVAL_STYLES[status]}`}>
      <Icon size={12} />
      {status}
    </span>
  )
}

export default function Budgets({ title = 'Budgets', crumbs = ['Financial Transactions', 'Budgets'] }) {
  const [budgets, setBudgets] = useState(initialBudgets)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [approvalFilter, setApprovalFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [detailRecord, setDetailRecord] = useState(null)

  const filtered = useMemo(() => {
    return budgets.filter((b) => {
      if (!showArchived && b.is_archived) return false
      if (showArchived && !b.is_archived) return false
      if (statusFilter !== 'all' && b.status !== statusFilter) return false
      if (approvalFilter !== 'all' && b.approval_status !== approvalFilter) return false
      const q = search.toLowerCase()
      if (search && !deptName(b.department_id).toLowerCase().includes(q) && !String(b.fiscal_year).includes(q)) return false
      return true
    })
  }, [budgets, search, statusFilter, approvalFilter, showArchived])

  const stats = useMemo(() => {
    const active = budgets.filter((b) => !b.is_archived)
    return {
      total: active.length,
      allocated: active.reduce((sum, b) => sum + b.allocated_amount, 0),
      remaining: active.reduce((sum, b) => sum + b.remaining_amount, 0),
      pending: active.filter((b) => b.approval_status === 'Pending').length,
      overUtilized: active.filter((b) => b.approval_status === 'Approved' && usedPct(b.allocated_amount, b.remaining_amount) >= 90).length,
      archived: budgets.filter((b) => b.is_archived).length,
    }
  }, [budgets])

  const toggleArchive = (id) => {
    setBudgets((prev) => prev.map((b) => {
      if (b.budget_id !== id) return b
      const nextArchived = !b.is_archived
      return { ...b, is_archived: nextArchived, archived_at: nextArchived ? new Date().toISOString() : null, archived_by: nextArchived ? CURRENT_USER_ID : null, updated_at: new Date().toISOString() }
    }))
  }

  const setApproval = (id, decision) => {
    const now = new Date().toISOString()
    setBudgets((prev) => prev.map((b) => (
      b.budget_id === id
        ? { ...b, approval_status: decision, approved_by: CURRENT_USER_ID, approved_at: now, updated_at: now }
        : b
    )))
    setDetailRecord((prev) => (prev && prev.budget_id === id ? { ...prev, approval_status: decision, approved_by: CURRENT_USER_ID, approved_at: now } : prev))
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (b) => {
    // Once a budget is Approved it's locked from editing entirely — that decision is final
    // and belongs to the CEO. Before approval, only the allocated amount and remarks can
    // change; department, fiscal year, remaining amount, and status stay locked either way.
    if (b.approval_status === 'Approved') return
    setForm({ department_id: b.department_id, fiscal_year: b.fiscal_year, allocated_amount: b.allocated_amount, remarks: b.remarks })
    setFormError('')
    setModalMode(b)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }
  const openDetail = (b) => setDetailRecord(b)
  const closeDetail = () => setDetailRecord(null)

  const handlePrint = (b) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Department', deptName(b.department_id)],
      ['Fiscal Year', b.fiscal_year],
      ['Allocated Amount', formatCurrency(b.allocated_amount)],
      ['Remaining Amount', formatCurrency(b.remaining_amount)],
      ['Utilization', `${usedPct(b.allocated_amount, b.remaining_amount)}%`],
      ['Approval Status', b.approval_status],
      ['Approved By', userName(b.approved_by)],
      ['Status', b.status],
      ...(b.remarks ? [['Remarks', b.remarks]] : []),
    ]
    win.document.write(`
      <html>
        <head>
          <title>Budget — ${deptName(b.department_id)} FY${b.fiscal_year}</title>
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
            <div><h1>Budget Report</h1><p>${deptName(b.department_id)} &middot; FY${b.fiscal_year}</p></div>
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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.fiscal_year || !form.allocated_amount) {
      setFormError('Fiscal year and allocated amount are required.')
      return
    }
    const allocated = Number(form.allocated_amount) || 0
    const now = new Date().toISOString()

    if (modalMode === 'add') {
      // Minimal input on create: department, fiscal year, allocated amount, optional remarks.
      // Remaining amount always starts equal to the allocation, status defaults to Active,
      // and every new budget starts Pending until someone approves it — none of this needs
      // to be typed in by hand.
      const nextId = Math.max(0, ...budgets.map((b) => b.budget_id)) + 1
      setBudgets((prev) => [...prev, {
        budget_id: nextId,
        department_id: Number(form.department_id),
        fiscal_year: Number(form.fiscal_year),
        allocated_amount: allocated,
        remaining_amount: allocated,
        status: 'Active',
        approval_status: 'Pending',
        remarks: form.remarks,
        created_by: CURRENT_USER_ID,
        approved_by: null,
        approved_at: null,
        is_archived: false,
        archived_at: null,
        archived_by: null,
        created_at: now,
        updated_at: now,
      }])
    } else if (modalMode) {
      // Editing an existing budget only ever changes the allocated amount and remarks.
      // Department, fiscal year, remaining amount, and status stay exactly as they were —
      // approval/rejection is the CEO's call via the Approve/Reject actions, not this form.
      const editingId = modalMode.budget_id
      setBudgets((prev) => prev.map((b) => (
        b.budget_id === editingId
          ? { ...b, allocated_amount: allocated, remarks: form.remarks, updated_at: now }
          : b
      )))
    }
    closeModal()
  }

  // Cards ordered so the item needing action (Pending Approval) sits right after the
  // headline count, then the two money totals, then Archived last as a lower-priority
  // reference figure. Grid width matches the 5-card count exactly (no dangling gap).
  const statCards = [
    { key: 'total', label: 'Total Budgets', value: stats.total, icon: PiggyBank, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && approvalFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setApprovalFilter('all'); setShowArchived(false) } },
    { key: 'pending', label: 'Pending Approval', value: stats.pending, icon: Clock, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: approvalFilter === 'Pending', onClick: () => { setShowArchived(false); setApprovalFilter('Pending') } },
    { key: 'allocated', label: 'Total Allocated', value: formatCurrency(stats.allocated), icon: Building2, iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400', isActive: false, onClick: () => { setStatusFilter('all'); setApprovalFilter('all'); setShowArchived(false) } },
    { key: 'remaining', label: 'Total Remaining', value: formatCurrency(stats.remaining), icon: TrendingDown, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => { setStatusFilter('all'); setApprovalFilter('all'); setShowArchived(false) } },
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
          <p className="mt-1 text-xs text-muted">Allocate, approve, and monitor department budgets by fiscal year.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Budget</Button>
      </div>

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
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by department or fiscal year..." className={`${INPUT} pl-9`} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} className={INPUT}>
          <option value="all">All Approval States</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
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
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Department</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Fiscal Year</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Allocated / Remaining</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Utilization</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Approval</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const pct = usedPct(b.allocated_amount, b.remaining_amount)
                const isPending = b.approval_status === 'Pending'
                return (
                  <tr key={b.budget_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{deptName(b.department_id)}</p>
                      {b.remarks && <p className="text-xs text-muted truncate max-w-55">{b.remarks}</p>}
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
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[b.status]}`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap"><ApprovalBadge status={b.approval_status} /></td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isPending && (
                          <>
                            <Tooltip label="Approve budget" align="start">
                              <button type="button" onClick={() => setApproval(b.budget_id, 'Approved')} className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors duration-150">
                                <CheckCircle2 size={15} />
                              </button>
                            </Tooltip>
                            <Tooltip label="Reject budget" align="start">
                              <button type="button" onClick={() => setApproval(b.budget_id, 'Rejected')} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors duration-150">
                                <XCircle size={15} />
                              </button>
                            </Tooltip>
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
                        {b.approval_status !== 'Approved' && (
                          <Tooltip label="Edit budget" align="start">
                            <button
                              type="button"
                              onClick={() => openEdit(b)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <Pencil size={15} />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip label={b.is_archived ? 'Restore budget' : 'Archive budget'} align="end">
                          <button type="button" onClick={() => toggleArchive(b.budget_id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            {b.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">No budgets match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Budget' : 'Add Budget'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Budget'}</Button>
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
                <div className={INPUT_LOCKED}>
                  <span className="truncate">{deptName(form.department_id)}</span>
                </div>
              ) : (
                <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} className={INPUT}>
                  {DEPARTMENTS.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={LABEL}>Fiscal Year</label>
              {isEditing ? (
                <div className={INPUT_LOCKED}>
                  <span>{form.fiscal_year}</span>
                </div>
              ) : (
                <input type="number" value={form.fiscal_year} onChange={(e) => setForm((f) => ({ ...f, fiscal_year: e.target.value }))} className={INPUT} placeholder="2026" />
              )}
            </div>
          </div>

          <div>
            <label className={LABEL}>Allocated Amount</label>
            <input type="number" value={form.allocated_amount} onChange={(e) => setForm((f) => ({ ...f, allocated_amount: e.target.value }))} className={INPUT} placeholder="0.00" />
          </div>

          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} placeholder="Optional notes" />
          </div>

          {!isEditing && (
            <p className="text-xs text-muted">New budgets start as <span className="font-medium text-ink">Pending</span> approval and become spendable once approved.</p>
          )}

          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <DetailRow label="Remaining amount" value={formatCurrency(modalMode.remaining_amount)} />
              <DetailRow label="Status" value={<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[modalMode.status]}`}>{modalMode.status}</span>} />
              <DetailRow label="Approval status" value={<ApprovalBadge status={modalMode.approval_status} />} />
              <DetailRow label="Created by" value={userName(modalMode.created_by)} />
              <DetailRow label="Approved by" value={userName(modalMode.approved_by)} />
              <DetailRow label="Approved at" value={formatDateTime(modalMode.approved_at)} />
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
        title="Budget Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && detailRecord.approval_status === 'Pending' && (
              <>
                <Button variant="secondary" size="md" icon={XCircle} onClick={() => setApproval(detailRecord.budget_id, 'Rejected')}>Reject</Button>
                <Button variant="primary" size="md" icon={CheckCircle2} onClick={() => setApproval(detailRecord.budget_id, 'Approved')}>Approve</Button>
              </>
            )}
            {detailRecord && detailRecord.approval_status !== 'Pending' && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Report</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{deptName(detailRecord.department_id)}</p>
                <p className="text-xs text-muted">Fiscal Year {detailRecord.fiscal_year}</p>
              </div>
              <div className="flex items-center gap-2">
                <ApprovalBadge status={detailRecord.approval_status} />
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status]}`}>{detailRecord.status}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Allocated Amount" value={formatCurrency(detailRecord.allocated_amount)} />
                <DetailRow label="Remaining Amount" value={formatCurrency(detailRecord.remaining_amount)} />
                <DetailRow label="Utilization" value={`${usedPct(detailRecord.allocated_amount, detailRecord.remaining_amount)}%`} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Remarks" value={detailRecord.remarks || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by" value={userName(detailRecord.created_by)} />
                <DetailRow label="Approved by" value={userName(detailRecord.approved_by)} />
                <DetailRow label="Approved at" value={formatDateTime(detailRecord.approved_at)} />
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