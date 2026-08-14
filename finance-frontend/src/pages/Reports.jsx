import { useMemo, useState, useEffect } from 'react'
import {
  FileBarChart, TrendingUp, Wallet, Users, Truck, PiggyBank, Download, ChevronRight, Loader2,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import { formatCurrency } from '../utils/formatters'
import { useReports } from '../hooks/useReports'
import { useCompany } from '../context/CompanyContext'

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-150`

const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year']

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
  { key: 'd1_30', name: '1–30 Days', color: '#F4B400' },
  { key: 'd31_60', name: '31–60 Days', color: '#f97316' },
  { key: 'd61_90', name: '61–90 Days', color: '#ef4444' },
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
const CURRENCY_TICK = (v) => `₱${(v / 1000).toFixed(0)}k`

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

// -- Report generation (opens a formatted, printable document — "Save as PDF" from the browser print dialog works with no extra libraries) --

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #1a1a1a; padding: 48px; }
  .letterhead { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; margin-bottom: 28px; }
  .letterhead img { height: 56px; width: 56px; object-fit: contain; border-radius: 6px; }
  .letterhead .company-name { font-size: 18px; font-weight: 700; margin: 0; }
  .letterhead .company-meta { font-size: 11px; color: #666; margin: 2px 0 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; margin-bottom: 24px; }
  .header h1 { margin: 0 0 4px; font-size: 22px; }
  .header p { margin: 0; color: #666; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 13px; text-align: left; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #666; border-bottom: 2px solid #1a1a1a; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.section-heading td { background: #f7f7f7; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  tfoot td { border-top: 2px solid #1a1a1a; font-weight: 700; }
  .positive { color: #059669; }
  .negative { color: #dc2626; }
  .footer { margin-top: 32px; font-size: 12px; color: #999; text-align: center; }
  .report-block { margin-top: 0; }
  .report-block + .report-block { margin-top: 40px; }
  .report-block h2 { font-size: 16px; margin: 0 0 4px; }
  .report-block .block-sub { margin: 0 0 12px; font-size: 12px; color: #666; }
  @media print {
    body { padding: 24px; }
    /* Adjacent-sibling combinator, not :not(:first-child) — the previous
       rule compared each .report-block against being the first child of
       <body>, but .letterhead/.header always precede it there, so it
       never matched and EVERY report (including the first) got forced
       onto its own page, leaving page 1 almost entirely blank. This
       version only matches a .report-block that directly follows
       another .report-block — correctly "every report after the first",
       regardless of what non-report elements come earlier in the body. */
    .report-block + .report-block { page-break-before: always; }
  }
`

// Resolves once the image has actually finished downloading (or after a
// failure/timeout — never blocks the export indefinitely on a bad URL).
// Without this, window.print() can fire before a freshly-opened popup's
// <img> has loaded, especially on longer documents with more HTML to
// parse first — the logo silently never appears in that case, even
// though its src was correct all along.
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

function printReport(title, subtitle, bodyHtml, company) {
  const win = window.open('', '_blank', 'width=850,height=1000')
  if (!win) return
  const generatedAt = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  // Letterhead renders once, above everything else — since it sits
  // outside the per-report .report-block loop (which is what gets the
  // page-break-before rule), it only ever appears on the first printed
  // page, never repeated on pages 2+ of a multi-report export.
  const letterheadHtml = company?.name ? `
    <div class="letterhead">
      ${company.logoUrl ? `<img src="${company.logoUrl}" alt="${company.name} logo" />` : ''}
      <div>
        <p class="company-name">${company.name}</p>
        ${company.address ? `<p class="company-meta">${company.address}</p>` : ''}
      </div>
    </div>
  ` : ''

  win.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        ${letterheadHtml}
        <div class="header">
          <div>
            <h1>${title}</h1>
            <p>${subtitle}</p>
          </div>
        </div>
        ${bodyHtml}
        <div class="footer">Generated on ${generatedAt}</div>
      </body>
    </html>
  `)
  win.document.close()
  win.focus()

  // Print only after the popup's OWN <img> element has actually finished
  // decoding — not just after preloadImage() has warmed the browser
  // cache in the parent window. Those are two different moments: the
  // bytes being cached doesn't mean this specific document's <img> has
  // painted yet, and Chrome's print snapshot can still be taken in
  // between those two things without this explicit wait.
  const logoImg = win.document.querySelector('.letterhead img')
  if (logoImg && !logoImg.complete) {
    let printed = false
    const doPrint = () => { if (!printed) { printed = true; win.print() } }
    logoImg.addEventListener('load', doPrint)
    logoImg.addEventListener('error', doPrint)
    setTimeout(doPrint, 2000) // fallback if the image never settles
  } else {
    win.print()
  }
}

function agingRowHtml(label, r) {
  return `<tr>
    <td>${label}</td>
    <td class="num">${r.current ? formatCurrency(r.current) : '—'}</td>
    <td class="num">${r.d1_30 ? formatCurrency(r.d1_30) : '—'}</td>
    <td class="num">${r.d31_60 ? formatCurrency(r.d31_60) : '—'}</td>
    <td class="num">${r.d61_90 ? formatCurrency(r.d61_90) : '—'}</td>
    <td class="num">${r.over90 ? formatCurrency(r.over90) : '—'}</td>
  </tr>`
}

export default function Reports({ title = 'Reports', crumbs = ['Reports'] }) {
  const [activeReport, setActiveReport] = useState('income-statement')
  const [period, setPeriod] = useState('This Quarter')
  const [exporting, setExporting] = useState(false)

  const { data, loading, error, fetchReport, fetchAll } = useReports()

  // Powers the letterhead (logo + company name) on printed/exported
  // reports. ASSUMPTION: SettingsController returns { companyName,
  // companyLogoUrl, companyAddress } as absolute-URL camelCase, same
  // convention as ProfileResource's avatarUrl. Adjust the three keys
  // below if your actual SettingsResource differs.
  // Same source Settings.jsx itself uses to display/edit this data — no
  // separate fetch or key-name guessing needed. CompanyProvider is
  // mounted at the layout level (same pattern as ProfileProvider), so
  // this is normally already loaded well before anyone reaches this page.
  const { name: companyName, logoUrl: companyLogoUrl, address: companyAddress, loading: companyLoading } = useCompany()

  const company = useMemo(() => (
    companyName ? { name: companyName, logoUrl: companyLogoUrl, address: companyAddress } : null
  ), [companyName, companyLogoUrl, companyAddress])

  // Fetch whenever the active tab or period changes — the hook itself
  // skips the network call if that exact (report, period) combination
  // is already cached, so flipping between tabs you've already visited
  // this period is instant.
  useEffect(() => {
    fetchReport(activeReport, period)
  }, [activeReport, period, fetchReport])

  const activeCard = REPORT_CARDS.find((c) => c.key === activeReport)
  const isActiveLoading = !!loading[activeReport]

  const incomeStatement = data['income-statement']
  const cashFlow = data['cash-flow']
  const arAging = data['ar-aging']
  const apAging = data['ap-aging']
  const budgetVsActual = data['budget-vs-actual']

  const incomeTotals = useMemo(() => {
    const totalRevenue = incomeStatement.revenue.reduce((s, r) => s + r.amount, 0)
    const totalExpenses = incomeStatement.expenses.reduce((s, r) => s + r.amount, 0)
    return { totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses }
  }, [incomeStatement])

  const cashFlowTotals = useMemo(() => {
    const inflow = cashFlow.reduce((s, r) => s + r.inflow, 0)
    const outflow = cashFlow.reduce((s, r) => s + r.outflow, 0)
    return { inflow, outflow, net: inflow - outflow }
  }, [cashFlow])

  const arTotal = useMemo(() => arAging.reduce((s, r) => s + r.current + r.d1_30 + r.d31_60 + r.d61_90 + r.over90, 0), [arAging])
  const apTotal = useMemo(() => apAging.reduce((s, r) => s + r.current + r.d1_30 + r.d31_60 + r.d61_90 + r.over90, 0), [apAging])

  const budgetTotals = useMemo(() => {
    const allocated = budgetVsActual.reduce((s, r) => s + r.allocated, 0)
    const actual = budgetVsActual.reduce((s, r) => s + r.actual, 0)
    return { allocated, actual, variance: allocated - actual }
  }, [budgetVsActual])

  // -- Chart data, derived from the same source data as the tables above --

  const incomeChartData = useMemo(() => ([
    { name: 'Revenue', value: incomeTotals.totalRevenue, fill: CHART_COLORS.revenue },
    { name: 'Expenses', value: incomeTotals.totalExpenses, fill: CHART_COLORS.expense },
    { name: 'Net Income', value: incomeTotals.netIncome, fill: CHART_COLORS.net },
  ]), [incomeTotals])

  const expensePieData = useMemo(() => incomeStatement.expenses.map((e) => ({
    name: e.account.replace(/^\S+\s*—\s*/, ''),
    value: e.amount,
  })), [incomeStatement])

  const cashFlowChartData = useMemo(() => cashFlow.map((r) => ({
    name: r.account.split('—')[1]?.trim() ?? r.account,
    inflow: r.inflow,
    outflow: r.outflow,
    net: r.inflow - r.outflow,
  })), [cashFlow])

  const arBucketTotals = useMemo(() => AGING_BUCKETS.map((b) => ({
    name: b.name,
    value: arAging.reduce((s, r) => s + r[b.key], 0),
    color: b.color,
  })), [arAging])

  const apBucketTotals = useMemo(() => AGING_BUCKETS.map((b) => ({
    name: b.name,
    value: apAging.reduce((s, r) => s + r[b.key], 0),
    color: b.color,
  })), [apAging])

  const budgetPieData = useMemo(() => budgetVsActual.map((r) => ({
    name: r.department,
    value: r.allocated,
  })), [budgetVsActual])

  // -- Report body builders: one per report type, reused by both the single-report export and the "export all" package --

  const buildIncomeStatementTable = () => `
    <table>
      <tbody>
        <tr class="section-heading"><td colspan="2">Revenue</td></tr>
        ${incomeStatement.revenue.map((r) => `<tr><td>${r.account}</td><td class="num">${formatCurrency(r.amount)}</td></tr>`).join('')}
        <tr class="section-heading"><td colspan="2">Expenses</td></tr>
        ${incomeStatement.expenses.map((r) => `<tr><td>${r.account}</td><td class="num">${formatCurrency(r.amount)}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><td>Total Revenue</td><td class="num">${formatCurrency(incomeTotals.totalRevenue)}</td></tr>
        <tr><td>Total Expenses</td><td class="num">${formatCurrency(incomeTotals.totalExpenses)}</td></tr>
        <tr><td>Net Income</td><td class="num ${incomeTotals.netIncome >= 0 ? 'positive' : 'negative'}">${formatCurrency(incomeTotals.netIncome)}</td></tr>
      </tfoot>
    </table>
  `

  const buildCashFlowTable = () => `
    <table>
      <thead>
        <tr><th>Cash Account</th><th class="num">Inflow</th><th class="num">Outflow</th><th class="num">Net Change</th></tr>
      </thead>
      <tbody>
        ${cashFlow.map((r) => {
          const net = r.inflow - r.outflow
          return `<tr><td>${r.account}</td><td class="num">${formatCurrency(r.inflow)}</td><td class="num">${formatCurrency(r.outflow)}</td><td class="num ${net >= 0 ? 'positive' : 'negative'}">${formatCurrency(net)}</td></tr>`
        }).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>Totals</td>
          <td class="num">${formatCurrency(cashFlowTotals.inflow)}</td>
          <td class="num">${formatCurrency(cashFlowTotals.outflow)}</td>
          <td class="num ${cashFlowTotals.net >= 0 ? 'positive' : 'negative'}">${formatCurrency(cashFlowTotals.net)}</td>
        </tr>
      </tfoot>
    </table>
  `

  const buildARAgingTable = () => `
    <table>
      <thead>
        <tr><th>Customer</th><th class="num">Current</th><th class="num">1–30 Days</th><th class="num">31–60 Days</th><th class="num">61–90 Days</th><th class="num">90+ Days</th></tr>
      </thead>
      <tbody>
        ${arAging.map((r) => agingRowHtml(r.customer, r)).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="5">Total Outstanding</td><td class="num">${formatCurrency(arTotal)}</td></tr>
      </tfoot>
    </table>
  `

  const buildAPAgingTable = () => `
    <table>
      <thead>
        <tr><th>Supplier</th><th class="num">Current</th><th class="num">1–30 Days</th><th class="num">31–60 Days</th><th class="num">61–90 Days</th><th class="num">90+ Days</th></tr>
      </thead>
      <tbody>
        ${apAging.map((r) => agingRowHtml(r.supplier, r)).join('')}
      </tbody>
      <tfoot>
        <tr><td colspan="5">Total Outstanding</td><td class="num">${formatCurrency(apTotal)}</td></tr>
      </tfoot>
    </table>
  `

  const buildBudgetTable = () => `
    <table>
      <thead>
        <tr><th>Department</th><th class="num">Allocated Budget</th><th class="num">Actual Spend</th><th class="num">Variance</th></tr>
      </thead>
      <tbody>
        ${budgetVsActual.map((r) => {
          const variance = r.allocated - r.actual
          const label = variance >= 0 ? `${formatCurrency(variance)} under` : `${formatCurrency(Math.abs(variance))} over`
          return `<tr><td>${r.department}</td><td class="num">${formatCurrency(r.allocated)}</td><td class="num">${formatCurrency(r.actual)}</td><td class="num ${variance >= 0 ? 'positive' : 'negative'}">${label}</td></tr>`
        }).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td>Totals</td>
          <td class="num">${formatCurrency(budgetTotals.allocated)}</td>
          <td class="num">${formatCurrency(budgetTotals.actual)}</td>
          <td class="num ${budgetTotals.variance >= 0 ? 'positive' : 'negative'}">${budgetTotals.variance >= 0 ? formatCurrency(budgetTotals.variance) + ' under' : formatCurrency(Math.abs(budgetTotals.variance)) + ' over'}</td>
        </tr>
      </tfoot>
    </table>
  `

  const REPORT_BUILDERS = {
    'income-statement': { title: 'Income Statement', table: buildIncomeStatementTable },
    'cash-flow': { title: 'Cash Flow Summary', table: buildCashFlowTable },
    'ar-aging': { title: 'Accounts Receivable Aging', table: buildARAgingTable },
    'ap-aging': { title: 'Accounts Payable Aging', table: buildAPAgingTable },
    'budget-vs-actual': { title: 'Budget vs. Actual', table: buildBudgetTable },
  }

  // Exports just the report currently selected on screen — its data is
  // already loaded since it's the active tab.
  const handleExportActive = async () => {
    const { title: reportTitle, table } = REPORT_BUILDERS[activeReport]
    await preloadImage(company?.logoUrl)
    printReport(reportTitle, `Period: ${period}`, table(), company)
  }

  // Exports all 5 reports as one document — has to ensure every report's
  // data is actually loaded first (not just whichever tab is active),
  // since the person may never have clicked some of these tabs this
  // session.
  const handleExportAll = async () => {
    setExporting(true)
    try {
      await Promise.all([fetchAll(period), preloadImage(company?.logoUrl)])
      const body = REPORT_CARDS.map((card) => `
        <div class="report-block">
          <h2>${card.title}</h2>
          <p class="block-sub">${card.description}</p>
          ${REPORT_BUILDERS[card.key].table()}
        </div>
      `).join('')
      printReport('Financial Reports Package', `Period: ${period} — All Reports`, body, company)
    } finally {
      setExporting(false)
    }
  }

  const statCardsAreEmpty = isActiveLoading

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">
            Financial statements assembled from posted Collections, Disbursements, Budgets, and Expenses across the General Ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className={INPUT}>
            {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportAll} disabled={exporting}>
            {exporting ? 'Preparing…' : 'Export All'}
          </Button>
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
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <FileBarChart size={16} className="text-primary-dark" />
          <p className="text-sm font-semibold text-ink">{activeCard.title}</p>
          <span className="text-xs text-muted">{period}</span>
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
                <div className="grid grid-cols-1 gap-4 border-b border-border p-4 lg:grid-cols-2">
                  <ChartPanel title="Revenue vs. Expenses vs. Net Income">
                    <BarChart data={incomeChartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: '#E5E7EB' }} tickLine={false} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={CURRENCY_TICK} width={56} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(value) => formatCurrency(value)} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
                        {incomeChartData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-border bg-bg/60">
                      <td className="px-4 py-2.5 font-semibold text-ink text-xs uppercase tracking-wide" colSpan={2}>Revenue</td>
                    </tr>
                    {incomeStatement.revenue.map((r) => (
                      <tr key={r.account} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-ink">{r.account}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                    {incomeStatement.revenue.length === 0 && (
                      <tr><td colSpan={2} className="px-4 py-3 text-center text-xs text-muted">No revenue posted for this period.</td></tr>
                    )}
                    <tr className="border-b border-border bg-bg/60">
                      <td className="px-4 py-2.5 font-semibold text-ink text-xs uppercase tracking-wide" colSpan={2}>Expenses</td>
                    </tr>
                    {incomeStatement.expenses.map((r) => (
                      <tr key={r.account} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-ink">{r.account}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(r.amount)}</td>
                      </tr>
                    ))}
                    {incomeStatement.expenses.length === 0 && (
                      <tr><td colSpan={2} className="px-4 py-3 text-center text-xs text-muted">No expenses posted for this period.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Total Revenue</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">{formatCurrency(incomeTotals.totalRevenue)}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Total Expenses</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">{formatCurrency(incomeTotals.totalExpenses)}</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted font-semibold">Net Income</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-bold ${incomeTotals.netIncome >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {formatCurrency(incomeTotals.netIncome)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </>
            )}

            {activeReport === 'cash-flow' && (
              <>
                <div className="border-b border-border p-4">
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
                </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Cash Account</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Inflow (Collections)</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Outflow (Disbursements)</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Net Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashFlow.map((r) => {
                      const net = r.inflow - r.outflow
                      return (
                        <tr key={r.account} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                          <td className="px-4 py-3.5 text-ink">{r.account}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-ink">{formatCurrency(r.inflow)}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-ink">{formatCurrency(r.outflow)}</td>
                          <td className={`px-4 py-3.5 text-right tabular-nums font-medium ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(net)}</td>
                        </tr>
                      )
                    })}
                    {cashFlow.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">No collections or disbursements posted for this period.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Totals</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(cashFlowTotals.inflow)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(cashFlowTotals.outflow)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${cashFlowTotals.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(cashFlowTotals.net)}</td>
                    </tr>
                  </tfoot>
                </table>
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Customer</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Current</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">1–30 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">31–60 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">61–90 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">90+ Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arAging.map((r) => (
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Supplier</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Current</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">1–30 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">31–60 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">61–90 Days</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">90+ Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apAging.map((r) => (
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
              </div>
              </>
            )}

            {activeReport === 'budget-vs-actual' && (
              <>
                <div className="grid grid-cols-1 gap-4 border-b border-border p-4 lg:grid-cols-2">
                  <ChartPanel title="Allocated vs. Actual by Department">
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Department</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Allocated Budget</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Actual Spend</th>
                      <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetVsActual.map((r) => {
                      const variance = r.allocated - r.actual
                      return (
                        <tr key={r.department} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                          <td className="px-4 py-3.5 text-ink">{r.department}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-ink">{formatCurrency(r.allocated)}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-ink">{formatCurrency(r.actual)}</td>
                          <td className={`px-4 py-3.5 text-right tabular-nums font-medium ${variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {variance >= 0 ? formatCurrency(variance) + ' under' : formatCurrency(Math.abs(variance)) + ' over'}
                          </td>
                        </tr>
                      )
                    })}
                    {budgetVsActual.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">No budgets found for this fiscal year.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-right text-xs uppercase tracking-wide text-muted">Totals</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(budgetTotals.allocated)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{formatCurrency(budgetTotals.actual)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${budgetTotals.variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {budgetTotals.variance >= 0 ? formatCurrency(budgetTotals.variance) + ' under' : formatCurrency(Math.abs(budgetTotals.variance)) + ' over'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}