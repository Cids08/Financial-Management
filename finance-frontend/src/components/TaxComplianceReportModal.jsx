// src/components/TaxComplianceReportModal.jsx
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  Printer,
  Receipt,
  X,
} from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import { apiFetch } from '../utils/api'
import { formatCurrency } from '../utils/formatters'
import { useCompany } from '../context/CompanyContext'
import { useProfileContext } from '../context/ProfileContext'

const BIR_FORM_MAP = {
  'VAT': 'BIR Form 2550M / 2550Q',
  'Withholding Tax': 'BIR Form 0619-E / 1601-E',
  'Income Tax': 'BIR Form 1702Q / 1702-RT',
  'Percentage Tax': 'BIR Form 2551Q',
  'Documentary Stamp Tax': 'BIR Form 2000',
  'Local Business Tax': 'LGU Statement of Account',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function downloadCsv(filename, rows) {
  const content = rows
    .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function TaxComplianceReportModal({ open, onClose }) {
  const company = useCompany()
  const { profile } = useProfileContext()

  const [allObligations, setAllObligations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Filter criteria for report
  const [filterTaxType, setFilterTaxType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterYear, setFilterYear] = useState('all')

  // Fetch full dataset across all pages when modal opens
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError('')

    apiFetch('/api/tax-obligations?per_page=500')
      .then((res) => res.json())
      .then((json) => {
        if (active && json.data) {
          const list = Array.isArray(json.data) ? json.data : (json.data.data || [])
          setAllObligations(list)
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load tax records.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [open])

  const availableYears = useMemo(() => {
    const set = new Set()
    allObligations.forEach((o) => {
      if (o.tax_period) {
        const y = o.tax_period.slice(0, 4)
        if (y && !isNaN(y)) set.add(y)
      }
    })
    return Array.from(set).sort().reverse()
  }, [allObligations])

  // Filtered dataset
  const filteredData = useMemo(() => {
    return allObligations.filter((o) => {
      if (filterTaxType !== 'all' && o.tax_type !== filterTaxType) return false
      if (filterStatus !== 'all' && o.status !== filterStatus) return false
      if (filterYear !== 'all' && !o.tax_period?.startsWith(filterYear)) return false
      return true
    })
  }, [allObligations, filterTaxType, filterStatus, filterYear])

  // Calculated totals
  const totals = useMemo(() => {
    let assessed = 0
    let paid = 0
    let outstanding = 0
    filteredData.forEach((o) => {
      const amt = Number(o.amount ?? o.tax_amount ?? 0)
      assessed += amt
      if (o.status === 'Paid') {
        paid += amt
      } else {
        outstanding += amt
      }
    })
    return { assessed, paid, outstanding, count: filteredData.length }
  }, [filteredData])

  const handleExportCsv = () => {
    const today = new Date().toISOString().slice(0, 10)
    const header = [
      'BIR Form Code',
      'Tax Type',
      'Tax Period',
      'Due Date',
      'Status',
      'Taxable Amount (PHP)',
      'Tax Rate (%)',
      'Tax Amount Due (PHP)',
      'Payment Date',
      'Reference / eFPS No.',
      'Paid From (Bank Account)',
      'Recorded Expense ID',
      'Remarks',
    ]

    const rows = [
      header,
      ...filteredData.map((o) => [
        BIR_FORM_MAP[o.tax_type] || 'BIR Tax Return',
        o.tax_type,
        o.tax_period,
        o.due_date || '',
        o.status,
        Number(o.taxable_amount || 0).toFixed(2),
        Number(o.tax_rate || 0).toFixed(2),
        Number(o.amount ?? o.tax_amount ?? 0).toFixed(2),
        o.payment_date || '',
        o.reference_number || '',
        o.cash_account_name
          ? `${o.cash_account_name} (${o.cash_account_bank || o.cash_account_code || ''})`
          : '',
        o.expense_id ? `#${o.expense_id}` : '',
        o.remarks || '',
      ]),
      [],
      ['SUMMARY TOTALS'],
      ['Total Assessed Tax', '', '', '', '', '', '', totals.assessed.toFixed(2)],
      ['Total Tax Remitted (Paid)', '', '', '', '', '', '', totals.paid.toFixed(2)],
      ['Total Outstanding Payable', '', '', '', '', '', '', totals.outstanding.toFixed(2)],
    ]

    downloadCsv(`tax-compliance-summary-${today}.csv`, rows)
  }

  const handlePrintFormalReport = () => {
    const win = window.open('', '_blank', 'width=950,height=900')
    if (!win) return

    const todayStr = new Date().toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const generatedBy = profile
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
      : 'Finance Department'

    const rowsHtml = filteredData
      .map(
        (o) => `
        <tr>
          <td>
            <strong>${o.tax_type}</strong><br/>
            <span class="bir-code">${BIR_FORM_MAP[o.tax_type] || 'BIR Return'}</span>
          </td>
          <td>${o.tax_period}</td>
          <td>${formatDate(o.due_date)}</td>
          <td>
            <span class="badge badge-${(o.status || 'Pending').toLowerCase()}">${o.status}</span>
          </td>
          <td class="num">₱${Number(o.taxable_amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="num">${o.tax_rate}%</td>
          <td class="num font-bold">₱${Number(o.amount ?? o.tax_amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>
            ${
              o.status === 'Paid'
                ? `<strong>${formatDate(o.payment_date)}</strong><br/><span class="sub">${o.reference_number || 'N/A'}${o.cash_account_name ? ` • ${o.cash_account_name}` : ''}</span>`
                : '<span class="text-muted">Unpaid</span>'
            }
          </td>
        </tr>
      `
      )
      .join('')

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>BIR Tax Compliance & Filing Summary — ${company?.name || 'FMS'}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; padding: 40px; margin: 0; line-height: 1.4; }
            .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
            .letterhead h1 { margin: 0 0 4px; font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
            .letterhead p { margin: 0; font-size: 12px; color: #475569; }
            .title-section { margin-bottom: 24px; text-align: center; }
            .title-section h2 { margin: 0 0 6px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; color: #1e293b; }
            .title-section p { margin: 0; font-size: 12px; color: #64748b; }
            
            .summary-cards { display: flex; gap: 12px; margin-bottom: 24px; }
            .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
            .card .lbl { font-size: 11px; text-transform: uppercase; font-weight: 600; color: #64748b; margin-bottom: 4px; }
            .card .val { font-size: 16px; font-weight: 700; color: #0f172a; font-family: monospace; }

            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11.5px; }
            th { background: #f1f5f9; border-bottom: 2px solid #cbd5e1; padding: 8px 6px; text-align: left; font-weight: 700; color: #334155; text-transform: uppercase; font-size: 10.5px; }
            td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
            th.num, td.num { text-align: right; }
            .font-bold { font-weight: 700; }
            .bir-code { font-size: 10px; color: #64748b; }
            .sub { font-size: 10px; color: #64748b; }
            .text-muted { color: #94a3b8; font-style: italic; }

            .badge { display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
            .badge-paid { background: #dcfce7; color: #15803d; }
            .badge-pending { background: #fef3c7; color: #b45309; }
            .badge-overdue { background: #fee2e2; color: #b91c1c; }

            .totals-row td { background: #f8fafc; font-weight: 700; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; }
            
            .certification { margin-top: 36px; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fafafa; font-size: 11.5px; color: #334155; }
            .signatures { display: flex; justify-content: space-between; margin-top: 48px; }
            .sig-block { width: 42%; border-top: 1px solid #0f172a; padding-top: 8px; font-size: 12px; }
            .sig-block .role { font-size: 11px; color: #64748b; }

            @media print {
              body { padding: 0; }
              @page { margin: 1.5cm; }
            }
          </style>
        </head>
        <body>
          <div class="letterhead">
            <div>
              <h1>${company?.name || 'Financial Management System'}</h1>
              <p>${company?.address || 'Tax & Corporate Compliance Department'}</p>
              <p>${company?.phone ? `Tel: ${company.phone}` : ''} ${company?.email ? `• Email: ${company.email}` : ''}</p>
            </div>
            <div style="text-align: right;">
              <p><strong>Official Compliance Report</strong></p>
              <p>Generated: ${todayStr}</p>
              <p>Prepared by: ${generatedBy}</p>
            </div>
          </div>

          <div class="title-section">
            <h2>Philippine BIR Statutory Tax Declaration Summary</h2>
            <p>Scope: ${filterYear !== 'all' ? `FY ${filterYear}` : 'All Periods'} • Status: ${filterStatus.toUpperCase()} • Tax Type: ${filterTaxType.toUpperCase()}</p>
          </div>

          <div class="summary-cards">
            <div class="card">
              <div class="lbl">Total Filings</div>
              <div class="val">${totals.count}</div>
            </div>
            <div class="card">
              <div class="lbl">Total Assessed Tax</div>
              <div class="val">₱${totals.assessed.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="card">
              <div class="lbl">Total Remitted (Paid)</div>
              <div class="val" style="color: #16a34a;">₱${totals.paid.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div class="card">
              <div class="lbl">Outstanding Payable</div>
              <div class="val" style="color: #dc2626;">₱${totals.outstanding.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Tax Type / BIR Form</th>
                <th>Period</th>
                <th>Due Date</th>
                <th>Status</th>
                <th class="num">Taxable Base</th>
                <th class="num">Rate</th>
                <th class="num">Tax Due</th>
                <th>Settlement / Ref No.</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="8" style="text-align:center; padding: 20px;">No tax records found matching the selected filters.</td></tr>'}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="4">TOTALS (${totals.count} obligations)</td>
                <td class="num">—</td>
                <td class="num">—</td>
                <td class="num">₱${totals.assessed.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td><strong>Paid: ₱${totals.paid.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
              </tr>
            </tfoot>
          </table>

          <div class="certification">
            <strong>COMPLIANCE CERTIFICATION:</strong> I hereby certify that the statutory tax declarations and payment records summarized above reflect the official company books and remittances filed in accordance with the regulations of the Philippine Bureau of Internal Revenue (BIR) and applicable local ordinances.
          </div>

          <div class="signatures">
            <div class="sig-block">
              <strong>${generatedBy}</strong>
              <div class="role">Prepared by: Tax Accountant / Compliance Officer</div>
              <div class="role">Date: ________________________</div>
            </div>
            <div class="sig-block">
              <strong>Authorized Signatory</strong>
              <div class="role">Reviewed & Approved by: Finance Manager / CFO</div>
              <div class="role">Date: ________________________</div>
            </div>
          </div>
        </body>
      </html>
    `)

    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
    }, 400)
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Statutory Tax Compliance & Filing Summary Report"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon={FileSpreadsheet}
            onClick={handleExportCsv}
            disabled={loading || filteredData.length === 0}
          >
            Export CSV
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Printer}
            onClick={handlePrintFormalReport}
            disabled={loading || filteredData.length === 0}
          >
            Print Formal Report (PDF)
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Top filter row */}
        <div className="rounded-xl border border-border bg-bg/50 p-3.5 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider">
            <Filter size={13} />
            <span>Report Filters & Scope</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-muted mb-1">Fiscal Year</label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg border border-border bg-surface text-xs !text-ink focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Fiscal Years</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    FY {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted mb-1">Tax Type</label>
              <select
                value={filterTaxType}
                onChange={(e) => setFilterTaxType(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg border border-border bg-surface text-xs !text-ink focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Tax Types</option>
                {Object.keys(BIR_FORM_MAP).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-muted mb-1">Filing Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg border border-border bg-surface text-xs !text-ink focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">All Statuses</option>
                <option value="Paid">Paid / Remitted</option>
                <option value="Pending">Pending</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="py-8 text-center text-xs text-muted">
            <Loader2 size={16} className="inline animate-spin mr-2" />
            Loading complete tax declaration history…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </div>
        )}

        {!loading && (
          <>
            {/* Executive Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-lg border border-border bg-surface">
                <span className="text-[11px] text-muted block">Filings</span>
                <span className="text-base font-bold text-ink">{totals.count}</span>
              </div>
              <div className="p-2.5 rounded-lg border border-border bg-surface">
                <span className="text-[11px] text-muted block">Total Assessed</span>
                <span className="text-sm font-bold text-ink truncate block">
                  {formatCurrency(totals.assessed)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block">
                  Remitted (Paid)
                </span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 truncate block">
                  {formatCurrency(totals.paid)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-500/20 dark:bg-red-500/5">
                <span className="text-[11px] text-red-600 dark:text-red-400 block">
                  Outstanding
                </span>
                <span className="text-sm font-bold text-red-600 dark:text-red-400 truncate block">
                  {formatCurrency(totals.outstanding)}
                </span>
              </div>
            </div>

            {/* Quick Preview Table */}
            <div className="rounded-lg border border-border overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface border-b border-border sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-muted font-medium">Tax / Form</th>
                    <th className="text-left px-2 py-2 text-muted font-medium">Period</th>
                    <th className="text-left px-2 py-2 text-muted font-medium">Due Date</th>
                    <th className="text-left px-2 py-2 text-muted font-medium">Status</th>
                    <th className="text-right px-3 py-2 text-muted font-medium">Amount Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted">
                        No tax filings match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((o) => (
                      <tr key={o.tax_id} className="hover:bg-bg">
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink">{o.tax_type}</p>
                          <p className="text-[10px] text-muted">
                            {BIR_FORM_MAP[o.tax_type] || 'BIR Return'}
                          </p>
                        </td>
                        <td className="px-2 py-2 text-ink">{o.tax_period}</td>
                        <td className="px-2 py-2 text-ink whitespace-nowrap">
                          {formatDate(o.due_date)}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              o.status === 'Paid'
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                                : o.status === 'Overdue'
                                ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                                : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                          {formatCurrency(o.amount ?? o.tax_amount ?? 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted italic">
              * Click "Print Formal Report" to generate an official declaration document with
              sign-off blocks, or "Export CSV" to download an Excel-ready data file.
            </p>
          </>
        )}
      </div>
    </Modal>
  )
}

