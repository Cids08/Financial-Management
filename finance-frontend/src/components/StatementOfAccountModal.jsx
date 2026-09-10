import { useEffect, useState } from 'react'
import {
  X, Printer, RefreshCw, AlertTriangle, Loader2, ChevronDown, ChevronUp,
  FileText, Users, Download
} from 'lucide-react'
import { formatCurrency } from '../utils/formatters'
import { usePermissions } from '../context/PermissionsContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function agingColor(bucket) {
  const MAP = {
    current: 'text-emerald-700',
    d1_30:   'text-amber-600',
    d31_60:  'text-orange-600',
    d61_90:  'text-red-600',
    over90:  'text-red-800 font-bold',
  }
  return MAP[bucket] || ''
}

const BUCKET_LABELS = {
  current: 'Current',
  d1_30:   '1–30 days',
  d31_60:  '31–60 days',
  d61_90:  '61–90 days',
  over90:  '90+ days',
}

// ─── Print helpers ───────────────────────────────────────────────────────────

function printSingleSOA(soa) {
  const { customer, aging, total_outstanding, invoices, as_of_date } = soa
  const fmt = (v) => `₱ ${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

  const invoiceRows = invoices.map((inv) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:6px 8px">${inv.invoice_number}</td>
      <td style="padding:6px 8px">${fmtDate(inv.invoice_date)}</td>
      <td style="padding:6px 8px">${fmtDate(inv.due_date)}</td>
      <td style="padding:6px 8px;text-align:right">${fmt(inv.original_amount)}</td>
      <td style="padding:6px 8px;text-align:right">${fmt(inv.paid_amount)}</td>
      <td style="padding:6px 8px;text-align:right;font-weight:600">${fmt(inv.remaining_balance)}</td>
      <td style="padding:6px 8px;text-align:right;color:${inv.days_overdue > 0 ? '#dc2626' : '#059669'}">${inv.days_overdue > 0 ? inv.days_overdue + ' days' : 'Current'}</td>
      <td style="padding:6px 8px">${BUCKET_LABELS[inv.aging_bucket] ?? inv.aging_bucket}</td>
      <td style="padding:6px 8px">${inv.status}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>SOA – ${customer.customer_name}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 24px; }
      h2 { margin: 0 0 2px; font-size: 18px; }
      p  { margin: 2px 0; color: #64748b; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; padding: 8px; text-align: left; }
      td { padding: 6px 8px; vertical-align: top; }
      .aging-box { display:inline-block; padding:6px 16px; margin:4px; border-radius:8px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; }
      .aging-box .label { font-size:10px; color:#64748b; }
      .aging-box .val   { font-size:15px; font-weight:700; }
      @media print { @page { size: A4 landscape; margin: 16mm; } }
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h2>Statement of Account</h2>
        <p><strong>${customer.customer_name}</strong> (${customer.customer_code ?? ''})</p>
        <p>${customer.address ?? ''}</p>
        <p>${customer.email ?? ''} | ${customer.contact_person ?? ''} ${customer.contact_number ? '| ' + customer.contact_number : ''}</p>
      </div>
      <div style="text-align:right">
        <p style="font-size:10px;color:#94a3b8">As of ${fmtDate(as_of_date)}</p>
        <p style="font-size:20px;font-weight:700;color:#1e293b">Total: ${fmt(total_outstanding)}</p>
      </div>
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0">
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
      ${Object.entries(aging).map(([k, v]) =>
        `<div class="aging-box"><div class="label">${BUCKET_LABELS[k]}</div><div class="val">${fmt(v)}</div></div>`
      ).join('')}
    </div>
    <table>
      <thead><tr>
        <th>Invoice #</th><th>Invoice Date</th><th>Due Date</th>
        <th style="text-align:right">Original</th>
        <th style="text-align:right">Paid</th>
        <th style="text-align:right">Balance</th>
        <th style="text-align:right">Days Overdue</th>
        <th>Bucket</th><th>Status</th>
      </tr></thead>
      <tbody>${invoiceRows}</tbody>
      <tfoot><tr style="background:#f1f5f9;font-weight:700">
        <td colspan="5" style="padding:8px">TOTAL OUTSTANDING</td>
        <td style="padding:8px;text-align:right">${fmt(total_outstanding)}</td>
        <td colspan="3"></td>
      </tr></tfoot>
    </table>
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
  </body></html>`

  const w = window.open('', '_blank', 'width=1000,height=700')
  if (w) { w.document.write(html); w.document.close() }
}

function printBatchSOA(batch) {
  const fmt = (v) => `₱ ${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

  const pages = batch.map((soa) => {
    const { customer, aging, total_outstanding, invoices, as_of_date } = soa
    const rows = invoices.map((inv) => `
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:4px 6px">${inv.invoice_number}</td>
        <td style="padding:4px 6px">${fmtDate(inv.due_date)}</td>
        <td style="padding:4px 6px;text-align:right">${fmt(inv.remaining_balance)}</td>
        <td style="padding:4px 6px;color:${inv.days_overdue > 0 ? '#dc2626' : '#059669'}">${inv.days_overdue > 0 ? inv.days_overdue + ' days' : 'Current'}</td>
        <td style="padding:4px 6px">${inv.status}</td>
      </tr>`).join('')
    return `
      <div style="page-break-after:always;padding:20px 0">
        <div style="display:flex;justify-content:space-between">
          <div>
            <h3 style="margin:0">${customer.customer_name} (${customer.customer_code ?? ''})</h3>
            <p style="margin:2px 0;color:#64748b;font-size:11px">${customer.email ?? ''} | ${customer.address ?? ''}</p>
          </div>
          <div style="text-align:right">
            <p style="font-size:10px;color:#94a3b8">As of ${fmtDate(as_of_date)}</p>
            <p style="font-size:16px;font-weight:700">${fmt(total_outstanding)}</p>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap">
          ${Object.entries(aging).map(([k, v]) =>
            `<span style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:3px 10px;font-size:11px">
              <b>${BUCKET_LABELS[k]}:</b> ${fmt(v)}
            </span>`
          ).join('')}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#f1f5f9">
            <th style="text-align:left;padding:5px 6px">Invoice #</th>
            <th style="text-align:left;padding:5px 6px">Due Date</th>
            <th style="text-align:right;padding:5px 6px">Balance</th>
            <th style="text-align:left;padding:5px 6px">Days Overdue</th>
            <th style="text-align:left;padding:5px 6px">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Batch SOA</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 20px; }
      h2   { margin: 0 0 4px; }
      @media print { @page { size: A4; margin: 12mm; } }
    </style></head><body>
    <h2>Batch Statement of Accounts</h2>
    <p style="color:#64748b;font-size:11px">${batch.length} customer(s) with outstanding balances</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0">
    ${pages}
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
  </body></html>`

  const w = window.open('', '_blank', 'width=1000,height=700')
  if (w) { w.document.write(html); w.document.close() }
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
        <thead className="bg-gray-50 border-b border-border sticky top-0 z-10">
          <tr>
            <TH field="customer_name" label="Customer" />
            <TH field="invoice_count" label="Invoices" right />
            <TH field="current"       label="Current"  right />
            <TH field="d1_30"         label="1–30 d"   right />
            <TH field="d31_60"        label="31–60 d"  right />
            <TH field="d61_90"        label="61–90 d"  right />
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
              className="hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => onSelectCustomer(row.customer_id)}
            >
              <td className="px-3 py-3 font-medium text-ink">
                <div>{row.customer_name}</div>
                <div className="text-xs text-muted">{row.customer_code}</div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-muted">{row.invoice_count}</td>
              {buckets.map((b) => (
                <td key={b} className={`px-3 py-3 text-right tabular-nums ${agingColor(b)}`}>
                  {row[b] > 0 ? formatCurrency(row[b]) : <span className="text-gray-300">—</span>}
                </td>
              ))}
              <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                {formatCurrency(row.total_outstanding)}
              </td>
              <td className="px-3 py-3 text-right">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectCustomer(row.customer_id) }}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-ink hover:bg-gray-100 transition-colors"
                >
                  <FileText size={12} /> View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t-2 border-border font-semibold text-sm">
          <tr>
            <td className="px-3 py-3 text-ink">TOTAL ({rows.length} customers)</td>
            <td className="px-3 py-3 text-right tabular-nums text-muted">
              {rows.reduce((s, r) => s + r.invoice_count, 0)}
            </td>
            {buckets.map((b) => (
              <td key={b} className={`px-3 py-3 text-right tabular-nums ${agingColor(b)}`}>
                {totals[b] > 0 ? formatCurrency(totals[b]) : <span className="text-gray-300">—</span>}
              </td>
            ))}
            <td className="px-3 py-3 text-right tabular-nums text-ink">
              {formatCurrency(totals.total_outstanding)}
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
          <p className="text-xl font-bold text-ink">{formatCurrency(total_outstanding)}</p>
          <p className="text-xs text-muted">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Aging buckets */}
      <div className="grid grid-cols-5 gap-2">
        {buckets.map((b) => (
          <div key={b} className="rounded-lg border border-border bg-gray-50 p-3 text-center">
            <p className="text-xs text-muted mb-1">{BUCKET_LABELS[b]}</p>
            <p className={`text-sm font-bold ${agingColor(b)}`}>
              {aging[b] > 0 ? formatCurrency(aging[b]) : <span className="text-gray-300">—</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Invoice table */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-border">
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
              <tr key={inv.ar_id} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-3 font-mono text-xs text-ink">{inv.invoice_number}</td>
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-xs">{formatCurrency(inv.original_amount)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-xs text-emerald-600">{formatCurrency(inv.paid_amount)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold text-ink">{formatCurrency(inv.remaining_balance)}</td>
                <td className={`px-3 py-3 text-right text-xs font-semibold ${inv.days_overdue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {inv.days_overdue > 0 ? `${inv.days_overdue} days` : 'Current'}
                </td>
                <td className={`px-3 py-3 text-xs font-medium ${agingColor(inv.aging_bucket)}`}>
                  {BUCKET_LABELS[inv.aging_bucket] ?? inv.aging_bucket}
                </td>
                <td className="px-3 py-3 text-xs text-muted">{inv.status}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-border font-semibold">
            <tr>
              <td className="px-3 py-3 text-xs text-ink" colSpan={5}>TOTAL OUTSTANDING</td>
              <td className="px-3 py-3 text-right tabular-nums text-sm font-bold text-ink">{formatCurrency(total_outstanding)}</td>
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
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm hover:bg-gray-50 transition-colors"
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
      printBatchSOA(res.data)
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
      <div className="relative z-10 flex flex-col w-full max-w-6xl max-h-[90vh] rounded-2xl bg-white shadow-2xl">

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              <Users size={18} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Customer Aging & Statement of Account</h2>
              <p className="text-xs text-muted">
                {view === 'soa' && selectedSoa
                  ? `Viewing SOA — ${selectedSoa.customer.customer_name}`
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
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
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
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-ink transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error banners */}
          {agingError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {agingError}
            </div>
          )}
          {soaError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
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
              onPrint={() => printSingleSOA(selectedSoa)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

