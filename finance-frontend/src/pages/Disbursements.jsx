import { useState } from 'react'
import {
  Search, Plus, Pencil, Archive, RotateCcw, Send, CheckCircle2, Clock3, Info, Printer,
  Lock, ChevronLeft, ChevronRight, CalendarRange, X, Upload, ThumbsUp, ThumbsDown, Wallet,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { usePermissions } from '../context/PermissionsContext'
import { hasPermission } from '../utils/permissions'
import { useDisbursements } from '../hooks/useDisbursements'

/* ---------------------------------------------------------------------- */
/* Static form config (these still need real endpoints for dropdowns —    */
/* wire /accounts-payable, /departments, /cash-accounts here when ready)  */
/* ---------------------------------------------------------------------- */

const PAYMENT_METHODS = ['Bank Transfer', 'Check', 'Cash', 'GCash']

const EMPTY_DISBURSEMENT_FORM = {
  ap_id: '', department_id: '', cash_account_id: '',
  voucher_number: '', payee: '', payment_date: '', amount_paid: '',
  currency: 'PHP', payment_method: 'Bank Transfer', reference_number: '', remarks: '',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const DISBURSEMENT_STATUS_STYLES = {
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

function NoAccessState({ label }) {
  return (
    <div className={`${PANEL} flex flex-col items-center justify-center gap-2 py-16 text-center`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-muted">
        <Lock size={18} />
      </div>
      <p className="text-sm font-medium text-ink">You don't have access to {label}</p>
      <p className="text-xs text-muted">Ask an administrator to grant you the {label} permission.</p>
    </div>
  )
}

/* ---------------------------------------------------------------------- */
/* Main module — Disbursements (payments)                                  */
/* ---------------------------------------------------------------------- */

export default function Disbursements({ title = 'Disbursements', crumbs = ['Financial Transactions', 'Disbursements'] }) {
  const { permissions, loading: permsLoading } = usePermissions()

  const canViewPayments = hasPermission(permissions, 'disbursements.view')
  const canManagePayments = hasPermission(permissions, 'disbursements.manage')
  const canApprovePayments = hasPermission(permissions, 'disbursements.approve')

  const {
    disbursements, stats, meta, loading, error,
    dSearch, setDSearch, dStatusFilter, setDStatusFilter,
    dShowArchived, setDShowArchived, dDateFrom, setDDateFrom,
    dDateTo, setDDateTo, dHasDateFilter, clearDDateFilter,
    dPage, setDPage,
    createDisbursement, updateDisbursement,
    approveDisbursement, rejectDisbursement, releaseDisbursement,
    uploadProof, archiveDisbursement, restoreDisbursement,
  } = useDisbursements()

  const [dModalMode, setDModalMode] = useState(null) // null | 'add' | disbursement object
  const [dForm, setDForm] = useState(EMPTY_DISBURSEMENT_FORM)
  const [dFormError, setDFormError] = useState('')
  const [dDetailRecord, setDDetailRecord] = useState(null)
  const [dSubmitting, setDSubmitting] = useState(false)
  const [dActionError, setDActionError] = useState('')

  const openAddDisbursement = () => { setDForm(EMPTY_DISBURSEMENT_FORM); setDFormError(''); setDModalMode('add') }
  const openEditDisbursement = (d) => {
    if (!canManagePayments || d.status !== 'Pending') return
    setDForm({
      ap_id: d.ap_id, department_id: d.department_id, cash_account_id: d.cash_account_id,
      voucher_number: d.voucher_number, payee: d.payee, payment_date: d.payment_date || '',
      amount_paid: d.amount_paid, currency: d.currency || 'PHP', payment_method: d.payment_method,
      reference_number: d.reference_number || '', remarks: d.remarks || '',
    })
    setDFormError('')
    setDModalMode(d)
  }
  const closeDisbursementModal = () => { setDModalMode(null); setDFormError('') }
  const openDisbursementDetail = (d) => setDDetailRecord(d)
  const closeDisbursementDetail = () => setDDetailRecord(null)

  const handlePrintDisbursement = (d) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const rows = [
      ['Payee', d.payee],
      ['Related Bill', d.invoice_number || '—'],
      ['Department', d.department_name || '—'],
      ['Payment Date', formatDate(d.payment_date)],
      ['Amount Paid', formatCurrency(d.amount_paid)],
      ['Payment Method', d.payment_method],
      ['Cash Account', d.cash_account_name || '—'],
      ['Reference No.', d.reference_number || '—'],
      ['Approved By', d.approved_by_name || '—'],
      ['Status', d.status],
    ]
    win.document.write(`
      <html>
        <head>
          <title>Disbursement Voucher ${d.voucher_number}</title>
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

  const handleDisbursementSubmit = async (e) => {
    e.preventDefault()
    if (!dForm.payee.trim() || !dForm.amount_paid || !dForm.voucher_number.trim()) {
      setDFormError('Voucher number, payee, and amount are required.')
      return
    }
    setDSubmitting(true)
    setDFormError('')
    try {
      const payload = {
        ...dForm,
        ap_id: Number(dForm.ap_id),
        department_id: Number(dForm.department_id),
        cash_account_id: Number(dForm.cash_account_id),
        amount_paid: Number(dForm.amount_paid) || 0,
      }
      if (dModalMode === 'add') {
        await createDisbursement(payload)
      } else if (dModalMode) {
        await updateDisbursement(dModalMode.disbursement_id, payload)
      }
      closeDisbursementModal()
    } catch (err) {
      setDFormError(err?.response?.data?.message || 'Could not save the disbursement.')
    } finally {
      setDSubmitting(false)
    }
  }

  const runAction = async (fn) => {
    setDActionError('')
    try {
      await fn()
    } catch (err) {
      setDActionError(err?.response?.data?.message || 'That action failed.')
    }
  }

  const handleProofUpload = (d, file) => {
    if (!file) return
    runAction(() => uploadProof(d.disbursement_id, file))
  }

  const disbursementStatCards = stats && [
    { key: 'total', label: 'Total Payments', value: stats.total, icon: Send, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: dStatusFilter === 'all' && !dShowArchived, onClick: () => { setDStatusFilter('all'); setDShowArchived(false) } },
    { key: 'released', label: 'Released Amount', value: formatCurrency(stats.total_paid), icon: CheckCircle2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: dStatusFilter === 'Released' && !dShowArchived, onClick: () => { setDStatusFilter('Released'); setDShowArchived(false) } },
    { key: 'pending', label: 'Pending', value: stats.pending, icon: Clock3, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: dStatusFilter === 'Pending' && !dShowArchived, onClick: () => { setDStatusFilter('Pending'); setDShowArchived(false) } },
    { key: 'archived', label: 'Archived', value: stats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: dShowArchived, onClick: () => setDShowArchived(true) },
  ]

  const isDisbursementModalOpen = dModalMode !== null
  const isEditingDisbursement = dModalMode !== null && dModalMode !== 'add'

  /* ---------------------------------------------------------------------- */

  if (!permsLoading && !canViewPayments) {
    return (
      <div className="space-y-5 animate-fadeIn">
        <Breadcrumb items={crumbs} />
        <NoAccessState label="Disbursements" />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Track outgoing payments released against supplier bills.</p>
        </div>
        {canManagePayments && (
          <Button variant="primary" size="sm" icon={Plus} onClick={openAddDisbursement}>Add Disbursement</Button>
        )}
      </div>

      {(error || dActionError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error || dActionError}
        </div>
      )}

      {disbursementStatCards && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {disbursementStatCards.map((card) => {
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
      )}

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1 min-w-0 basis-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={dSearch} onChange={(e) => setDSearch(e.target.value)} placeholder="Search by voucher, payee, or reference..." className={`${INPUT} pl-9`} style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0 }} autoComplete="off" />
        </div>
        <select value={dStatusFilter} onChange={(e) => setDStatusFilter(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE}>
          <option value="all">All Statuses</option>
          {['Pending', 'Approved', 'Released', 'Rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1.5 shrink-0">
          <CalendarRange size={15} className="text-muted shrink-0" />
          <input
            type="date"
            value={dDateFrom}
            onChange={(e) => setDDateFrom(e.target.value)}
            max={dDateTo || undefined}
            aria-label="Payment date from"
            className={`${INPUT} scheme-light dark:scheme-dark`}
            style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
          />
          <span className="text-xs text-muted">to</span>
          <input
            type="date"
            value={dDateTo}
            onChange={(e) => setDDateTo(e.target.value)}
            min={dDateFrom || undefined}
            aria-label="Payment date to"
            className={`${INPUT} scheme-light dark:scheme-dark`}
            style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
          />
          {dHasDateFilter && (
            <Tooltip label="Clear date filter" align="end">
              <button
                type="button"
                onClick={clearDDateFilter}
                aria-label="Clear date filter"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
              >
                <X size={15} />
              </button>
            </Tooltip>
          )}
        </div>
        <Button
          variant={dShowArchived ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => setDShowArchived((prev) => !prev)}
          className="shrink-0 whitespace-nowrap"
        >
          Show Archived
        </Button>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Payee</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Bill / Department</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Payment Date</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="bg-surface text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="bg-surface text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">Loading disbursements…</td></tr>
              ) : disbursements.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  {dHasDateFilter ? 'No disbursements fall within the selected payment date range.' : 'No disbursements match your filters.'}
                </td></tr>
              ) : disbursements.map((d) => (
                <tr key={d.disbursement_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{d.payee}</p>
                    <p className="text-xs text-muted">{d.voucher_number} &middot; {d.cash_account_name}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <p className="text-ink">{d.invoice_number}</p>
                    <p className="text-xs text-muted">{d.department_name}</p>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink">{formatDate(d.payment_date)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(d.amount_paid)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${DISBURSEMENT_STATUS_STYLES[d.status]}`}>{d.status}</span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip label="View full record" align="start">
                        <button type="button" onClick={() => openDisbursementDetail(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Print voucher" align="start">
                        <button type="button" onClick={() => handlePrintDisbursement(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Printer size={15} />
                        </button>
                      </Tooltip>

                      {canManagePayments && d.status === 'Pending' && !d.is_archived && (
                        <>
                          <Tooltip label="Edit disbursement" align="start">
                            <button type="button" onClick={() => openEditDisbursement(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <Pencil size={15} />
                            </button>
                          </Tooltip>
                          <Tooltip label="Attach proof" align="start">
                            <label className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 cursor-pointer">
                              <Upload size={15} />
                              <input type="file" className="hidden" onChange={(e) => handleProofUpload(d, e.target.files?.[0])} />
                            </label>
                          </Tooltip>
                        </>
                      )}

                      {canApprovePayments && d.status === 'Pending' && (
                        <>
                          <Tooltip label="Approve" align="start">
                            <button type="button" onClick={() => runAction(() => approveDisbursement(d.disbursement_id))} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-emerald-600 transition-colors duration-150">
                              <ThumbsUp size={15} />
                            </button>
                          </Tooltip>
                          <Tooltip label="Reject" align="start">
                            <button type="button" onClick={() => runAction(() => rejectDisbursement(d.disbursement_id))} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-red-600 transition-colors duration-150">
                              <ThumbsDown size={15} />
                            </button>
                          </Tooltip>
                        </>
                      )}

                      {canApprovePayments && d.status === 'Approved' && (
                        <Tooltip label="Release payment" align="start">
                          <button type="button" onClick={() => runAction(() => releaseDisbursement(d.disbursement_id))} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-primary transition-colors duration-150">
                            <Wallet size={15} />
                          </button>
                        </Tooltip>
                      )}

                      {canManagePayments && (
                        <Tooltip label={d.is_archived ? 'Restore disbursement' : 'Archive disbursement'} align="end">
                          <button
                            type="button"
                            onClick={() => runAction(() => (d.is_archived ? restoreDisbursement(d.disbursement_id) : archiveDisbursement(d.disbursement_id)))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                          >
                            {d.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
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

        {!loading && disbursements.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">
              Showing page {meta.current_page} of {meta.last_page} &middot; {meta.total} disbursements
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDPage((p) => Math.max(1, p - 1))}
                disabled={dPage === 1}
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
                onClick={() => setDPage((p) => Math.min(meta.last_page, p + 1))}
                disabled={dPage === meta.last_page}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Disbursement Add/Edit modal ---- */}
      <Modal
        open={isDisbursementModalOpen}
        onClose={closeDisbursementModal}
        title={isEditingDisbursement ? 'Edit Disbursement' : 'Add Disbursement'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDisbursementModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleDisbursementSubmit} disabled={dSubmitting}>
              {dSubmitting ? 'Saving…' : isEditingDisbursement ? 'Save Changes' : 'Add Disbursement'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleDisbursementSubmit} className="space-y-4">
          {dFormError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{dFormError}</div>
          )}
          {/*
            NOTE: ap_id / department_id / cash_account_id are plain text
            inputs below because this component no longer has the local
            AP_RECORDS/DEPARTMENTS/CASH_ACCOUNTS lookup tables — swap these
            for <select> pickers backed by /accounts-payable, /departments,
            /cash-accounts once those hooks exist.
          */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Related Bill (AP ID)</label>
              <input type="number" value={dForm.ap_id} onChange={(e) => setDForm((f) => ({ ...f, ap_id: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="AP #" />
            </div>
            <div>
              <label className={LABEL}>Department ID</label>
              <input type="number" value={dForm.department_id} onChange={(e) => setDForm((f) => ({ ...f, department_id: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="Department #" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Voucher Number</label>
              <input type="text" value={dForm.voucher_number} onChange={(e) => setDForm((f) => ({ ...f, voucher_number: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="DV-0001" disabled={isEditingDisbursement} />
            </div>
            <div>
              <label className={LABEL}>Payee</label>
              <input type="text" value={dForm.payee} onChange={(e) => setDForm((f) => ({ ...f, payee: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="Northgate Supplies Inc." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Date</label>
              <input type="date" value={dForm.payment_date} onChange={(e) => setDForm((f) => ({ ...f, payment_date: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} />
            </div>
            <div>
              <label className={LABEL}>Amount Paid</label>
              <input type="number" value={dForm.amount_paid} onChange={(e) => setDForm((f) => ({ ...f, amount_paid: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="0.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={dForm.payment_method} onChange={(e) => setDForm((f) => ({ ...f, payment_method: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Cash Account ID</label>
              <input type="number" value={dForm.cash_account_id} onChange={(e) => setDForm((f) => ({ ...f, cash_account_id: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="Cash account #" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Reference Number</label>
              <input type="text" value={dForm.reference_number} onChange={(e) => setDForm((f) => ({ ...f, reference_number: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="REF-DIS-001" />
            </div>
            <div>
              <label className={LABEL}>Currency</label>
              <input type="text" value={dForm.currency} onChange={(e) => setDForm((f) => ({ ...f, currency: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="PHP" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={dForm.remarks} onChange={(e) => setDForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="Optional notes" />
          </div>

          {isEditingDisbursement && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <p className="text-xs font-medium text-muted mb-1">Record Info (read-only)</p>
              <DetailRow label="Approved by" value={dModalMode.approved_by_name} />
              <DetailRow label="Approved at" value={formatDateTime(dModalMode.approved_at)} />
              <DetailRow label="Released by" value={dModalMode.released_by_name} />
              <DetailRow label="Created at" value={formatDateTime(dModalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(dModalMode.updated_at)} />
            </div>
          )}
        </form>
      </Modal>

      {/* ---- Disbursement Detail modal ---- */}
      <Modal
        open={!!dDetailRecord}
        onClose={closeDisbursementDetail}
        title="Disbursement Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDisbursementDetail}>Close</Button>
            {dDetailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrintDisbursement(dDetailRecord)}>Print Voucher</Button>}
          </>
        }
      >
        {dDetailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{dDetailRecord.payee}</p>
                <p className="text-xs text-muted">{dDetailRecord.invoice_number}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${DISBURSEMENT_STATUS_STYLES[dDetailRecord.status]}`}>{dDetailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Department" value={dDetailRecord.department_name} />
                <DetailRow label="Payment Date" value={formatDate(dDetailRecord.payment_date)} />
                <DetailRow label="Amount Paid" value={formatCurrency(dDetailRecord.amount_paid)} />
                <DetailRow label="Payment Method" value={dDetailRecord.payment_method} />
                <DetailRow label="Cash Account" value={dDetailRecord.cash_account_name} />
                <DetailRow label="Reference No." value={dDetailRecord.reference_number} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Approved by" value={dDetailRecord.approved_by_name} />
                <DetailRow label="Approved at" value={formatDateTime(dDetailRecord.approved_at)} />
                <DetailRow label="Released by" value={dDetailRecord.released_by_name} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created at" value={formatDateTime(dDetailRecord.created_at)} />
                <DetailRow label="Updated at" value={formatDateTime(dDetailRecord.updated_at)} />
                {dDetailRecord.is_archived && (
                  <DetailRow label="Archived at" value={formatDateTime(dDetailRecord.archived_at)} />
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}