import { Fragment, useMemo, useState, useEffect } from 'react'
import {
  FileBarChart, TrendingUp, Wallet, Users, Truck, PiggyBank, Download, ChevronRight, Loader2,
  Search, CalendarRange, ArrowUpRight, ArrowDownRight, GitCompare, RotateCcw, Check,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Pagination from '../components/Pagination'
import { formatCurrency, formatCurrencyRaw, currencySymbol, convertAmount } from '../utils/formatters'
import { useReports } from '../hooks/useReports'
import { useProfile } from '../hooks/useProfile'
import { useCompany } from '../context/CompanyContext'
import { usePrivacy } from '../context/PrivacyContext'

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-150`

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year']
const YEARS = ['2027', '2026', '2025', '2024', '2023', '2022', '2021', '2020']

const REPORT_CARDS = [
  { key: 'income-statement', title: 'Income Statement', description: 'Revenue vs. expenses for the selected period.', icon: TrendingUp, iconColor: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  { key: 'cash-flow', title: 'Cash Flow Summary', description: 'Inflows and outflows across every cash account.', icon: Wallet, iconColor: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-50 dark:bg-blue-500/10' },
  { key: 'ar-aging', title: 'Accounts Receivable Aging', description: 'Outstanding customer balances by age bucket.', icon: Users, iconColor: 'text-purple-600 dark:text-purple-400', iconBg: 'bg-purple-50 dark:bg-purple-500/10' },
  { key: 'ap-aging', title: 'Accounts Payable Aging', description: 'Outstanding supplier balances by age bucket.', icon: Truck, iconColor: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-50 dark:bg-orange-500/10' },
  { key: 'budget-vs-actual', title: 'Budget vs. Actual', description: 'Allocated budget against actual spend, by department.', icon: PiggyBank, iconColor: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-50 dark:bg-amber-500/10' },
]

// -- Chart config -------------------------------------------------------

const CHART_COLORS = {
  revenue: '#10b981',
  expense: '#ef4444',
  net: '#F4B400',
  inflow: '#10b981',
  outflow: '#ef4444',
  allocated: '#94a3b8',
  actual: '#F4B400',
  overBudget: '#ef4444',
}

const EXPENSE_PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899']
const DEPT_PIE_COLORS = ['#F4B400', '#3b82f6', '#8b5cf6', '#10b981', '#f97316']

const AGING_BUCKETS = [
  { key: 'current', name: 'Current', color: '#10b981' },
  { key: 'd1_30', name: '1-30 Days', color: '#F4B400' },
  { key: 'd31_60', name: '31-60 Days', color: '#f97316' },
  { key: 'd61_90', name: '61-90 Days', color: '#ef4444' },
  { key: 'over90', name: '90+ Days', color: '#991b1b' },
]

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    fontSize: 12,
    boxShadow: '0 4px 12px rgba(17,24,39,0.08)',
  },
  labelStyle: { color: '#111827', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: '#6B7280' },
}

const AXIS_TICK = { fontSize: 11, fill: '#6B7280' }
const CURRENCY_TICK = (v) => `${currencySymbol()}${(convertAmount(v) / 1000).toFixed(0)}k`

function ChartPanel({ title, height = 260, children }) {
  return (
    <div className="rounded-lg border border-border bg-bg/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

function AgingTotalCell({ value }) {
  return <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{value ? formatCurrency(value) : '—'}</td>
}

function ReportLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> Loading report…
    </div>
  )
}

// -- Report generation (opens a formatted, printable document  -  "Save as PDF" from the browser print dialog works with no extra libraries) --

const PRINT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  @page {
    size: auto;
    margin: 0.75in;
  }

  body {
    font-family: Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1e293b;
    font-size: 11px;
    line-height: 1.45;
    background: #f1f5f9;
    padding: 24px 0;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── 1 Paper Per Report / Part (Standard Office / ERP Margins) ── */
  .report-page {
    width: 100%;
    max-width: 8.5in;
    min-height: 11in;
    margin: 0 auto 30px auto;
    padding: 0.75in;
    background: #ffffff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .report-page:last-child {
    margin-bottom: 0;
  }

  .report-page-top {
    flex: 1;
  }
  .report-page-bottom {
    margin-top: 20px;
    page-break-inside: avoid;
  }

  /* ── Corporate Letterhead (SAP B1 Header) ── */
  .doc-header {
    width: 100%;
    border-bottom: 2.5px solid #0f2744;
    padding-bottom: 10px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .doc-header-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .doc-header-logo {
    max-height: 48px;
    max-width: 150px;
    height: auto;
    width: auto;
    object-fit: contain;
    display: block;
    flex-shrink: 0;
  }
  .doc-header-logo-init {
    height: 44px;
    width: 44px;
    background: #0f2744;
    color: #ffffff;
    font-weight: 800;
    font-size: 20px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .doc-header-company {
    flex: 1;
  }
  .doc-header-company-name {
    font-size: 15px;
    font-weight: 800;
    color: #0f2744;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    line-height: 1.2;
  }
  .doc-header-meta {
    font-size: 9.5px;
    color: #475569;
    margin-top: 3px;
    line-height: 1.35;
  }
  .doc-header-meta-box {
    text-align: right;
    min-width: 230px;
  }
  .doc-header-meta-box .doc-title {
    font-size: 13px;
    font-weight: 800;
    color: #0f2744;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .doc-meta-row {
    font-size: 9px;
    color: #334155;
    line-height: 1.4;
  }
  .doc-meta-label {
    color: #64748b;
    font-weight: 600;
  }
  .doc-meta-val {
    font-weight: 700;
    color: #0f2744;
  }

  /* ── Report Table ── */
  .report-table-wrapper {
    margin-top: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
    margin-bottom: 8px;
    border: 1px solid #cbd5e1;
    font-size: 11px;
  }
  thead tr th {
    background: #1e293b;
    color: #ffffff;
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 7px 10px;
    border: 1px solid #1e293b;
    white-space: nowrap;
  }
  tbody tr td {
    padding: 7px 10px;
    font-size: 11px;
    border: 1px solid #e2e8f0;
    color: #1e293b;
  }
  tbody tr:nth-child(even) td {
    background: #f8fafc;
  }
  td.num, th.num {
    text-align: right;
    font-family: "Consolas", "Courier New", monospace;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Section heading rows (REVENUE, EXPENSES) */
  tr.section-heading td {
    background: #f1f5f9;
    color: #0f2744;
    font-size: 9.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    padding: 5px 10px;
    border: 1px solid #cbd5e1;
  }

  /* Accounting Totals Row: Classic double bottom border */
  tfoot tr td {
    background: #f8fafc;
    color: #0f2744;
    font-weight: 800;
    font-size: 11.5px;
    padding: 7px 10px;
    border-top: 1.5px solid #0f2744;
    border-bottom: 3px double #0f2744;
    border-left: 1px solid #cbd5e1;
    border-right: 1px solid #cbd5e1;
  }
  .positive { color: #15803d; font-weight: 700; }
  .negative { color: #b91c1c; font-weight: 700; }

  /* ── Comparative Chart Card ── */
  .chart-card {
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 10px 14px;
    margin: 10px 0;
    background: #f8fafc;
  }
  .chart-title {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #475569;
    margin-bottom: 8px;
  }

  /* ── Signature Section (SAP B1 Executive Sign-off) ── */
  .signature-section {
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1.5px solid #cbd5e1;
    page-break-inside: avoid;
  }
  .signature-section-title {
    font-size: 8.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #64748b;
    margin-bottom: 10px;
  }
  .signature-row {
    display: flex;
    gap: 20px;
  }
  .signature-box {
    flex: 1;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-top: 2.5px solid #0f2744;
    padding: 8px 10px;
    border-radius: 2px;
  }
  .signature-box .sig-label {
    font-size: 8.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #0f2744;
  }
  .signature-box .sig-line {
    border-bottom: 1px solid #94a3b8;
    height: 30px;
    margin: 4px 0 6px;
  }
  .signature-box .sig-name {
    font-size: 9.5px;
    font-weight: 700;
    color: #0f2744;
  }
  .signature-box .sig-role {
    font-size: 8.5px;
    color: #64748b;
    margin-top: 1px;
  }
  .signature-box .sig-date {
    font-size: 8.5px;
    color: #94a3b8;
    margin-top: 4px;
  }

  /* ── Document Footer ── */
  .doc-footer {
    width: 100%;
    border-top: 1px solid #cbd5e1;
    padding-top: 6px;
    margin-top: 10px;
    margin-bottom: 2px;
    display: flex;
    justify-content: space-between;
    font-size: 8px;
    color: #94a3b8;
  }
  .doc-footer .footer-brand {
    color: #0f2744;
    font-weight: 700;
  }
  .doc-footer .footer-conf {
    font-style: italic;
    color: #64748b;
  }

  /* ── Print Media Rules ── */
  @media print {
    @page {
      size: auto;
      margin: 0.75in;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
    }
    .report-page {
      width: 100% !important;
      max-width: 100% !important;
      min-height: calc(100vh - 1.5in) !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      page-break-after: always !important;
      page-break-inside: avoid !important;
      break-after: page !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
    }
    .report-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
  }
`

function generateComparativeBarSvg({ title, currentLabel, priorLabel, items }) {
  if (!items || items.length === 0) return ''
  const maxVal = Math.max(...items.flatMap((i) => [Math.abs(i.current || 0), Math.abs(i.prior || 0)]), 100)
  const rowH = 50
  const topPad = 48
  const h = topPad + (items.length * rowH) + 12
  const barMaxW = 200
  const startX = 175

  const rows = items.map((item, idx) => {
    const y = topPad + (idx * rowH)
    const currW = Math.max(3, Math.round((Math.abs(item.current || 0) / maxVal) * barMaxW))
    const priorW = Math.max(3, Math.round((Math.abs(item.prior || 0) / maxVal) * barMaxW))
    const currFill = item.current >= 0 ? '#10b981' : '#ef4444'

    return `
      <text x="165" y="${y + 16}" text-anchor="end" font-size="11" font-weight="600" fill="#334155">${item.label}</text>
      <!-- Current bar -->
      <rect x="${startX}" y="${y}" width="${currW}" height="12" rx="2" fill="${currFill}" />
      <text x="${startX + currW + 8}" y="${y + 10}" font-size="10" font-weight="700" fill="#1e293b">${formatCurrencyRaw(item.current)}</text>
      <!-- Prior bar -->
      <rect x="${startX}" y="${y + 16}" width="${priorW}" height="12" rx="2" fill="#94a3b8" />
      <text x="${startX + priorW + 8}" y="${y + 26}" font-size="10" fill="#64748b">${formatCurrencyRaw(item.prior)}</text>
    `
  }).join('')

  return `
    <div class="chart-card">
      <div class="chart-title">${title}</div>
      <svg width="100%" height="${h}" viewBox="0 0 680 ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <!-- Two-row non-colliding legend -->
        <g transform="translate(${startX}, 8)">
          <rect x="0" y="0" width="10" height="10" rx="2" fill="#10b981" />
          <text x="16" y="9" font-size="10" font-weight="600" fill="#334155">Current: ${currentLabel}</text>
        </g>
        <g transform="translate(${startX}, 24)">
          <rect x="0" y="0" width="10" height="10" rx="2" fill="#94a3b8" />
          <text x="16" y="9" font-size="10" font-weight="600" fill="#64748b">Past: ${priorLabel}</text>
        </g>
        ${rows}
      </svg>
    </div>
  `
}

function preloadImage(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (!url) { resolve(); return }
    const img = new Image()
    const done = () => resolve()
    img.onload = done
    img.onerror = done
    setTimeout(done, timeoutMs)
    img.src = url
  })
}

// Builds the SAP B1 enterprise letterhead header
function buildDocHeader(company, title, subtitle, generatedAt, generatedBy, userRole) {
  const logoEl = company?.logoUrl
    ? `<img class="doc-header-logo" src="${company.logoUrl}" alt="${company.name || 'Company'} logo" style="max-height: 48px; max-width: 150px; height: auto; width: auto; object-fit: contain; display: block;" />`
    : `<div class="doc-header-logo-init">${(company?.name || 'FMS').charAt(0).toUpperCase()}</div>`

  const metaParts = [company?.address, company?.phone, company?.email].filter(Boolean)
  const metaHtml = metaParts.length
    ? `<div class="doc-header-meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>`
    : ''

  const userMeta = generatedBy
    ? `<div class="doc-meta-row"><span class="doc-meta-label">Generated By:</span> <span class="doc-meta-val">${generatedBy}${userRole ? ` (${userRole})` : ''}</span></div>`
    : ''

  return `
    <div class="doc-header">
      <div class="doc-header-brand">
        ${logoEl}
        <div class="doc-header-company">
          <div class="doc-header-company-name">${company?.name || 'Financial Management System'}</div>
          ${metaHtml}
        </div>
      </div>
      <div class="doc-header-meta-box">
        <div class="doc-title">${title}</div>
        <div class="doc-meta-row"><span class="doc-meta-label">Period:</span> <span class="doc-meta-val">${subtitle || 'All Records'}</span></div>
        <div class="doc-meta-row"><span class="doc-meta-label">Run Date:</span> <span class="doc-meta-val">${generatedAt}</span></div>
        ${userMeta}
        <div class="doc-meta-row"><span class="doc-meta-label">Currency:</span> <span class="doc-meta-val">PHP (₱)</span></div>
      </div>
    </div>
  `
}

// Signature / certification block — SAP B1 style 3-column executive sign-off
function buildSignatureBlock(userName, userRole, dateStr) {
  const preparedName = userName || 'Accounting Staff / Bookkeeper'
  const preparedRole = userRole || 'Finance Officer'
  const dateDisplay = dateStr ? `Date: ${dateStr}` : 'Date: ________________________'

  return `
  <div class="signature-section">
    <div class="signature-section-title">Audit, Certification &amp; Management Approval</div>
    <div class="signature-row">
      <div class="signature-box">
        <div class="sig-label">Prepared By:</div>
        <div class="sig-line"></div>
        <div class="sig-name">${preparedName}</div>
        <div class="sig-role">${preparedRole}</div>
        <div class="sig-date">${dateDisplay}</div>
      </div>
      <div class="signature-box">
        <div class="sig-label">Verified &amp; Reviewed By:</div>
        <div class="sig-line"></div>
        <div class="sig-name">Internal Auditor / Controller</div>
        <div class="sig-role">Internal Audit Department</div>
        <div class="sig-date">Date: ________________________</div>
      </div>
      <div class="signature-box">
        <div class="sig-label">Approved By:</div>
        <div class="sig-line"></div>
        <div class="sig-name">Chief Financial Officer / Managing Director</div>
        <div class="sig-role">Executive Management</div>
        <div class="sig-date">Date: ________________________</div>
      </div>
    </div>
  </div>
`
}

function printReport(title, subtitle, pagesHtml, company) {
  const win = window.open('', '_blank', 'width=950,height=1100')
  if (!win) return

  win.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title} — ${company?.name ?? 'FMS'}</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    ${pagesHtml}
  </body>
</html>`)
  win.document.close()
  win.focus()

  const logoImg = win.document.querySelector('.doc-header img')
  if (logoImg && !logoImg.complete) {
    let printed = false
    const doPrint = () => { if (!printed) { printed = true; win.print() } }
    logoImg.addEventListener('load', doPrint)
    logoImg.addEventListener('error', doPrint)
    setTimeout(doPrint, 2500)
  } else {
    setTimeout(() => win.print(), 250)
  }
}

function agingRowHtml(label, r) {
  return `<tr>
    <td>${label}</td>
    <td class="num">${r.current ? formatCurrencyRaw(r.current) : '—'}</td>
    <td class="num">${r.d1_30 ? formatCurrencyRaw(r.d1_30) : '—'}</td>
    <td class="num">${r.d31_60 ? formatCurrencyRaw(r.d31_60) : '—'}</td>
    <td class="num">${r.d61_90 ? formatCurrencyRaw(r.d61_90) : '—'}</td>
    <td class="num">${r.over90 ? formatCurrencyRaw(r.over90) : '—'}</td>
  </tr>`
}

export default function Reports({ title = 'Reports', crumbs = ['Reports'] }) {
  const [activeReport, setActiveReport] = useState('income-statement')
  const [exporting, setExporting] = useState(false)

  // Filter modes: 'preset' | 'year' | 'custom'
  const [filterMode, setFilterMode] = useState('preset')
  const [selectedPeriod, setSelectedPeriod] = useState('This Quarter')
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareMode, setCompareMode] = useState('prior_period') // 'prior_period' | 'prior_year'

  // The active applied filters that determine what data is fetched from the API
  const [appliedFilters, setAppliedFilters] = useState({
    period: 'This Quarter',
    startDate: '',
    endDate: '',
    compare: false,
    compareMode: 'prior_period',
  })

  // Client-side paging for the report body tables
  const REPORT_PAGE_SIZE = 10
  const [reportPage, setReportPage] = useState(1)
  const reportStart = (reportPage - 1) * REPORT_PAGE_SIZE
  const reportEnd = reportPage * REPORT_PAGE_SIZE

  useEffect(() => {
    setReportPage(1)
  }, [activeReport])

  const { data, loading, error, fetchReport, fetchAll } = useReports()

  const { name: companyName, logoUrl: companyLogoUrl, address: companyAddress, loading: companyLoading } = useCompany()

  const { profile } = useProfile()
  const currentUserName = profile?.name || 'Authorized Staff'
  const currentUserRole = profile?.title || profile?.role || profile?.department || 'Finance Officer'

  usePrivacy()

  const company = useMemo(() => (
    companyName ? { name: companyName, logoUrl: companyLogoUrl, address: companyAddress } : null
  ), [companyName, companyLogoUrl, companyAddress])

  // Fetch when active tab or applied filters change
  useEffect(() => {
    fetchReport(activeReport, appliedFilters)
  }, [activeReport, appliedFilters, fetchReport])

  const handleApplyFilter = () => {
    let newFilter = {
      period: '',
      startDate: '',
      endDate: '',
      compare: compareEnabled,
      compareMode,
    }
    if (filterMode === 'preset') {
      newFilter.period = selectedPeriod
    } else if (filterMode === 'year') {
      newFilter.period = selectedYear
    } else if (filterMode === 'custom') {
      newFilter.startDate = customStartDate
      newFilter.endDate = customEndDate
    }
    setAppliedFilters(newFilter)
  }

  const activeCard = REPORT_CARDS.find((c) => c.key === activeReport)
  const isActiveLoading = !!loading[activeReport]

  const incomeStatement = data['income-statement']
  const cashFlow = data['cash-flow']
  const arAging = data['ar-aging']
  const apAging = data['ap-aging']
  const budgetVsActual = data['budget-vs-actual']

  const comparisonInfo = incomeStatement?.comparison
  const isComparing = !!appliedFilters.compare

  const activePeriodLabel = useMemo(() => {
    if (appliedFilters.startDate && appliedFilters.endDate) {
      return `${appliedFilters.startDate} – ${appliedFilters.endDate}`
    }
    return appliedFilters.period || selectedPeriod
  }, [appliedFilters, selectedPeriod])

  const incomeTotals = useMemo(() => {
    const totalRevenue = (incomeStatement.revenue || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const totalExpenses = (incomeStatement.expenses || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const priorRevenue = (incomeStatement.revenue || []).reduce((s, r) => s + (Number(r.prior_amount) || 0), 0)
    const priorExpenses = (incomeStatement.expenses || []).reduce((s, r) => s + (Number(r.prior_amount) || 0), 0)
    const netIncome = totalRevenue - totalExpenses
    const priorNetIncome = priorRevenue - priorExpenses
    const netVariance = netIncome - priorNetIncome
    const netPct = priorNetIncome !== 0 ? ((netVariance / Math.abs(priorNetIncome)) * 100).toFixed(1) : null

    return {
      totalRevenue,
      totalExpenses,
      netIncome,
      priorRevenue,
      priorExpenses,
      priorNetIncome,
      netVariance,
      netPct,
    }
  }, [incomeStatement])

  const incomeRows = useMemo(() => [
    ...(incomeStatement.revenue || []).map((r) => ({
      section: 'Revenue',
      account: r.account,
      amount: r.amount,
      prior_amount: r.prior_amount,
      variance: r.variance,
      pct_change: r.pct_change,
    })),
    ...(incomeStatement.expenses || []).map((r) => ({
      section: 'Expenses',
      account: r.account,
      amount: r.amount,
      prior_amount: r.prior_amount,
      variance: r.variance,
      pct_change: r.pct_change,
    })),
  ], [incomeStatement])

  const cashFlowTotals = useMemo(() => {
    const list = Array.isArray(cashFlow) ? cashFlow : []
    const inflow = list.reduce((s, r) => s + (Number(r.inflow) || 0), 0)
    const outflow = list.reduce((s, r) => s + (Number(r.outflow) || 0), 0)
    const priorInflow = list.reduce((s, r) => s + (Number(r.prior_inflow) || 0), 0)
    const priorOutflow = list.reduce((s, r) => s + (Number(r.prior_outflow) || 0), 0)
    const net = inflow - outflow
    const priorNet = priorInflow - priorOutflow
    const netVariance = net - priorNet
    const netPct = priorNet !== 0 ? ((netVariance / Math.abs(priorNet)) * 100).toFixed(1) : null

    return {
      inflow,
      outflow,
      net,
      priorInflow,
      priorOutflow,
      priorNet,
      netVariance,
      netPct,
    }
  }, [cashFlow])

  const arTotal = useMemo(() => (Array.isArray(arAging) ? arAging : []).reduce((s, r) => s + r.current + r.d1_30 + r.d31_60 + r.d61_90 + r.over90, 0), [arAging])
  const apTotal = useMemo(() => (Array.isArray(apAging) ? apAging : []).reduce((s, r) => s + r.current + r.d1_30 + r.d31_60 + r.d61_90 + r.over90, 0), [apAging])

  const budgetTotals = useMemo(() => {
    const list = Array.isArray(budgetVsActual) ? budgetVsActual : []
    const allocated = list.reduce((s, r) => s + (Number(r.allocated) || 0), 0)
    const actual = list.reduce((s, r) => s + (Number(r.actual) || 0), 0)
    const priorActual = list.reduce((s, r) => s + (Number(r.prior_actual) || 0), 0)
    const variance = allocated - actual
    const actualDiff = actual - priorActual

    return {
      allocated,
      actual,
      variance,
      priorActual,
      actualDiff,
    }
  }, [budgetVsActual])

  // -- Chart data --

  const incomeChartData = useMemo(() => ([
    { name: 'Revenue', value: incomeTotals.totalRevenue, fill: CHART_COLORS.revenue },
    { name: 'Expenses', value: incomeTotals.totalExpenses, fill: CHART_COLORS.expense },
    { name: 'Net Income', value: incomeTotals.netIncome, fill: CHART_COLORS.net },
  ]), [incomeTotals])

  const incomeCompareChartData = useMemo(() => ([
    { name: 'Revenue', Current: incomeTotals.totalRevenue, Past: incomeTotals.priorRevenue },
    { name: 'Expenses', Current: incomeTotals.totalExpenses, Past: incomeTotals.priorExpenses },
    { name: 'Net Income', Current: incomeTotals.netIncome, Past: incomeTotals.priorNetIncome },
  ]), [incomeTotals])

  const expensePieData = useMemo(() => (incomeStatement.expenses || []).map((e) => ({
    name: e.account.replace(/^\S+\s*—\s*/, ''),
    value: e.amount,
  })), [incomeStatement])

  const cashFlowChartData = useMemo(() => (Array.isArray(cashFlow) ? cashFlow : []).map((r) => ({
    name: r.account.split('—')[1]?.trim() ?? r.account,
    inflow: r.inflow,
    outflow: r.outflow,
    net: r.inflow - r.outflow,
    priorNet: r.prior_net ?? 0,
  })), [cashFlow])

  const arBucketTotals = useMemo(() => AGING_BUCKETS.map((b) => ({
    name: b.name,
    value: (Array.isArray(arAging) ? arAging : []).reduce((s, r) => s + r[b.key], 0),
    color: b.color,
  })), [arAging])

  const apBucketTotals = useMemo(() => AGING_BUCKETS.map((b) => ({
    name: b.name,
    value: (Array.isArray(apAging) ? apAging : []).reduce((s, r) => s + r[b.key], 0),
    color: b.color,
  })), [apAging])

  const budgetPieData = useMemo(() => (Array.isArray(budgetVsActual) ? budgetVsActual : []).map((r) => ({
    name: r.department,
    value: r.allocated,
  })), [budgetVsActual])

  // -- Report body builders --

  const buildIncomeStatementTable = () => {
    const isComp = !!appliedFilters.compare
    const currLbl = comparisonInfo?.current_label || activePeriodLabel
    const priorLbl = comparisonInfo?.prior_label || (appliedFilters.compareMode === 'prior_year' ? 'Prior Year' : 'Prior Period')

    const svgChart = isComp
      ? generateComparativeBarSvg({
          title: 'Comparative Trends (Current vs. Past)',
          currentLabel: currLbl,
          priorLabel: priorLbl,
          items: [
            { label: 'Total Revenue', current: incomeTotals.totalRevenue, prior: incomeTotals.priorRevenue },
            { label: 'Total Expenses', current: incomeTotals.totalExpenses, prior: incomeTotals.priorExpenses },
            { label: 'Net Income', current: incomeTotals.netIncome, prior: incomeTotals.priorNetIncome },
          ],
        })
      : ''

    if (!isComp) {
      return `
        <table>
          <thead>
            <tr>
              <th style="width: 70%;">Particulars / Account</th>
              <th class="num" style="width: 30%;">Amount (${currencySymbol()})</th>
            </tr>
          </thead>
          <tbody>
            <tr class="section-heading"><td colspan="2">Revenue</td></tr>
            ${(incomeStatement.revenue || []).map((r) => `<tr><td>${r.account}</td><td class="num">${formatCurrencyRaw(r.amount)}</td></tr>`).join('')}
            <tr class="section-heading"><td colspan="2">Expenses</td></tr>
            ${(incomeStatement.expenses || []).map((r) => `<tr><td>${r.account}</td><td class="num">${formatCurrencyRaw(r.amount)}</td></tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><td>Total Revenue</td><td class="num">${formatCurrencyRaw(incomeTotals.totalRevenue)}</td></tr>
            <tr><td>Total Expenses</td><td class="num">${formatCurrencyRaw(incomeTotals.totalExpenses)}</td></tr>
            <tr><td>Net Income</td><td class="num ${incomeTotals.netIncome >= 0 ? 'positive' : 'negative'}">${formatCurrencyRaw(incomeTotals.netIncome)}</td></tr>
          </tfoot>
        </table>
      `
    }

    return `
      ${svgChart}
      <table>
        <thead>
          <tr>
            <th style="width: 32%;">Account</th>
            <th class="num" style="width: 20%;">Current Period</th>
            <th class="num" style="width: 20%;">Past Period</th>
            <th class="num" style="width: 15%;">Variance</th>
            <th class="num" style="width: 13%;">% Change</th>
          </tr>
        </thead>
        <tbody>
          <tr class="section-heading"><td colspan="5">Revenue</td></tr>
          ${(incomeStatement.revenue || []).map((r) => {
            const varCls = r.variance >= 0 ? 'positive' : 'negative'
            const pctText = r.pct_change != null ? `${r.pct_change >= 0 ? '+' : ''}${r.pct_change}%` : '—'
            return `<tr>
              <td>${r.account}</td>
              <td class="num">${formatCurrencyRaw(r.amount)}</td>
              <td class="num">${formatCurrencyRaw(r.prior_amount)}</td>
              <td class="num ${varCls}">${r.variance >= 0 ? '+' : ''}${formatCurrencyRaw(r.variance)}</td>
              <td class="num ${varCls}">${pctText}</td>
            </tr>`
          }).join('')}
          <tr class="section-heading"><td colspan="5">Expenses</td></tr>
          ${(incomeStatement.expenses || []).map((r) => {
            const varCls = r.variance <= 0 ? 'positive' : 'negative'
            const pctText = r.pct_change != null ? `${r.pct_change >= 0 ? '+' : ''}${r.pct_change}%` : '—'
            return `<tr>
              <td>${r.account}</td>
              <td class="num">${formatCurrencyRaw(r.amount)}</td>
              <td class="num">${formatCurrencyRaw(r.prior_amount)}</td>
              <td class="num ${varCls}">${r.variance >= 0 ? '+' : ''}${formatCurrencyRaw(r.variance)}</td>
              <td class="num ${varCls}">${pctText}</td>
            </tr>`
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>Total Revenue</td>
            <td class="num">${formatCurrencyRaw(incomeTotals.totalRevenue)}</td>
            <td class="num">${formatCurrencyRaw(incomeTotals.priorRevenue)}</td>
            <td class="num ${incomeTotals.totalRevenue - incomeTotals.priorRevenue >= 0 ? 'positive' : 'negative'}">${incomeTotals.totalRevenue - incomeTotals.priorRevenue >= 0 ? '+' : ''}${formatCurrencyRaw(incomeTotals.totalRevenue - incomeTotals.priorRevenue)}</td>
            <td class="num">${incomeTotals.priorRevenue ? `${(((incomeTotals.totalRevenue - incomeTotals.priorRevenue) / incomeTotals.priorRevenue) * 100).toFixed(1)}%` : '—'}</td>
          </tr>
          <tr>
            <td>Total Expenses</td>
            <td class="num">${formatCurrencyRaw(incomeTotals.totalExpenses)}</td>
            <td class="num">${formatCurrencyRaw(incomeTotals.priorExpenses)}</td>
            <td class="num ${incomeTotals.totalExpenses - incomeTotals.priorExpenses <= 0 ? 'positive' : 'negative'}">${incomeTotals.totalExpenses - incomeTotals.priorExpenses >= 0 ? '+' : ''}${formatCurrencyRaw(incomeTotals.totalExpenses - incomeTotals.priorExpenses)}</td>
            <td class="num">${incomeTotals.priorExpenses ? `${(((incomeTotals.totalExpenses - incomeTotals.priorExpenses) / incomeTotals.priorExpenses) * 100).toFixed(1)}%` : '—'}</td>
          </tr>
          <tr>
            <td>Net Income</td>
            <td class="num ${incomeTotals.netIncome >= 0 ? 'positive' : 'negative'}">${formatCurrencyRaw(incomeTotals.netIncome)}</td>
            <td class="num">${formatCurrencyRaw(incomeTotals.priorNetIncome)}</td>
            <td class="num ${incomeTotals.netVariance >= 0 ? 'positive' : 'negative'}">${incomeTotals.netVariance >= 0 ? '+' : ''}${formatCurrencyRaw(incomeTotals.netVariance)}</td>
            <td class="num ${incomeTotals.netVariance >= 0 ? 'positive' : 'negative'}">${incomeTotals.netPct != null ? `${incomeTotals.netPct}%` : '—'}</td>
          </tr>
        </tfoot>
      </table>
    `
  }

  const buildCashFlowTable = () => {
    const isComp = !!appliedFilters.compare
    const currLbl = activePeriodLabel
    const priorLbl = appliedFilters.compareMode === 'prior_year' ? 'Prior Year' : 'Prior Period'

    const svgChart = isComp
      ? generateComparativeBarSvg({
          title: 'Cash Flow Comparison (Collections vs. Disbursements)',
          currentLabel: currLbl,
          priorLabel: priorLbl,
          items: [
            { label: 'Total Inflow', current: cashFlowTotals.inflow, prior: cashFlowTotals.priorInflow },
            { label: 'Total Outflow', current: cashFlowTotals.outflow, prior: cashFlowTotals.priorOutflow },
            { label: 'Net Cash Change', current: cashFlowTotals.net, prior: cashFlowTotals.priorNet },
          ],
        })
      : ''

    if (!isComp) {
      return `
        <table>
          <thead>
            <tr>
              <th style="width: 46%;">Cash Account</th>
              <th class="num" style="width: 18%;">Inflow (${currencySymbol()})</th>
              <th class="num" style="width: 18%;">Outflow (${currencySymbol()})</th>
              <th class="num" style="width: 18%;">Net Change (${currencySymbol()})</th>
            </tr>
          </thead>
          <tbody>
            ${(Array.isArray(cashFlow) ? cashFlow : []).map((r) => {
              const net = r.inflow - r.outflow
              return `<tr><td>${r.account}</td><td class="num">${formatCurrencyRaw(r.inflow)}</td><td class="num">${formatCurrencyRaw(r.outflow)}</td><td class="num ${net >= 0 ? 'positive' : 'negative'}">${formatCurrencyRaw(net)}</td></tr>`
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td>Totals</td>
              <td class="num">${formatCurrencyRaw(cashFlowTotals.inflow)}</td>
              <td class="num">${formatCurrencyRaw(cashFlowTotals.outflow)}</td>
              <td class="num ${cashFlowTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrencyRaw(cashFlowTotals.net)}</td>
            </tr>
          </tfoot>
        </table>
      `
    }

    return `
      ${svgChart}
      <table>
        <thead>
          <tr>
            <th style="width: 28%;">Cash Account</th>
            <th class="num" style="width: 14%;">Current Inflow</th>
            <th class="num" style="width: 14%;">Current Outflow</th>
            <th class="num" style="width: 14%;">Current Net</th>
            <th class="num" style="width: 14%;">Past Net</th>
            <th class="num" style="width: 16%;">Variance</th>
            <th class="num" style="width: 10%;">% Change</th>
          </tr>
        </thead>
        <tbody>
          ${(Array.isArray(cashFlow) ? cashFlow : []).map((r) => {
            const net = r.net != null ? r.net : (r.inflow - r.outflow)
            const priorNet = r.prior_net != null ? r.prior_net : 0
            const varNet = r.variance_net != null ? r.variance_net : (net - priorNet)
            const pct = r.pct_change != null ? `${r.pct_change >= 0 ? '+' : ''}${r.pct_change}%` : '—'
            return `<tr>
              <td>${r.account}</td>
              <td class="num">${formatCurrencyRaw(r.inflow)}</td>
              <td class="num">${formatCurrencyRaw(r.outflow)}</td>
              <td class="num ${net >= 0 ? 'positive' : 'negative'}">${formatCurrencyRaw(net)}</td>
              <td class="num">${formatCurrencyRaw(priorNet)}</td>
              <td class="num ${varNet >= 0 ? 'positive' : 'negative'}">${varNet >= 0 ? '+' : ''}${formatCurrencyRaw(varNet)}</td>
              <td class="num">${pct}</td>
            </tr>`
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>Totals</td>
            <td class="num">${formatCurrencyRaw(cashFlowTotals.inflow)}</td>
            <td class="num">${formatCurrencyRaw(cashFlowTotals.outflow)}</td>
            <td class="num ${cashFlowTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrencyRaw(cashFlowTotals.net)}</td>
            <td class="num">${formatCurrencyRaw(cashFlowTotals.priorNet)}</td>
            <td class="num ${cashFlowTotals.netVariance >= 0 ? 'positive' : 'negative'}">${cashFlowTotals.netVariance >= 0 ? '+' : ''}${formatCurrencyRaw(cashFlowTotals.netVariance)}</td>
            <td class="num">${cashFlowTotals.netPct != null ? `${cashFlowTotals.netPct}%` : '—'}</td>
          </tr>
        </tfoot>
      </table>
    `
  }

  const buildARAgingTable = () => `
    <table>
      <thead>
        <tr>
          <th style="width: 30%;">Customer Name</th>
          <th class="num" style="width: 14%;">Current</th>
          <th class="num" style="width: 14%;">1-30 Days</th>
          <th class="num" style="width: 14%;">31-60 Days</th>
          <th class="num" style="width: 14%;">61-90 Days</th>
          <th class="num" style="width: 14%;">90+ Days</th>
        </tr>
      </thead>
      <tbody>
        ${(Array.isArray(arAging) ? arAging : []).map((r) => agingRowHtml(r.customer, r)).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="5">Total Outstanding</td><td class="num">${formatCurrencyRaw(arTotal)}</td></tr>
      </tfoot>
    </table>
  `

  const buildAPAgingTable = () => `
    <table>
      <thead>
        <tr>
          <th style="width: 30%;">Supplier Name</th>
          <th class="num" style="width: 14%;">Current</th>
          <th class="num" style="width: 14%;">1-30 Days</th>
          <th class="num" style="width: 14%;">31-60 Days</th>
          <th class="num" style="width: 14%;">61-90 Days</th>
          <th class="num" style="width: 14%;">90+ Days</th>
        </tr>
      </thead>
      <tbody>
        ${(Array.isArray(apAging) ? apAging : []).map((r) => agingRowHtml(r.supplier, r)).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="5">Total Outstanding</td><td class="num">${formatCurrencyRaw(apTotal)}</td></tr>
      </tfoot>
    </table>
  `

  const buildBudgetTable = () => {
    const isComp = !!appliedFilters.compare
    const list = Array.isArray(budgetVsActual) ? budgetVsActual : []

    const svgChart = isComp
      ? generateComparativeBarSvg({
          title: 'Department Spend Trends (Current vs. Past Year)',
          currentLabel: 'Current Spend',
          priorLabel: 'Past Spend',
          items: list.map((r) => ({
            label: r.department,
            current: r.actual,
            prior: r.prior_actual || 0,
          })).slice(0, 6),
        })
      : ''

    if (!isComp) {
      return `
        <table>
          <thead>
            <tr>
              <th style="width: 40%;">Department / Cost Center</th>
              <th class="num" style="width: 20%;">Allocated Budget</th>
              <th class="num" style="width: 20%;">Actual Spend</th>
              <th class="num" style="width: 20%;">Variance</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((r) => {
              const variance = r.allocated - r.actual
              const label = variance >= 0 ? `${formatCurrencyRaw(variance)} under` : `${formatCurrencyRaw(Math.abs(variance))} over`
              return `<tr><td>${r.department}</td><td class="num">${formatCurrencyRaw(r.allocated)}</td><td class="num">${formatCurrencyRaw(r.actual)}</td><td class="num ${variance >= 0 ? 'positive' : 'negative'}">${label}</td></tr>`
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td>Totals</td>
              <td class="num">${formatCurrencyRaw(budgetTotals.allocated)}</td>
              <td class="num">${formatCurrencyRaw(budgetTotals.actual)}</td>
              <td class="num ${budgetTotals.variance >= 0 ? 'positive' : 'negative'}">${budgetTotals.variance >= 0 ? formatCurrencyRaw(budgetTotals.variance) + ' under' : formatCurrencyRaw(Math.abs(budgetTotals.variance)) + ' over'}</td>
            </tr>
          </tfoot>
        </table>
      `
    }

    return `
      ${svgChart}
      <table>
        <thead>
          <tr>
            <th style="width: 28%;">Department</th>
            <th class="num" style="width: 18%;">Allocated Budget</th>
            <th class="num" style="width: 18%;">Current Spend</th>
            <th class="num" style="width: 18%;">Past Spend</th>
            <th class="num" style="width: 18%;">Spend Difference</th>
            <th class="num" style="width: 10%;">% Change</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((r) => {
            const actualDiff = r.actual_diff != null ? r.actual_diff : (r.actual - (r.prior_actual || 0))
            const pct = r.pct_change != null ? `${r.pct_change >= 0 ? '+' : ''}${r.pct_change}%` : '—'
            return `<tr>
              <td>${r.department}</td>
              <td class="num">${formatCurrencyRaw(r.allocated)}</td>
              <td class="num">${formatCurrencyRaw(r.actual)}</td>
              <td class="num">${formatCurrencyRaw(r.prior_actual)}</td>
              <td class="num ${actualDiff <= 0 ? 'positive' : 'negative'}">${actualDiff <= 0 ? '' : '+'}${formatCurrencyRaw(actualDiff)}</td>
              <td class="num">${pct}</td>
            </tr>`
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td>Totals</td>
            <td class="num">${formatCurrencyRaw(budgetTotals.allocated)}</td>
            <td class="num">${formatCurrencyRaw(budgetTotals.actual)}</td>
            <td class="num">${formatCurrencyRaw(budgetTotals.priorActual)}</td>
            <td class="num ${budgetTotals.actualDiff <= 0 ? 'positive' : 'negative'}">${budgetTotals.actualDiff <= 0 ? '' : '+'}${formatCurrencyRaw(budgetTotals.actualDiff)}</td>
            <td class="num">${budgetTotals.priorActual ? `${(((budgetTotals.actual - budgetTotals.priorActual) / budgetTotals.priorActual) * 100).toFixed(1)}%` : '—'}</td>
          </tr>
        </tfoot>
      </table>
    `
  }

  const REPORT_BUILDERS = {
    'income-statement': { title: 'Income Statement', table: buildIncomeStatementTable },
    'cash-flow': { title: 'Cash Flow Summary', table: buildCashFlowTable },
    'ar-aging': { title: 'Accounts Receivable Aging', table: buildARAgingTable },
    'ap-aging': { title: 'Accounts Payable Aging', table: buildAPAgingTable },
    'budget-vs-actual': { title: 'Budget vs. Actual', table: buildBudgetTable },
  }

  const handleExportActive = async () => {
    const { title: reportTitle, table } = REPORT_BUILDERS[activeReport]
    await preloadImage(company?.logoUrl)
    const generatedAt = new Date().toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const generatedDate = new Date().toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
    })
    const sub = isComparing
      ? `Period: ${activePeriodLabel} (Compared to ${appliedFilters.compareMode === 'prior_year' ? 'Prior Year' : 'Prior Period'})`
      : `Period: ${activePeriodLabel}`

    const pageHtml = `
      <div class="report-page">
        <div class="report-page-top">
          ${buildDocHeader(company, reportTitle, sub, generatedAt, currentUserName, currentUserRole)}
          <div class="report-table-wrapper">
            ${table()}
          </div>
        </div>
        <div class="report-page-bottom">
          ${buildSignatureBlock(currentUserName, currentUserRole, generatedDate)}
          <div class="doc-footer">
            <span class="footer-brand">${company?.name ?? 'Financial Management System'} · Transaction Core</span>
            <span class="footer-conf">CONFIDENTIAL · Official Statement</span>
            <span>Generated: ${generatedAt}</span>
          </div>
        </div>
      </div>
    `
    printReport(reportTitle, sub, pageHtml, company)
  }

  const handleExportAll = async () => {
    setExporting(true)
    try {
      await Promise.all([fetchAll(appliedFilters), preloadImage(company?.logoUrl)])
      const generatedAt = new Date().toLocaleString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
      const generatedDate = new Date().toLocaleDateString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
      const sub = isComparing
        ? `Period: ${activePeriodLabel} (Compared to ${appliedFilters.compareMode === 'prior_year' ? 'Prior Year' : 'Prior Period'})`
        : `Period: ${activePeriodLabel}`

      // Each report gets its own individual paper/page with its own letterhead,
      // full table, and executive sign-off block at the bottom.
      const pagesHtml = REPORT_CARDS.map((card, idx) => `
        <div class="report-page">
          <div class="report-page-top">
            ${buildDocHeader(company, `${idx + 1}.0 ${card.title.toUpperCase()}`, sub, generatedAt, currentUserName, currentUserRole)}
            <div class="report-table-wrapper">
              ${REPORT_BUILDERS[card.key].table()}
            </div>
          </div>
          <div class="report-page-bottom">
            ${buildSignatureBlock(currentUserName, currentUserRole, generatedDate)}
            <div class="doc-footer">
              <span class="footer-brand">${company?.name ?? 'Financial Management System'} · Transaction Core</span>
              <span class="footer-conf">CONFIDENTIAL · Part ${idx + 1} of ${REPORT_CARDS.length}</span>
              <span>Generated: ${generatedAt}</span>
            </div>
          </div>
        </div>
      `).join('')

      printReport('Financial Reports Package', sub, pagesHtml, company)
    } finally {
      setExporting(false)
    }
  }

  const statCardsAreEmpty = isActiveLoading

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">
          Financial statements assembled from posted Collections, Disbursements, Budgets, and Expenses across the General Ledger.
        </p>
      </div>

      {/* Search & Period Filter Toolbar */}
      <div className={`${PANEL} p-3.5 flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Filter Mode:</span>
            <div className="flex items-center rounded-lg border border-border bg-bg p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setFilterMode('preset')}
                className={`px-3 py-1 rounded-md transition-all ${filterMode === 'preset' ? 'bg-surface text-ink shadow-xs font-semibold' : 'text-muted hover:text-ink'}`}
              >
                Preset Period
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('year')}
                className={`px-3 py-1 rounded-md transition-all ${filterMode === 'year' ? 'bg-surface text-ink shadow-xs font-semibold' : 'text-muted hover:text-ink'}`}
              >
                Specific Year
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('custom')}
                className={`px-3 py-1 rounded-md transition-all ${filterMode === 'custom' ? 'bg-surface text-ink shadow-xs font-semibold' : 'text-muted hover:text-ink'}`}
              >
                Custom Range
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink select-none">
              <input
                type="checkbox"
                checked={compareEnabled}
                onChange={(e) => {
                  const val = e.target.checked
                  setCompareEnabled(val)
                  setAppliedFilters((prev) => ({
                    ...prev,
                    compare: val,
                  }))
                }}
                className="rounded border-border text-primary focus:ring-primary/50 cursor-pointer"
              />
              <span className="flex items-center gap-1 font-semibold">
                <GitCompare size={14} className={compareEnabled ? 'text-primary' : 'text-muted'} />
                Compare with Past
              </span>
            </label>

            {compareEnabled && (
              <select
                value={compareMode}
                onChange={(e) => {
                  const m = e.target.value
                  setCompareMode(m)
                  setAppliedFilters((prev) => ({
                    ...prev,
                    compareMode: m,
                  }))
                }}
                className={`${INPUT} text-xs h-8 py-0`}
              >
                <option value="prior_period">vs. Prior Period</option>
                <option value="prior_year">vs. Prior Year</option>
              </select>
            )}
          </div>
        </div>

        {/* Search controls row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {filterMode === 'preset' && (
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className={`${INPUT} min-w-36`}
              >
                {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            {filterMode === 'year' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Select Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className={`${INPUT} min-w-32`}
                >
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}

            {filterMode === 'custom' && (
              <div className="flex items-center gap-2">
                <CalendarRange size={16} className="text-muted shrink-0" />
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className={`${INPUT} text-xs`}
                  placeholder="From"
                />
                <span className="text-xs text-muted">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className={`${INPUT} text-xs`}
                  placeholder="To"
                />
              </div>
            )}

            <Button
              variant="primary"
              size="sm"
              icon={Search}
              onClick={handleApplyFilter}
            >
              Search
            </Button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={handleExportAll}
              disabled={exporting}
            >
              {exporting ? 'Preparing…' : 'Export All'}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon
          const isActive = activeReport === card.key
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setActiveReport(card.key)}
              className={`${PANEL} ${PANEL_PAD} flex flex-col gap-2 text-left transition-all duration-150 ${isActive ? 'ring-2 ring-primary/60 border-primary' : 'hover:border-primary/40'}`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                  <Icon size={16} className={card.iconColor} />
                </div>
                <ChevronRight size={15} className={isActive ? 'text-primary' : 'text-muted'} />
              </div>
              <p className="text-sm font-semibold text-ink">{card.title}</p>
              <p className="text-xs text-muted leading-relaxed">{card.description}</p>
            </button>
          )
        })}
      </div>

      <div className={PANEL}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <FileBarChart size={16} className="text-primary-dark" />
          <p className="text-sm font-semibold text-ink">{activeCard.title}</p>
          <span className="text-xs text-muted font-medium">({activePeriodLabel})</span>
          {isComparing && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/15 text-primary-dark border border-primary/20">
              <GitCompare size={12} /> Comparing vs. {appliedFilters.compareMode === 'prior_year' ? 'Prior Year' : 'Prior Period'}
            </span>
          )}
          <button
            type="button"
            onClick={handleExportActive}
            disabled={isActiveLoading}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-primary-dark hover:underline disabled:opacity-40 disabled:pointer-events-none"
          >
            <Download size={12} /> Export this report
          </button>
        </div>

        {isActiveLoading ? (
          <ReportLoading />
        ) : (
          <>
            {activeReport === 'income-statement' && (
              <>
                {isComparing && (
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-bg/50 px-4 py-3 border-b border-border text-xs">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <span className="text-muted block text-[11px]">Net Income ({comparisonInfo?.current_label || 'Current'})</span>
                        <span className="font-bold text-ink text-sm">{formatCurrency(incomeTotals.netIncome)}</span>
                      </div>
                      <div>
                        <span className="text-muted block text-[11px]">Net Income ({comparisonInfo?.prior_label || 'Past'})</span>
                        <span className="font-medium text-muted text-sm">{formatCurrency(incomeTotals.priorNetIncome)}</span>
                      </div>
                      <div>
                        <span className="text-muted block text-[11px]">Net Income Variance</span>
                        <span className={`inline-flex items-center gap-0.5 font-bold text-sm ${incomeTotals.netVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {incomeTotals.netVariance >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          {incomeTotals.netVariance >= 0 ? `+${formatCurrency(incomeTotals.netVariance)}` : formatCurrency(incomeTotals.netVariance)}
                          {incomeTotals.netPct != null && ` (${incomeTotals.netPct}%)`}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted italic">Comparison baseline: {appliedFilters.compareMode === 'prior_year' ? 'Same period last year' : 'Preceding period span'}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 border-b border-border p-4 lg:grid-cols-2">
                  <ChartPanel title={isComparing ? `Performance Comparison: Current (${comparisonInfo?.current_label || 'Current'}) vs. Past (${comparisonInfo?.prior_label || 'Past'})` : 'Revenue vs. Expenses vs. Net Income'}>
                    {isComparing ? (
                      <BarChart data={incomeCompareChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                        <Bar dataKey="Current" name={comparisonInfo?.current_label || 'Current Period'} fill="#F4B400" radius={[4, 4, 0, 0]} maxBarSize={44} />
                        <Bar dataKey="Past" name={comparisonInfo?.prior_label || 'Past Period'} fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={44} />
                      </BarChart>
                    ) : (
                      <BarChart data={incomeChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
                          {incomeChartData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    )}
                  </ChartPanel>
                  <ChartPanel title="Expense Breakdown">
                    <PieChart>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                      <Pie data={expensePieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                        {expensePieData.map((entry, i) => (
                          <Cell key={entry.name} fill={EXPENSE_PIE_COLORS[i % EXPENSE_PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartPanel>
                </div>
              <div className="overflow-hidden rounded-t-xl">
                <table className="w-full text-sm">
                  {isComparing && (
                    <thead>
                      <tr className="border-b border-border bg-bg/40 text-xs font-semibold uppercase tracking-wide text-muted">
                        <th className="px-4 py-3 text-left">Account</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Current Period</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Past Period</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Variance</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">% Change</th>
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {incomeRows.slice(reportStart, reportEnd).map((r, idx) => {
                      const isFirst = idx === 0 || incomeRows[reportStart + idx - 1]?.section !== r.section
                      return (
                        <Fragment key={`${r.section}-${r.account}`}>
                          {isFirst && (
                            <tr className="border-b border-border bg-bg/60">
                              <td className="px-4 py-2.5 font-semibold text-ink text-xs uppercase tracking-wide" colSpan={isComparing ? 5 : 2}>{r.section}</td>
                            </tr>
                          )}
                          <tr className="border-b border-border last:border-0 hover:bg-bg/40 transition-colors">
                            <td className="px-4 py-3 text-ink font-medium">{r.account}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(r.amount)}</td>
                            {isComparing && (
                              <>
                                <td className="px-4 py-3 text-right tabular-nums text-muted">{formatCurrency(r.prior_amount)}</td>
                                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${r.variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {r.variance >= 0 ? `+${formatCurrency(r.variance)}` : formatCurrency(r.variance)}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-xs">
                                  {r.pct_change != null ? (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold ${r.pct_change >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
                                      {r.pct_change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                      {Math.abs(r.pct_change)}%
                                    </span>
                                  ) : '—'}
                                </td>
                              </>
                            )}
                          </tr>
                        </Fragment>
                      )
                    })}
                    {incomeRows.length === 0 && (
                      <tr><td colSpan={isComparing ? 5 : 2} className="px-4 py-3 text-center text-xs text-muted">No revenue or expenses posted for this period.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Total Revenue</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(incomeTotals.totalRevenue)}</td>
                      {isComparing && (
                        <>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">{formatCurrency(incomeTotals.priorRevenue)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums ${incomeTotals.totalRevenue - incomeTotals.priorRevenue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(incomeTotals.totalRevenue - incomeTotals.priorRevenue)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs text-muted">
                            {incomeTotals.priorRevenue ? `${(((incomeTotals.totalRevenue - incomeTotals.priorRevenue) / incomeTotals.priorRevenue) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                    <tr className="font-semibold">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Total Expenses</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(incomeTotals.totalExpenses)}</td>
                      {isComparing && (
                        <>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">{formatCurrency(incomeTotals.priorExpenses)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums ${incomeTotals.totalExpenses - incomeTotals.priorExpenses <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(incomeTotals.totalExpenses - incomeTotals.priorExpenses)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs text-muted">
                            {incomeTotals.priorExpenses ? `${(((incomeTotals.totalExpenses - incomeTotals.priorExpenses) / incomeTotals.priorExpenses) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                    <tr className="border-t border-border font-bold">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Net Income</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${incomeTotals.netIncome >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(incomeTotals.netIncome)}
                      </td>
                      {isComparing && (
                        <>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">{formatCurrency(incomeTotals.priorNetIncome)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums ${incomeTotals.netVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(incomeTotals.netVariance)}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums text-xs ${incomeTotals.netVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {incomeTotals.netPct != null ? `${incomeTotals.netPct}%` : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
                {incomeRows.length > REPORT_PAGE_SIZE && (
                  <Pagination page={reportPage} totalPages={Math.max(1, Math.ceil(incomeRows.length / REPORT_PAGE_SIZE))} onPageChange={setReportPage} total={incomeRows.length} label="lines" showRange rangeStart={reportStart + 1} rangeEnd={Math.min(reportEnd, incomeRows.length)} bordered />
                )}
              </div>
              </>
            )}

            {activeReport === 'cash-flow' && (
              <>
                <div className="border-b border-border p-4">
                  {isComparing ? (
                    <ChartPanel title="Cash Flow Comparison: Current vs. Past Net Change by Cash Account" height={280}>
                      <BarChart data={cashFlowChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                        <Bar dataKey="net" name="Current Net Change" fill="#F4B400" radius={[4, 4, 0, 0]} maxBarSize={36} />
                        <Bar dataKey="priorNet" name="Past Net Change" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ChartPanel>
                  ) : (
                    <ChartPanel title="Inflow vs. Outflow by Cash Account" height={280}>
                      <ComposedChart data={cashFlowChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                        <Bar dataKey="inflow" name="Inflow" fill={CHART_COLORS.inflow} radius={[6, 6, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="outflow" name="Outflow" fill={CHART_COLORS.outflow} radius={[6, 6, 0, 0]} maxBarSize={40} />
                        <Line type="monotone" dataKey="net" name="Net Change" stroke="#111827" strokeWidth={2} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ChartPanel>
                  )}
                </div>
              <div className="overflow-hidden rounded-t-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg/40 text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 text-left">Cash Account</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Inflow</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Outflow</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Current Net</th>
                      {isComparing && (
                        <>
                          <th className="px-4 py-3 text-right whitespace-nowrap">Past Net</th>
                          <th className="px-4 py-3 text-right whitespace-nowrap">Variance</th>
                          <th className="px-4 py-3 text-right whitespace-nowrap">% Change</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(cashFlow) ? cashFlow : []).slice(reportStart, reportEnd).map((r) => {
                      const net = r.net != null ? r.net : (r.inflow - r.outflow)
                      const priorNet = r.prior_net ?? 0
                      const varNet = r.variance_net != null ? r.variance_net : (net - priorNet)
                      return (
                        <tr key={r.account} className="border-b border-border last:border-0 hover:bg-bg/40 transition-colors">
                          <td className="px-4 py-3.5 text-ink font-medium">{r.account}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-ink">{formatCurrency(r.inflow)}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-ink">{formatCurrency(r.outflow)}</td>
                          <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(net)}</td>
                          {isComparing && (
                            <>
                              <td className="px-4 py-3.5 text-right tabular-nums text-muted">{formatCurrency(priorNet)}</td>
                              <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${varNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {varNet >= 0 ? `+${formatCurrency(varNet)}` : formatCurrency(varNet)}
                              </td>
                              <td className="px-4 py-3.5 text-right tabular-nums text-xs">
                                {r.pct_change != null ? (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold ${r.pct_change >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
                                    {r.pct_change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    {Math.abs(r.pct_change)}%
                                  </span>
                                ) : '—'}
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                    {cashFlow.length === 0 && (
                      <tr><td colSpan={isComparing ? 7 : 4} className="px-4 py-10 text-center text-sm text-muted">No collections or disbursements posted for this period.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Totals</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(cashFlowTotals.inflow)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(cashFlowTotals.outflow)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-bold ${cashFlowTotals.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(cashFlowTotals.net)}</td>
                      {isComparing && (
                        <>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">{formatCurrency(cashFlowTotals.priorNet)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-bold ${cashFlowTotals.netVariance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(cashFlowTotals.netVariance)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs font-bold text-muted">
                            {cashFlowTotals.netPct != null ? `${cashFlowTotals.netPct}%` : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
                {cashFlow.length > REPORT_PAGE_SIZE && (
                  <Pagination page={reportPage} totalPages={Math.max(1, Math.ceil(cashFlow.length / REPORT_PAGE_SIZE))} onPageChange={setReportPage} total={cashFlow.length} label="cash accounts" showRange rangeStart={reportStart + 1} rangeEnd={Math.min(reportEnd, cashFlow.length)} bordered />
                )}
              </div>
              </>
            )}

            {activeReport === 'ar-aging' && (
              <>
                <div className="grid grid-cols-1 gap-4 border-b border-border p-4 lg:grid-cols-2">
                  <ChartPanel title="Aging by Customer">
                    <BarChart data={arAging} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="customer" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                      <Legend wrapperStyle={{ fontSize: 10, color: '#6B7280' }} />
                      {AGING_BUCKETS.map((b, i) => (
                        <Bar
                          key={b.key}
                          dataKey={b.key}
                          name={b.name}
                          stackId="a"
                          fill={b.color}
                          radius={i === AGING_BUCKETS.length - 1 ? [6, 6, 0, 0] : undefined}
                        />
                      ))}
                    </BarChart>
                  </ChartPanel>
                  <ChartPanel title="Overall Aging Distribution">
                    <PieChart>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                      <Pie data={arBucketTotals} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                        {arBucketTotals.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ChartPanel>
                </div>
              <div className="overflow-hidden rounded-t-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Customer</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Current</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">1-30 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">31-60 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">61-90 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">90+ Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arAging.slice(reportStart, reportEnd).map((r) => (
                      <tr key={r.customer} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                        <td className="px-4 py-3.5 text-ink">{r.customer}</td>
                        <AgingTotalCell value={r.current} />
                        <AgingTotalCell value={r.d1_30} />
                        <AgingTotalCell value={r.d31_60} />
                        <AgingTotalCell value={r.d61_90} />
                        <AgingTotalCell value={r.over90} />
                      </tr>
                    ))}
                    {arAging.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No outstanding receivables.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted" colSpan={5}>Total Outstanding</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink"></td>
                    </tr>
                    <tr>
                      <td colSpan={6} className="px-4 pb-3 text-right tabular-nums text-ink font-bold">{formatCurrency(arTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
                {arAging.length > REPORT_PAGE_SIZE && (
                  <Pagination page={reportPage} totalPages={Math.max(1, Math.ceil(arAging.length / REPORT_PAGE_SIZE))} onPageChange={setReportPage} total={arAging.length} label="customers" showRange rangeStart={reportStart + 1} rangeEnd={Math.min(reportEnd, arAging.length)} bordered />
                )}
              </div>
              </>
            )}

            {activeReport === 'ap-aging' && (
              <>
                <div className="grid grid-cols-1 gap-4 border-b border-border p-4 lg:grid-cols-2">
                  <ChartPanel title="Aging by Supplier">
                    <BarChart data={apAging} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="supplier" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                      <Legend wrapperStyle={{ fontSize: 10, color: '#6B7280' }} />
                      {AGING_BUCKETS.map((b, i) => (
                        <Bar
                          key={b.key}
                          dataKey={b.key}
                          name={b.name}
                          stackId="a"
                          fill={b.color}
                          radius={i === AGING_BUCKETS.length - 1 ? [6, 6, 0, 0] : undefined}
                        />
                      ))}
                    </BarChart>
                  </ChartPanel>
                  <ChartPanel title="Overall Aging Distribution">
                    <PieChart>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                      <Pie data={apBucketTotals} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                        {apBucketTotals.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ChartPanel>
                </div>
              <div className="overflow-hidden rounded-t-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Supplier</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Current</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">1-30 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">31-60 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">61-90 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">90+ Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apAging.slice(reportStart, reportEnd).map((r) => (
                      <tr key={r.supplier} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                        <td className="px-4 py-3.5 text-ink">{r.supplier}</td>
                        <AgingTotalCell value={r.current} />
                        <AgingTotalCell value={r.d1_30} />
                        <AgingTotalCell value={r.d31_60} />
                        <AgingTotalCell value={r.d61_90} />
                        <AgingTotalCell value={r.over90} />
                      </tr>
                    ))}
                    {apAging.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No outstanding payables.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-right tabular-nums text-ink font-bold border-t-2 border-border">Total Outstanding: {formatCurrency(apTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
                {apAging.length > REPORT_PAGE_SIZE && (
                  <Pagination page={reportPage} totalPages={Math.max(1, Math.ceil(apAging.length / REPORT_PAGE_SIZE))} onPageChange={setReportPage} total={apAging.length} label="suppliers" showRange rangeStart={reportStart + 1} rangeEnd={Math.min(reportEnd, apAging.length)} bordered />
                )}
              </div>
              </>
            )}

            {activeReport === 'budget-vs-actual' && (
              <>
                <div className="grid grid-cols-1 gap-4 border-b border-border p-4 lg:grid-cols-2">
                  <ChartPanel title={isComparing ? 'Department Actual Spend: Current vs. Past' : 'Allocated vs. Actual by Department'}>
                    {isComparing ? (
                      <BarChart data={budgetVsActual} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                        <XAxis dataKey="department" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                        <Bar dataKey="actual" name="Current Spend" fill="#F4B400" radius={[4, 4, 0, 0]} maxBarSize={36} />
                        <Bar dataKey="prior_actual" name="Past Spend" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    ) : (
                      <BarChart data={budgetVsActual} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                        <XAxis dataKey="department" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                        <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                        <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                        <Bar dataKey="allocated" name="Allocated" fill={CHART_COLORS.allocated} radius={[6, 6, 0, 0]} maxBarSize={36} />
                        <Bar dataKey="actual" name="Actual" radius={[6, 6, 0, 0]} maxBarSize={36}>
                          {budgetVsActual.map((r) => (
                            <Cell key={r.department} fill={r.actual > r.allocated ? CHART_COLORS.overBudget : CHART_COLORS.actual} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ChartPanel>
                  <ChartPanel title="Budget Allocation Share">
                    <PieChart>
                      <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280' }} />
                      <Pie data={budgetPieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                        {budgetPieData.map((entry, i) => (
                          <Cell key={entry.name} fill={DEPT_PIE_COLORS[i % DEPT_PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartPanel>
                </div>
              <div className="overflow-hidden rounded-t-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg/40 text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="px-4 py-3 text-left">Department</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Allocated Budget</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Current Spend</th>
                      {isComparing ? (
                        <>
                          <th className="px-4 py-3 text-right whitespace-nowrap">Past Spend</th>
                          <th className="px-4 py-3 text-right whitespace-nowrap">Spend Diff</th>
                          <th className="px-4 py-3 text-right whitespace-nowrap">% Change</th>
                        </>
                      ) : (
                        <th className="px-4 py-3 text-right whitespace-nowrap">Variance</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(budgetVsActual) ? budgetVsActual : []).slice(reportStart, reportEnd).map((r) => {
                      const variance = r.allocated - r.actual
                      const actualDiff = r.actual_diff != null ? r.actual_diff : (r.actual - (r.prior_actual || 0))
                      return (
                        <tr key={r.department} className="border-b border-border last:border-0 hover:bg-bg/40 transition-colors">
                          <td className="px-4 py-3.5 text-ink font-medium">{r.department}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-ink">{formatCurrency(r.allocated)}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-ink">{formatCurrency(r.actual)}</td>
                          {isComparing ? (
                            <>
                              <td className="px-4 py-3.5 text-right tabular-nums text-muted">{formatCurrency(r.prior_actual || 0)}</td>
                              <td className={`px-4 py-3.5 text-right tabular-nums font-semibold ${actualDiff <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {actualDiff <= 0 ? formatCurrency(actualDiff) : `+${formatCurrency(actualDiff)}`}
                              </td>
                              <td className="px-4 py-3.5 text-right tabular-nums text-xs">
                                {r.pct_change != null ? (
                                  <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold ${r.pct_change <= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'}`}>
                                    {r.pct_change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    {Math.abs(r.pct_change)}%
                                  </span>
                                ) : '—'}
                              </td>
                            </>
                          ) : (
                            <td className={`px-4 py-3.5 text-right tabular-nums font-medium ${variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                              {variance >= 0 ? formatCurrency(variance) + ' under' : formatCurrency(Math.abs(variance)) + ' over'}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                    {budgetVsActual.length === 0 && (
                      <tr><td colSpan={isComparing ? 6 : 4} className="px-4 py-10 text-center text-sm text-muted">No budgets found for this fiscal year.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Totals</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(budgetTotals.allocated)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(budgetTotals.actual)}</td>
                      {isComparing ? (
                        <>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">{formatCurrency(budgetTotals.priorActual)}</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-bold ${budgetTotals.actualDiff <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {budgetTotals.actualDiff <= 0 ? formatCurrency(budgetTotals.actualDiff) : `+${formatCurrency(budgetTotals.actualDiff)}`}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-xs text-muted">
                            {budgetTotals.priorActual ? `${(((budgetTotals.actual - budgetTotals.priorActual) / budgetTotals.priorActual) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </>
                      ) : (
                        <td className={`px-4 py-3 text-right tabular-nums ${budgetTotals.variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {budgetTotals.variance >= 0 ? formatCurrency(budgetTotals.variance) + ' under' : formatCurrency(Math.abs(budgetTotals.variance)) + ' over'}
                        </td>
                      )}
                    </tr>
                  </tfoot>
                </table>
                {budgetVsActual.length > REPORT_PAGE_SIZE && (
                  <Pagination page={reportPage} totalPages={Math.max(1, Math.ceil(budgetVsActual.length / REPORT_PAGE_SIZE))} onPageChange={setReportPage} total={budgetVsActual.length} label="departments" showRange rangeStart={reportStart + 1} rangeEnd={Math.min(reportEnd, budgetVsActual.length)} bordered />
                )}
              </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}