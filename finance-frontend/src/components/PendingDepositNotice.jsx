import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import Button from './Button'
import { apiFetch } from '../utils/api'

export default function PendingDepositNotice({ revision, onReview }) {
  const [count, setCount] = useState(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    let controller
    const refresh = async () => {
      if (document.hidden) return
      controller?.abort()
      controller = new AbortController()
      try {
        const response = await apiFetch('/api/deposit-batches?status=Pending&summary=1', { signal: controller.signal })
        const body = await response.json()
        if (!response.ok || !body.success || !Number.isFinite(Number(body.data?.total))) throw Error('Unavailable')
        if (active) { setCount(Number(body.data.total)); setError(false) }
      } catch (e) { if (active && e.name !== 'AbortError') setError(true) }
    }
    refresh()
    const timer = setInterval(refresh, 45000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; controller?.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [revision, retry])
  if (error) return <div className="flex flex-wrap items-center gap-2 text-xs text-muted" role="status">Pending deposit batch count is unavailable.<Button variant="ghost" size="sm" onClick={() => setRetry(n => n + 1)}>Retry</Button></div>
  if (!count) return null
  return <section aria-label="Pending deposit batches" className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <Clock3 size={20} className="mt-0.5 shrink-0 text-primary-dark" />
      <div className="min-w-0"><p role="status" className="text-sm font-semibold text-ink">{count} deposit {count === 1 ? 'batch needs' : 'batches need'} review</p><p className="mt-1 text-xs text-muted">Review the receipts and bank evidence before confirming. Another administrator must review batches you prepared.</p></div>
    </div>
    <Button size="sm" onClick={onReview} className="shrink-0">Review pending batches</Button>
  </section>
}
