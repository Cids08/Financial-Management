import { useEffect, useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import ResponsiveTable from './ResponsiveTable'
import { TableSkeleton } from './LoadingSkeleton'
import { apiFetch } from '../utils/api'
import { formatCurrency } from '../utils/formatters'

export default function BudgetGlLedgerModal({ selection, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!selection) return
    const controller = new AbortController()
    setLoading(true); setData(null); setError('')
    apiFetch(`/api/budgets/${selection.budget_id}/gl-utilization${selection.account_id ? '?account_id=' + selection.account_id : ''}`, { signal: controller.signal }).then(async res => {
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Unable to load posted entries.')
      if (!controller.signal.aborted) setData(json.data)
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selection, retry])
  return <Modal open={!!selection} onClose={onClose} title="Posted G/L budget entries" size="2xl" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
    <p className="mb-3 text-sm text-muted">{selection?.budget_name}{data && ` / ${data.start_date} to ${data.end_date}`}</p>
    {error ? <p role="alert" className="text-status-danger">{error} <button onClick={() => setRetry(n => n + 1)} className="underline">Retry</button></p> : <ResponsiveTable minTableWidth={640} className="w-full text-sm text-ink">
      <thead><tr>{['Posting / Journal', 'Account / Source', 'Debit', 'Credit', 'Actual'].map(t => <th key={t} className="border-b border-border px-2 py-3 text-left text-xs text-muted">{t}</th>)}</tr></thead>
      <tbody>{loading ? <TableSkeleton columns={5} /> : data?.rows.length ? data.rows.map(r => <tr key={r.id} className="border-b border-border"><td className="p-2"><p>{r.transaction_date}</p><p className="text-xs text-muted">{r.transaction_no}</p></td><td className="p-2"><p>{r.account_code} - {r.account_name}</p><p className="text-xs text-muted">{r.description}</p><p className="text-xs text-muted">{r.reference_type} {r.reference_id ? '#' + r.reference_id : ''}</p></td>{[r.debit, r.credit, r.amount].map((a, i) => <td key={i} className="p-2 text-right tabular-nums">{formatCurrency(a)}</td>)}</tr>) : <tr><td colSpan={5} className="p-8 text-center text-muted">No matching posted entries. Unposted documents and liability payments are excluded.</td></tr>}</tbody>
      {data && <tfoot><tr><td colSpan={4} className="p-2 font-semibold">Posted actual total</td><td className="p-2 text-right font-semibold">{formatCurrency(data.total)}</td></tr></tfoot>}
    </ResponsiveTable>}
  </Modal>
}
