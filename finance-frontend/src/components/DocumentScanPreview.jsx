import { useEffect, useState } from 'react'
import { ScanLine, Loader2 } from 'lucide-react'
import { apiFetch } from '../utils/api'
import { compressImageToUploadable } from '../utils/fileUpload'
import Button from './Button'

export default function DocumentScanPreview({ file, onScanState, disabled = false }) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true); setResult(null); setError(''); onScanState?.(file, 'scanning')
    ;(async () => {
      try {
        const prepared = await compressImageToUploadable(file)
        if (!active) return
        const form = new FormData(); form.append('image', prepared)
        const response = await apiFetch('/api/invoices/scan', { method: 'POST', body: form, signal: controller.signal })
        const body = await response.json()
        if (!response.ok || !body.success) throw new Error(body.message || 'Document details could not be read.')
        if (active) { setResult(body.data || {}); onScanState?.(file, 'success') }
      } catch (e) { if (active) { setError(e.message || 'Document scanning is unavailable.'); onScanState?.(file, 'failed') } }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false; controller.abort() }
  }, [file, attempt, onScanState])
  const fields = [['Document number', result?.invoice_number], ['Document date', result?.invoice_date], ['Due date', result?.due_date], ['Amount as read', result?.amount], ['Reference', result?.reference_no]].filter(([,value]) => value !== null && value !== undefined && value !== '')
  return <section aria-label="Document scan" aria-busy={loading} className="rounded-xl border border-border bg-bg p-3 space-y-3">
    <div className="flex items-center gap-2 text-sm font-semibold text-ink"><ScanLine size={17} className="text-primary-dark" />Document scan</div>
    {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" />Reading document details...</p> : error ? <div className="space-y-2"><p role="status" className="text-xs text-muted break-words">{error} Attachment is blocked. Retry the scan or choose a clearer document.</p><Button size="sm" variant="secondary" disabled={disabled} onClick={() => { onScanState?.(file, 'scanning'); setAttempt(a => a + 1) }}>Retry scan</Button></div> : fields.length ? <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="text-sm text-ink break-words">{String(value)}</dd></div>)}</dl> : <p className="text-xs text-muted">No document fields detected. Review the original file.</p>}
    <p className="text-xs text-muted">Check detected details against the original. Scanning does not change the saved record or verify payment.</p>
  </section>
}
