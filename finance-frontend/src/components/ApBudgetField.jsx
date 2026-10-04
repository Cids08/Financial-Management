import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'
import { Skeleton } from './LoadingSkeleton'

export default function ApBudgetField({ value, onChange }) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    ;(async () => {
      try {
        const response = await apiFetch('/api/accounts-payable/budget-options', { signal: controller.signal })
        const body = await response.json()
        if (!response.ok || !body.success) throw new Error(body.message || 'Could not load budgets.')
        if (!controller.signal.aborted) setOptions(body.data || [])
      } catch (e) { if (!controller.signal.aborted) setError(e.message) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [retry])
  return <div className="space-y-1.5 min-w-0">
    <label htmlFor="ap-budget" className="block text-xs font-medium text-muted">Budget allocation (optional)</label>
    {loading ? <Skeleton className="h-9 w-full" /> : <select id="ap-budget" value={value || ''} onChange={e => onChange(e.target.value)} disabled={!!error} className="w-full min-w-0 h-9 rounded-lg border border-border bg-bg px-3 text-sm text-ink">
      <option value="">No budget allocation</option>
      {value && !options.some(b => String(b.id) === String(value)) && <option value={value}>Existing budget #{value} (not active)</option>}
      {options.map(b => <option key={b.id} value={b.id}>{b.budget_code} - {b.budget_name}</option>)}
    </select>}
    {error ? <p role="alert" className="text-xs text-status-danger">{error} <button type="button" className="underline" onClick={() => setRetry(n => n + 1)}>Retry</button></p> : <p className="text-xs text-muted">Links this bill to G/L budget actuals. The account and invoice date must match the selected budget.</p>}
  </div>
}
