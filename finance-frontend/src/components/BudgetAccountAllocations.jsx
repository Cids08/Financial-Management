import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Button from './Button'
import { ContentSkeleton } from './LoadingSkeleton'
import { apiFetch } from '../utils/api'
import { formatCurrency } from '../utils/formatters'

export default function BudgetAccountAllocations({ value = [], onChange, total, disabled = false }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    apiFetch('/api/budgets/allocation-accounts', { signal: controller.signal }).then(async res => {
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Unable to load G/L accounts.')
      if (!controller.signal.aborted) setAccounts(json.data)
    }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  const assigned = value.reduce((n, r) => n + Math.round((Number(r.allocated_amount) || 0) * 100), 0)
  const balance = (Math.round((Number(total) || 0) * 100) - assigned) / 100
  const change = (i, key, next) => onChange(value.map((r, index) => index === i ? { ...r, [key]: next } : r))
  const input = 'w-full min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink'
  return <section className="space-y-3 rounded-xl border border-border p-3" aria-label="G/L account allocations">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-ink">G/L account allocations</h3><Button size="sm" variant="secondary" icon={Plus} disabled={disabled || loading || !!error} onClick={() => onChange([...value, { account_id: '', allocated_amount: '' }])}>Add account</Button></div>
    <p className="text-xs leading-relaxed text-muted">Split the budget across expense or fixed-asset accounts. The allocations must equal the budget total. Cash and payable accounts are excluded to avoid counting payments as expenses.</p>
    {loading ? <ContentSkeleton rows={2} /> : error ? <div role="alert" className="text-sm text-status-danger">{error} <button type="button" onClick={() => setRevision(v => v + 1)} className="underline">Retry</button></div> : value.length === 0 ? <p className="text-xs text-muted">Add at least one account before saving.</p> : value.map((row, i) => <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_140px_32px]">
      <label className="min-w-0 text-xs text-muted">G/L account {i + 1}<select aria-label={`G/L account ${i + 1}`} disabled={disabled} className={`${input} mt-1`} value={row.account_id} onChange={e => change(i, 'account_id', e.target.value)}><option value="">Select an account</option>{row.account_id && !accounts.some(a => String(a.id) === String(row.account_id)) && <option value={row.account_id}>{row.account_code || row.account_id} (unavailable)</option>}{accounts.map(a => <option key={a.id} value={a.id} disabled={value.some((v, n) => n !== i && String(v.account_id) === String(a.id))}>{a.account_code} - {a.account_name}</option>)}</select></label>
      <label className="text-xs text-muted">Allocation<input aria-label={`Allocation ${i + 1}`} type="number" step="0.01" min="0.01" disabled={disabled} className={`${input} mt-1 text-right`} value={row.allocated_amount} onChange={e => change(i, 'allocated_amount', e.target.value)} /></label>
      <button type="button" aria-label={`Remove allocation ${i + 1}`} disabled={disabled} onClick={() => onChange(value.filter((_, n) => n !== i))} className="rounded-lg p-2 text-muted hover:text-status-danger"><Trash2 size={16} /></button>
    </div>)}
    <p className={`border-t border-border pt-2 text-xs ${balance !== 0 ? 'text-status-warning' : 'text-status-success'}`}>Allocated: {formatCurrency(assigned / 100)} / Unallocated: {formatCurrency(balance)}</p>
  </section>
}
