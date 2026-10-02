import { useEffect, useState } from 'react'
import { Skeleton } from './LoadingSkeleton'
import { apiFetch } from '../utils/api'

export default function ExpenseGlAccountField({ budgetId, value, onChange, error, disabled }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [mapped, setMapped] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    setAccounts([]); setLoadError(''); setMapped(false)
    if (!budgetId) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    apiFetch(`/api/expenses/posting-accounts?budget_id=${encodeURIComponent(budgetId)}`, { signal: controller.signal }).then(async res => {
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.message || 'Unable to load posting accounts.')
      if (controller.signal.aborted) return
      setAccounts(json.data); setMapped(json.budget_mapped)
      if (!value && json.data.length === 1) onChange(String(json.data[0].id))
    }).catch(e => { if (!controller.signal.aborted) setLoadError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
    // Fetch only when the budget changes; selecting an account is local state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId, retry])
  const unavailable = value && !accounts.some(a => String(a.id) === String(value))
  return <div className="min-w-0 rounded-xl border border-border bg-bg/40 p-3">
    <label htmlFor="expense-gl-account" className="mb-1.5 block text-xs font-medium text-muted">Posting G/L account <span className="text-status-danger">*</span></label>
    {loading ? <div role="status" aria-label="Loading G/L posting accounts"><Skeleton className="h-9 w-full" /></div> : <select id="expense-gl-account" value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled || !budgetId || !!loadError} className="h-10 w-full min-w-0 rounded-lg border border-border bg-bg px-3 text-sm text-ink focus:ring-2 focus:ring-primary/50">
      <option value="">{budgetId ? 'Select a G/L account' : 'Select a budget first'}</option>
      {unavailable && <option value={value}>Previously selected account (unavailable)</option>}
      {accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
    </select>}
    {loadError ? <p role="alert" className="mt-2 text-xs text-status-danger">{loadError} <button type="button" className="underline" onClick={() => setRetry(v => v + 1)}>Retry</button></p> : budgetId && !loading && <p className="mt-2 text-xs leading-relaxed text-muted">{mapped ? 'Only accounts allocated to this budget are available. Approval posts to the selected account.' : 'This budget has no G/L allocations yet. Select the posting account explicitly; usage will appear as unplanned until the budget is allocated.'}</p>}
    {error && <p className="mt-1 text-xs text-status-danger">{error}</p>}
    {!loading && !loadError && budgetId && accounts.length === 0 && <p className="mt-1 text-xs text-status-warning">No active posting accounts are available. Review the budget allocations and Chart of Accounts.</p>}
  </div>
}
