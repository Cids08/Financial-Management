import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from './Modal'
import Button from './Button'
import ResponsiveTable from './ResponsiveTable'
import Pagination from './Pagination'
import ModalLoading from './ModalLoading'
import { apiFetch } from '../utils/api'
import { formatCurrency } from '../utils/formatters'
import { usePrivacy } from '../context/PrivacyContext'

export default function CollectorInvoicesModal({ collector, onClose }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('open')
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const navigate = useNavigate()
  usePrivacy()
  useEffect(() => { setSearch(''); setFilter('open'); setPage(1) }, [collector?.collector_id])
  useEffect(() => {
    if (!collector) return
    let active = true
    const controller = new AbortController()
    setLoading(true); setError(''); setRecords([])
    apiFetch('/api/accounts-receivable?archived=0&collector_id=' + collector.collector_id, {signal:controller.signal})
      .then(async response => { const body = await response.json(); if (!response.ok || !body.success) throw Error(body.message || 'Could not load assigned invoices.'); return body.data })
      .then(data => { if (active) setRecords(data || []) })
      .catch(e => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [collector?.collector_id, retry])
  const open = records.filter(r => !['Paid','Cancelled'].includes(r.status) && Number(r.balance)>0)
  const overdue = open.filter(r => r.status === 'Overdue')
  const filtered = records.filter(r => (filter==='all' || (filter==='overdue' ? overdue.includes(r) : open.includes(r))) && (r.invoice_number+' '+r.customer_name).toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
  const pages = Math.max(1,Math.ceil(filtered.length/10))
  const currentPage = Math.min(page,pages)
  return <Modal open={!!collector} onClose={onClose} title="Assigned Invoices" size="2xl" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
    <div className="space-y-4 min-w-0">
      <div><p className="font-semibold text-ink">{collector?.first_name} {collector?.last_name}</p><p className="text-xs text-muted">{collector?.assigned_area || 'Collection worklist'} ? Active assignments</p></div>
      <p className="rounded-xl bg-primary/10 p-3 text-xs text-ink">Collect cash or checks against assigned invoices, issue the customer receipt, then record the collection and deposit evidence in Collections. Admin confirms the collection.</p>
      {loading ? <ModalLoading label="Loading assigned invoices" /> : error ? <div role="alert" className="space-y-2 text-sm text-status-danger"><p>{error}</p><Button variant="secondary" onClick={()=>setRetry(n=>n+1)}>Retry loading</Button></div> : <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[['Open invoices',open.length],['Outstanding balance',formatCurrency(open.reduce((sum,r)=>sum+Number(r.balance||0),0))],['Overdue invoices',overdue.length]].map(([label,value])=><div key={label} className="rounded-xl border border-border p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-lg font-semibold text-ink break-words">{value}</p></div>)}</div>
        <p className="text-xs text-muted">Outstanding balance is the amount still due on invoices, not cash held by the collector. Pending receipts and bank deposits are tracked separately in Collections.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><label className="text-xs text-muted">Search invoices<input aria-label="Search assigned invoices" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Invoice number or customer" className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-sm text-ink" /></label><label className="text-xs text-muted">Show<select aria-label="Assigned invoice status" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}} className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-sm text-ink"><option value="open">Open invoices</option><option value="overdue">Overdue invoices</option><option value="all">All assigned invoices</option></select></label></div>
        <ResponsiveTable minTableWidth={720} className="w-full text-sm"><thead><tr>{['Invoice / Customer','Due date','Invoice amount','Outstanding','Status'].map(h=><th key={h} className="p-3 text-left text-xs text-muted">{h}</th>)}</tr></thead><tbody>{filtered.slice((currentPage-1)*10,currentPage*10).map(r=><tr key={r.ar_id} className="border-t border-border"><td className="p-3"><button className="text-left font-semibold text-primary-dark hover:underline" onClick={()=>{onClose();navigate('/transactions/receivable',{state:{highlightId:r.ar_id,highlightSearch:r.invoice_number}})}}>{r.invoice_number}</button><p className="text-xs text-muted break-words">{r.customer_name}</p></td><td className="p-3">{r.due_date || '?'}</td><td className="p-3 tabular-nums">{formatCurrency(r.original_amount)}</td><td className="p-3 font-semibold tabular-nums">{formatCurrency(r.balance)}</td><td className="p-3"><span className={r.status==='Overdue'?'text-status-danger':'text-muted'}>{r.status}</span></td></tr>)}</tbody></ResponsiveTable>
        {!filtered.length && <p className="p-5 text-center text-sm text-muted">{records.length ? 'No invoices match these filters.' : 'No invoices assigned. Staff can assign invoices from Accounts Receivable.'}</p>}
        <Pagination page={currentPage} totalPages={pages} total={filtered.length} onPageChange={setPage} label="assigned invoices" />
      </>}
    </div>
  </Modal>
}
