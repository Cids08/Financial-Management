import { useEffect, useState } from 'react'
import {
  X, Printer, RefreshCw, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  FileText, Users, Download
} from 'lucide-react'
import { formatCurrencyRaw } from '../utils/formatters'
import {
  buildHeader, buildFooter, buildSignatureBlock, SIGNATURE_PRESETS,
  escapeHtml, printHtml, printTimestamp, money,
} from '../utils/print'
import { usePermissions } from '../context/PermissionsContext'
import { usePrivacy } from '../context/PrivacyContext'
import { useCompany } from '../context/CompanyContext'
import { useProfileContext } from '../context/ProfileContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function agingColor(bucket) {
  const MAP = {
    current: 'text-status-success',
    d1_30: 'text-status-danger',
    d31_60: 'text-status-danger',
    d61_90: 'text-status-danger',
    over90: 'text-status-danger font-bold',
  }
  return MAP[bucket] || ''
}

const BUCKET_LABELS = {
  current: 'Current',
  d1_30:   '1-30 days',
  d31_60:  '31-60 days',
  d61_90:  '61-90 days',
  over90:  '90+ days',
}

const INVOICE_STATUS_STYLES = {
  Paid: 'bg-status-success-bg text-status-success border-status-success-border',
  Approved: 'bg-status-success-bg text-status-success border-status-success-border',
  Posted: 'bg-status-success-bg text-status-success border-status-success-border',
  Pending: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  Unpaid: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  'Partially Paid': 'bg-status-warning-bg text-status-warning border-status-warning-border',
  Processing: 'bg-status-info-bg text-status-info border-status-info-border',
  Overdue: 'bg-status-danger-bg text-status-danger border-status-danger-border',
  Rejected: 'bg-status-danger-bg text-status-danger border-status-danger-border',
}

// ─── Print helpers ───────────────────────────────────────────────────────────
//
// Both statements are customer-facing documents, so they carry the full
// company letterhead, a "certified correct" sign-off and a customer
// acknowledgement line. Page numbering isn't possible from CSS in Chrome, so
// the running footer repeats on every sheet and the batch labels each
// statement "N of M" instead.

function printSingleSOA(soa, { company, profile } = {}) {
  const { customer, aging, total_outstanding, invoices, as_of_date } = soa
  const fmt = (v) => money(v)

  const agingBoxes = Object.entries(aging).map(([k, v]) => `
    <div class="pf-aging-box">
      <div class="pf-aging-label">${escapeHtml(BUCKET_LABELS[k] ?? k)}</div>
      <div class="pf-aging-val">${escapeHtml(fmt(v))}</div>
    </div>`).join('')

  const invoiceRows = invoices.map((inv) => `
    <tr>
      <td>${escapeHtml(inv.invoice_number)}</td>
      <td>${escapeHtml(fmtDate(inv.invoice_date))}</td>
      <td>${escapeHtml(fmtDate(inv.due_date))}</td>
      <td class="pf-num">${escapeHtml(fmt(inv.original_amount))}</td>
      <td class="pf-num">${escapeHtml(fmt(inv.paid_amount))}</td>
      <td class="pf-num">${escapeHtml(fmt(inv.remaining_balance))}</td>
      <td class="pf-num" style="color:${inv.days_overdue > 0 ? '#b91c1c' : '#047857'}">${inv.days_overdue > 0 ? `${inv.days_overdue} days` : 'Current'}</td>
      <td>${escapeHtml(BUCKET_LABELS[inv.aging_bucket] ?? inv.aging_bucket)}</td>
    </tr>`).join('')

  const body = `
    ${buildHeader({
      company,
      title: 'Statement of Account',
      meta: [
        ['Customer', customer.customer_name],
        ['Customer Code', customer.customer_code || '—'],
        ['As of Date', fmtDate(as_of_date)],
        ['Total Outstanding', fmt(total_outstanding)],
      ],
      confidential: 'Account Statement',
      preparedBy: profile?.name,
      preparedRole: profile?.role,
    })}

    <div class="pf-customer">
      <div><span>Billing Address</span><strong>${escapeHtml(customer.address || '—')}</strong></div>
      <div><span>Email</span><strong>${escapeHtml(customer.email || '—')}</strong></div>
      <div><span>Attention</span><strong>${escapeHtml(customer.contact_person || '—')}</strong></div>
      <div><span>Contact No.</span><strong>${escapeHtml(customer.contact_number || '—')}</strong></div>
    </div>

    <div class="pf-aging-row">${agingBoxes}</div>

    <table class="pf-grid">
      <thead><tr>
        <th>Invoice #</th><th>Invoice Date</th><th>Due Date</th>
        <th style="text-align:right">Original</th>
        <th style="text-align:right">Paid</th>
        <th style="text-align:right">Balance</th>
        <th style="text-align:right">Days Overdue</th>
        <th>Bucket</th>
      </tr></thead>
      <tbody>${invoiceRows || '<tr><td colspan="8" class="pf-empty">No outstanding invoices.</td></tr>'}</tbody>
      <tfoot><tr>
        <td colspan="5">TOTAL OUTSTANDING</td>
        <td class="pf-num">${escapeHtml(fmt(total_outstanding))}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>

    ${buildSignatureBlock({
      title: 'Certified & Acknowledged',
      blocks: SIGNATURE_PRESETS.statement({
        preparedName: profile?.name,
        preparedRole: profile?.role,
        customerName: customer.customer_name,
      }),
    })}

    <div class="pf-disclaimer">This statement reflects the receivable records held in the system as of the date shown above. Please reconcile against your own records and report any discrepancy within fifteen (15) days.</div>

    ${buildFooter({ company, detail: `Statement of Account — ${customer.customer_name}` })}`

  return printHtml({
    title: `Statement of Account - ${customer.customer_name}`,
    body,
    company,
    spec: 'statement',
  })
}

function printBatchSOA(batch, { company, profile } = {}) {
  const fmt = (v) => money(v)

  // One statement per page. page-break-after is applied BETWEEN pages only
  // (not on the last block) — applying it to the last one too is what used
  // to leave a trailing blank sheet after every batch print.
  const pages = batch.map((soa, i) => {
    const { customer, aging, total_outstanding, invoices, as_of_date } = soa
    const last = i === batch.length - 1

    const rows = invoices.map((inv) => `
      <tr>
        <td>${escapeHtml(inv.invoice_number)}</td>
        <td>${escapeHtml(fmtDate(inv.due_date))}</td>
        <td class="pf-num">${escapeHtml(fmt(inv.remaining_balance))}</td>
        <td style="color:${inv.days_overdue > 0 ? '#b91c1c' : '#047857'}">${inv.days_overdue > 0 ? `${inv.days_overdue} days` : 'Current'}</td>
      </tr>`).join('')

    const agingChips = Object.entries(aging).map(([k, v]) =>
      `<span class="pf-chip"><b>${escapeHtml(BUCKET_LABELS[k] ?? k)}:</b> ${escapeHtml(fmt(v))}</span>`).join('')

    return `
    <section class="pf-sheet${last ? '' : ' pf-sheet-break'}">
      ${buildHeader({
        company,
        title: 'Statement of Account',
        meta: [
          ['Customer', customer.customer_name],
          ['Customer Code', customer.customer_code || '—'],
          ['As of Date', fmtDate(as_of_date)],
          ['Total Outstanding', fmt(total_outstanding)],
        ],
        confidential: 'Account Statement',
      })}

      <div class="pf-customer">
        <div><span>Email</span><strong>${escapeHtml(customer.email || '—')}</strong></div>
        <div><span>Address</span><strong>${escapeHtml(customer.address || '—')}</strong></div>
        <div><span>Invoices</span><strong>${invoices.length}</strong></div>
        <div><span>Statement</span><strong>${i + 1} of ${batch.length}</strong></div>
      </div>

      <div class="pf-chip-row">${agingChips}</div>

      <table class="pf-grid">
        <thead><tr>
          <th>Invoice #</th><th>Due Date</th>
          <th style="text-align:right">Balance</th>
          <th>Days Overdue</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="pf-empty">No outstanding invoices.</td></tr>'}</tbody>
        <tfoot><tr>
          <td colspan="2">TOTAL OUTSTANDING</td>
          <td class="pf-num">${escapeHtml(fmt(total_outstanding))}</td>
          <td></td>
        </tr></tfoot>
      </table>

      ${buildSignatureBlock({
        title: 'Certified & Acknowledged',
        blocks: SIGNATURE_PRESETS.statement({
          preparedName: profile?.name,
          preparedRole: profile?.role,
          customerName: customer.customer_name,
        }),
      })}

      ${buildFooter({ company, detail: `Statement ${i + 1} of ${batch.length} — ${customer.customer_name}` })}
    </section>`
  }).join('')

  const body = `
    <div class="pf-batch-head">
      <div class="pf-title">Batch Statement of Accounts</div>
      <div class="pf-subtitle">${batch.length} customer(s) with outstanding balances &middot; printed ${escapeHtml(printTimestamp())}</div>
    </div>
    ${pages}`

  return printHtml({
    title: 'Batch Statement of Accounts',
    body,
    company,
    spec: 'statementBatch',
  })
}

// ─── Aging Summary Table ──────────────────────────────────────────────────────

function AgingTable({ rows, onSelectCustomer }) {
  const [sortField, setSortField] = useState('total_outstanding')
  const [sortDir,   setSortDir]   = useState('desc')

  const toggle = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const va = a[sortField] ?? 0
    const vb = b[sortField] ?? 0
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
  })

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronDown size={11} className="opacity-30" />
    return sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
  }

  const TH = ({ field, label, right }) => (
    <th
      className={`px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide cursor-pointer select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
      onClick={() => toggle(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label} <SortIcon field={field} />
      </span>
    </th>
  )

  const buckets = ['current', 'd1_30', 'd31_60', 'd61_90', 'over90']
  const totals  = buckets.reduce((acc, b) => {
    acc[b] = rows.reduce((s, r) => s + (r[b] || 0), 0)
    return acc
  }, { total_outstanding: rows.reduce((s, r) => s + (r.total_outstanding || 0), 0) })

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
        No outstanding invoices found.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-bg border-b border-border sticky top-0 z-10">
          <tr>
            <TH field="customer_name" label="Customer" />
            <TH field="invoice_count" label="Invoices" right />
            <TH field="current"       label="Current"  right />
            <TH field="d1_30"         label="1-30 d"   right />
            <TH field="d31_60"        label="31-60 d"  right />
            <TH field="d61_90"        label="61-90 d"  right />
            <TH field="over90"        label="90+ d"    right />
            <TH field="total_outstanding" label="Total" right />
            <th className="px-3 py-3 text-xs font-semibold text-muted uppercase tracking-wide text-right">
              SOA
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row) => (
            <tr
              key={row.customer_id}
              className="hover:bg-bg transition-colors cursor-pointer"
              onClick={() => onSelectCustomer(row.customer_id)}
            >
              <td className="px-3 py-3 font-medium text-ink">
                <div>{row.customer_name}</div>
                <div className="text-xs text-muted">{row.customer_code}</div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-muted">{row.invoice_count}</td>
              {buckets.map((b) => (
                <td key={b} className={`px-3 py-3 text-right tabular-nums ${agingColor(b)}`}>
                  {row[b] > 0 ? formatCurrencyRaw(row[b]) : <span className="text-muted/60">—</span>}
                </td>
              ))}
              <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                {formatCurrencyRaw(row.total_outstanding)}
              </td>
              <td className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectCustomer(row.customer_id) }}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-ink hover:bg-bg transition-colors"
                >
                  <FileText size={12} /> View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-bg border-t-2 border-border font-semibold text-sm">
          <tr>
            <td className="px-3 py-3 text-ink">TOTAL ({rows.length} customers)</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">
              {rows.reduce((s, r) => s + r.invoice_count, 0)}
            </td>
            {buckets.map((b) => (
              <td key={b} className={`px-3 py-3 text-right tabular-nums ${agingColor(b)}`}>
                {totals[b] > 0 ? formatCurrencyRaw(totals[b]) : <span className="text-muted/60">—</span>}
              </td>
            ))}
            <td className="px-3 py-3 text-right tabular-nums text-ink">
              {formatCurrencyRaw(totals.total_outstanding)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── Customer SOA Detail View ─────────────────────────────────────────────────

function CustomerSOADetail({ soa, onBack, onPrint }) {
  const { customer, aging, total_outstanding, invoices, as_of_date } = soa
  const buckets = ['current', 'd1_30', 'd31_60', 'd61_90', 'over90']

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-1 flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors">
            ← Back to aging matrix
          </button>
          <h3 className="text-base font-bold text-ink">{customer.customer_name}</h3>
          <p className="text-xs text-muted">{customer.customer_code} · {customer.email}</p>
          {customer.address && <p className="text-xs text-muted">{customer.address}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">As of {fmtDate(as_of_date)}</p>
          <p className="text-xl font-bold text-ink">{formatCurrencyRaw(total_outstanding)}</p>
          <p className="text-xs text-muted">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-5 gap-2">
        {buckets.map((b) => (
          <div key={b} className="rounded-lg border border-border bg-bg p-3 text-center">
            <p className="text-xs text-muted mb-1">{BUCKET_LABELS[b]}</p>
            <p className={`text-sm font-bold ${agingColor(b)}`}>
              {aging[b] > 0 ? formatCurrencyRaw(aging[b]) : <span className="text-muted/60">—</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Invoice table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg border-b border-border">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide">Invoice #</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">Invoice Date</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">Due Date</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wide">Original</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wide">Paid</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wide">Balance</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-muted uppercase tracking-wide whitespace-nowrap">Days Overdue</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide">Bucket</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoices.map((inv) => (
              <tr key={inv.ar_id} className="hover:bg-bg transition-colors">
                <td className="px-3 py-3 font-mono text-xs text-ink">{inv.invoice_number}</td>
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-xs">{formatCurrencyRaw(inv.original_amount)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-xs text-status-success">{formatCurrencyRaw(inv.paid_amount)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold text-ink">{formatCurrencyRaw(inv.remaining_balance)}</td>
                <td className={`px-3 py-3 text-right text-xs font-semibold ${inv.days_overdue > 0 ? 'text-status-danger' : 'text-status-success'}`}>
                  {inv.days_overdue > 0 ? `${inv.days_overdue} days` : 'Current'}
                </td>
                <td className={`px-3 py-3 text-xs font-medium ${agingColor(inv.aging_bucket)}`}>
                  {BUCKET_LABELS[inv.aging_bucket] ?? inv.aging_bucket}
                </td>
                <td className="px-3 py-3 text-xs">
                  <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 font-medium ${INVOICE_STATUS_STYLES[inv.status] || 'bg-status-neutral-bg text-status-neutral border-status-neutral-border'}`}>
                    {inv.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-bg border-t-2 border-border font-semibold">
            <tr>
              <td className="px-3 py-3 text-xs text-ink" colSpan={5}>TOTAL OUTSTANDING</td>
              <td className="px-3 py-3 text-right tabular-nums text-sm font-bold text-ink">{formatCurrencyRaw(total_outstanding)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Print button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-ink shadow-sm hover:bg-bg transition-colors"
        >
          <Printer size={14} /> Print SOA
        </button>
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function StatementOfAccountModal({ open, onClose, fetchAgingSummary, fetchCustomerSoa, fetchBatchSoa }) {
  const { hasPermission } = usePermissions()
  const company = useCompany()
  const { profile } = useProfileContext()

  // Re-render when the privacy flag flips; this document always shows real amounts.
  usePrivacy()

  // Letterhead + signatory context shared by both print paths.
  const printContext = { company, profile }

  const canBatchPrint = hasPermission('ar.manage')

  const [view,         setView]         = useState('aging')   // 'aging' | 'soa'
  const [agingRows,    setAgingRows]    = useState([])
  const [selectedSoa,  setSelectedSoa]  = useState(null)
  const [loadingAging, setLoadingAging] = useState(false)
  const [loadingSoa,   setLoadingSoa]   = useState(false)
  const [loadingBatch, setLoadingBatch] = useState(false)
  const [agingError,   setAgingError]   = useState(null)
  const [soaError,     setSoaError]     = useState(null)

  // Load aging matrix when modal opens
  useEffect(() => {
    if (!open) return
    setView('aging')
    setSelectedSoa(null)
    loadAging()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function loadAging() {
    setLoadingAging(true)
    setAgingError(null)
    const res = await fetchAgingSummary()
    if (res.success) {
      setAgingRows(res.data)
    } else {
      setAgingError(res.message)
    }
    setLoadingAging(false)
  }

  async function openCustomerSOA(customerId) {
    setLoadingSoa(true)
    setSoaError(null)
    const res = await fetchCustomerSoa(customerId)
    if (res.success) {
      setSelectedSoa(res.data)
      setView('soa')
    } else {
      setSoaError(res.message)
    }
    setLoadingSoa(false)
  }

  async function handleBatchPrint() {
    setLoadingBatch(true)
    const res = await fetchBatchSoa()
    if (res.success) {
      printBatchSOA(res.data, printContext)
    } else {
      setAgingError(res.message || 'Failed to load batch statements.')
    }
    setLoadingBatch(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 flex flex-col w-full max-w-6xl max-h-[90vh] rounded-2xl bg-surface shadow-2xl">

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
              <Users size={18} className="text-primary-dark dark:text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Customer Aging & Statement of Account</h2>
              <p className="text-xs text-muted">
                {view === 'soa' && selectedSoa
                  ? `Viewing SOA  -  ${selectedSoa.customer.customer_name}`
                  : 'Outstanding invoice aging by customer'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {view === 'aging' && (
              <>
                <button
                  type="button"
                  onClick={loadAging}
                  disabled={loadingAging}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-ink transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw size={13} className={loadingAging ? 'animate-spin' : ''} />
                  Refresh
                </button>
                {canBatchPrint && (
                  <button
                    type="button"
                    onClick={handleBatchPrint}
                    disabled={loadingBatch || agingRows.length === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-dark px-3 py-1.5 text-xs font-medium text-black transition-colors disabled:opacity-50"
                    title="Print SOA for all customers"
                  >
                    {loadingBatch ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    Batch Print All
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error banners */}
          {agingError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-status-danger-border bg-status-danger-bg p-3 text-xs text-status-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {agingError}
            </div>
          )}
          {soaError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-status-danger-border bg-status-danger-bg p-3 text-xs text-status-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {soaError}
            </div>
          )}

          {/* Loading state */}
          {(loadingAging || loadingSoa) && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" />
              {loadingAging ? 'Loading aging data…' : 'Loading statement of account…'}
            </div>
          )}

          {/* Aging matrix */}
          {!loadingAging && !loadingSoa && view === 'aging' && (
            <AgingTable
              rows={agingRows}
              onSelectCustomer={openCustomerSOA}
            />
          )}

          {/* Single customer SOA detail */}
          {!loadingAging && !loadingSoa && view === 'soa' && selectedSoa && (
            <CustomerSOADetail
              soa={selectedSoa}
              onBack={() => { setView('aging'); setSelectedSoa(null) }}
              onPrint={() => printSingleSOA(selectedSoa, printContext)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

