import BudgetGlLedgerModal from './BudgetGlLedgerModal'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw, ListTree, Info, Printer } from 'lucide-react'
import ResponsiveTable from './ResponsiveTable'
import Button from './Button'
import KpiValue from './KpiValue'
import { TableSkeleton } from './LoadingSkeleton'
import { apiFetch } from '../utils/api'
import { formatCurrency } from '../utils/formatters'
import { usePrivacy } from '../context/PrivacyContext'
import { useDataUpdates } from '../hooks/useDataUpdates'

const input = 'w-full min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink'
const panel = 'rounded-xl border border-border bg-surface shadow-card'
const metrics = b => {
  const budget = Number(b.allocated_amount) || 0
  const actual = Number(b.gl_report?.actual) || 0
  return { budget, actual, difference: budget - actual }
}
const sum = rows => rows.reduce((total, b) => {
  const m = metrics(b)
  return { budget: total.budget + m.budget, actual: total.actual + m.actual, difference: total.difference + m.difference }
}, { budget: 0, actual: 0, difference: 0 })

export default function BudgetComparisonReport({ onDetail, onPrint }) {
  const [ledger, setLedger] = useState(null)
  const [year, setYear] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [collapsed, setCollapsed] = useState(new Set())
  const { privacyOn } = usePrivacy()
  useDataUpdates(['budgets', 'expenses', 'disbursements', 'general-ledger'], () => setRevision(v => v + 1))

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    // Collect every server page before publishing totals; never show partial totals.
    const run = async () => {
      try {
        const all = []
        let lastPage = 1
        for (let page = 1; page <= lastPage; page++) {
          const params = new URLSearchParams({ page: String(page), per_page: '100', gl_report: '1' })
          if (year !== 'all') params.set('fiscal_year', year)
          const res = await apiFetch(`/api/budgets?${params}`, { signal: controller.signal })
          const json = await res.json()
          if (!res.ok || !json.success || !Array.isArray(json.data)) throw new Error(json.message || 'Unable to load budget comparison.')
          if (json.data.some(b => !b.gl_report)) throw new Error('G/L report data is unavailable. Refresh after the server update completes.')
          all.push(...json.data)
          lastPage = Number(json.meta?.last_page) || 1
          if (controller.signal.aborted) return
        }
        setRecords([...new Map(all.map(b => [b.budget_id, b])).values()].filter(b => !b.deleted_at && ['Active', 'Closed'].includes(b.status)))
      } catch (e) {
        if (!controller.signal.aborted) { setRecords([]); setError(e.message) }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [year, revision])

  const departments = useMemo(() => [...new Map(records.map(b => [String(b.department_id ?? 'none'), b.department_name || 'Unassigned'])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [records])
  const filtered = useMemo(() => records.filter(b =>
    (department === 'all' || String(b.department_id ?? 'none') === department) &&
    (status === 'all' || b.status === status) &&
    `${b.budget_name} ${b.budget_code} ${b.department_name}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [records, department, status, search])
  const groups = useMemo(() => {
    const result = new Map()
    filtered.forEach(b => {
      const id = String(b.department_id ?? 'none')
      if (!result.has(id)) result.set(id, { id, name: b.department_name || 'Unassigned', rows: [] })
      result.get(id).rows.push(b)
    })
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name)).map(g => ({ ...g, rows: g.rows.sort((a, b) => String(a.budget_code).localeCompare(String(b.budget_code))), totals: sum(g.rows) }))
  }, [filtered])
  const total = sum(filtered)
  const percentage = m => privacyOn ? 'Hidden' : m.budget === 0 ? 'N/A' : `${(m.difference / m.budget * 100).toFixed(1)}%`
  const toggle = id => setCollapsed(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next })
  const amountCells = m => <>
    <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(m.budget)}</td>
    <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(m.actual)}</td>
    <td className={`px-3 py-3 text-right tabular-nums ${m.difference < 0 ? 'text-status-danger' : ''}`}>{formatCurrency(m.difference)}</td>
    <td className={`px-3 py-3 text-right tabular-nums ${m.difference < 0 ? 'text-status-danger' : ''}`}>{percentage(m)}</td>
  </>

  return <section className="space-y-4" aria-label="Budget versus actual report">
    <div><h2 className="text-lg font-semibold text-ink">Budget versus actual</h2><p className="mt-1 text-xs leading-relaxed text-muted">Department, budget and G/L account detail. Actual is posted expense and fixed-asset debits minus credits for the linked budget, department and budget dates. Liability payments and unposted documents are excluded.</p></div>
    <div className={`${panel} grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4`}>
      <label className="text-xs text-muted">Fiscal year<select className={`${input} mt-1.5`} value={year} onChange={e => { setYear(e.target.value); setDepartment('all') }}><option value="all">All fiscal years</option>{Array.from({ length: new Date().getFullYear() - 2000 + 6 }, (_, i) => new Date().getFullYear() + 5 - i).map(y => <option key={y}>{y}</option>)}</select></label>
      <label className="text-xs text-muted">Department<select className={`${input} mt-1.5`} value={department} onChange={e => setDepartment(e.target.value)}><option value="all">All departments</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-xs text-muted">Status<select className={`${input} mt-1.5`} value={status} onChange={e => setStatus(e.target.value)}><option value="all">Active and closed</option><option>Active</option><option>Closed</option></select></label>
      <label className="text-xs text-muted">Search<input className={`${input} mt-1.5`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Budget code, name or department" /></label>
    </div>
    {error ? <div role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg p-4 text-sm text-status-danger">{error}<Button className="ml-3" size="sm" variant="secondary" onClick={() => setRevision(v => v + 1)}>Retry</Button></div> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[['Budget', total.budget], ['Actual', total.actual], ['Difference', total.difference]].map(([label, value]) => <div key={label} className={`${panel} p-4`}><p className="text-xs text-muted">{label}</p><div className="mt-2 break-words text-xl font-semibold tabular-nums text-ink"><KpiValue loading={loading}>{formatCurrency(value)}</KpiValue></div></div>)}</div>
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3"><p className="text-xs text-muted">All matching budgets across all pages</p><div className="flex flex-wrap gap-2"><Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set(groups.map(g => g.id)))}>Department totals</Button><Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set())}>Budget detail</Button><Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={() => setRevision(v => v + 1)}>Refresh</Button></div></div>
        <ResponsiveTable minTableWidth={640} className="w-full text-sm text-ink">
          <colgroup>{[30,15,15,15,12,13].map((width, i) => <col key={i} style={{ width: width + '%' }} />)}</colgroup>
          <thead className="bg-bg"><tr>{['Department / Budget', 'Budget', 'Actual', 'Difference', 'Difference %', 'Actions'].map((h, i) => <th key={h} className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <TableSkeleton columns={6} /> : groups.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-muted">No approved budgets match these filters.</td></tr> : groups.map(g => <Fragment key={g.id}>
              <tr className="border-y border-border bg-primary/5 font-semibold"><td className="px-3 py-3"><button type="button" aria-expanded={!collapsed.has(g.id)} onClick={() => toggle(g.id)} className="flex max-w-full items-center gap-2 text-left">{collapsed.has(g.id) ? <ChevronRight size={16} className="shrink-0" /> : <ChevronDown size={16} className="shrink-0" />}<span>{g.name}<span className="mt-1 block text-xs font-normal text-muted">{g.rows.length} budget{g.rows.length === 1 ? '' : 's'} / subtotal</span></span></button></td>{amountCells(g.totals)}<td /></tr>
              {!collapsed.has(g.id) && g.rows.map(b => <Fragment key={b.budget_id}><tr className="border-b border-border hover:bg-bg"><td className="px-3 py-3 sm:pl-8"><button type="button" onClick={() => onDetail(b)} className="text-left font-medium hover:underline">{b.budget_name}</button><p className="mt-1 text-xs text-muted">{b.budget_code} / FY {b.fiscal_year} / {b.status}</p>{!b.gl_report.allocation_complete && <p className="mt-1 text-xs text-status-warning">Account allocation required</p>}{b.gl_report.operational_gl_difference !== 0 && <p className="mt-1 text-xs text-muted">Operational usage differs from posted G/L. Review entries.</p>}</td>{amountCells(metrics(b))}<td className="px-2 py-3"><div className="flex flex-wrap justify-end gap-1">{[[ListTree, 'View transactions', setLedger], [Info, 'View details', onDetail], [Printer, 'Print budget', onPrint]].map(([Icon, label, action]) => <button key={label} type="button" title={label} aria-label={`${label}: ${b.budget_code}`} onClick={() => action(b)} className="rounded-lg p-2 text-muted hover:bg-primary/10 hover:text-ink"><Icon size={15} /></button>)}</div></td></tr>
                {b.gl_report.accounts.map(a => <tr key={a.account_id} className="border-b border-border bg-bg/40 text-xs"><td className="px-3 py-2 sm:pl-12"><span className="font-mono text-muted">{a.account_code}</span><p>{a.account_name}</p>{a.allocated_amount === 0 && <p className="text-status-warning">Unplanned account</p>}</td>{amountCells({budget:a.allocated_amount,actual:a.actual,difference:a.difference})}<td className="p-2 text-right"><button type="button" aria-label={`View G/L entries: ${b.budget_code} / ${a.account_code}`} title="View G/L entries" className="rounded-lg p-2 hover:bg-primary/10" onClick={() => setLedger({...b,account_id:a.account_id})}><ListTree size={15} /></button></td></tr>)}
                {b.gl_report.unallocated !== 0 && <tr className="border-b border-border text-xs text-status-warning"><td className="px-3 py-2 sm:pl-12">Unallocated budget</td>{amountCells({budget:b.gl_report.unallocated,actual:0,difference:b.gl_report.unallocated})}<td /></tr>}
              </Fragment>)}
            </Fragment>)}
          </tbody>
          {!loading && filtered.length > 0 && <tfoot className="border-t-2 border-border bg-bg font-semibold"><tr><td className="px-3 py-3">Report total</td>{amountCells(total)}<td /></tr></tfoot>}
        </ResponsiveTable>
        <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted">Difference = Budget minus Actual. Negative values indicate overspending. Difference % uses the budget as its base; zero budgets show N/A. Open transactions to check the entries supporting actual usage.</p>
      </div>
    </>}
    <BudgetGlLedgerModal selection={ledger} onClose={() => setLedger(null)} />
  </section>
}
