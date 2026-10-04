import ModalLoading from './ModalLoading'
import { useEffect, useRef, useState } from 'react'
import { FileText, ExternalLink, RotateCcw } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

const sizeLabel = bytes => !bytes ? '' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB'
const dateLabel = value => value ? new Date(value).toLocaleString('en-PH', {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Date unavailable'

export default function DocumentHistoryModal({ open, onClose, record, fetchHistory, onView, title = 'Documents', toolbar, emptyMessage = 'Use Attach document on the record to add its supporting document.' }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewError, setViewError] = useState('')
  const [notice, setNotice] = useState('')
  const [viewingId, setViewingId] = useState(null)
  const [retry, setRetry] = useState(0)
  const busy = useRef(false)
  useEffect(() => {
    if (!open || !record?.id) return
    let cancelled = false
    setDocuments([]); setLoading(true); setError(''); setViewError(''); setNotice('')
    ;(async () => {
      try {
        const result = await fetchHistory(record.id)
        if (!result?.success) throw new Error(result?.message || 'Could not load document history.')
        if (!cancelled) setDocuments(result.data || [])
      } catch (e) { if (!cancelled) setError(e.message || 'Could not load document history.') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [open, record?.id, fetchHistory, retry])
  const view = async doc => {
    if (busy.current) return
    const target = window.open('', '_blank')
    if (!target) { setViewError('Allow pop-ups for this site, then select View document again.'); return }
    target.opener = null
    target.document.title = 'Opening document'
    target.document.body.textContent = 'Loading your document...'
    busy.current = true; setViewingId(doc.id); setViewError(''); setNotice('')
    try {
      const result = await onView(record.id, doc.id, target)
      if (!result?.success) throw new Error(result?.message || 'Could not open the document.')
      if (!result.viewedInline) setNotice('The document was downloaded because this browser could not display it inline.')
    } catch (e) { if (!target.closed) target.close(); setViewError(e.message || 'Could not open the document. Try again.') }
    finally { busy.current = false; setViewingId(null) }
  }
  const close = () => { if (!busy.current) onClose() }
  return <Modal open={open} onClose={close} title={title} size="lg" footer={<Button variant="secondary" disabled={viewingId !== null} onClick={close}>Close</Button>}>
    <div className="space-y-4 min-w-0">
      <div className="rounded-xl border border-border bg-bg p-3"><p className="text-xs text-muted">{record?.label || 'Record #' + record?.id}</p><p className="mt-1 text-sm font-semibold text-ink break-words">{record?.description}</p></div>
      {toolbar?.(viewingId !== null)}
      <p className="text-xs text-muted">Newest version first. Viewing opens the financial document in a new browser tab on this device. Earlier versions remain available below.</p>
      {error && <div role="alert" className="rounded-xl border border-status-danger-border bg-status-danger-bg p-3 space-y-2"><p className="text-sm text-status-danger break-words">{error}</p><Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setRetry(n => n + 1)}>Retry loading</Button></div>}
      {viewError && <p role="alert" className="rounded-xl bg-status-danger-bg p-3 text-sm text-status-danger break-words">{viewError}</p>}
      {notice && <p role="status" className="rounded-xl bg-bg p-3 text-sm text-muted">{notice}</p>}
      {loading ? <ModalLoading /> : !error && (documents.length ? <ol className="space-y-3">
        {documents.map((doc,index) => <li key={doc.id} className={'rounded-xl border p-4 space-y-3 ' + (index === 0 ? 'border-primary/40 bg-primary/5' : 'border-border bg-surface')}>
          <div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary-dark shrink-0"><FileText size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 items-center mb-1"><span className="text-xs font-medium text-muted">Version {documents.length-index}</span>{index === 0 && <span className="rounded-full bg-status-success-bg px-2 py-0.5 text-xs text-status-success">Current</span>}</div><p className="break-all text-sm font-semibold text-ink">{doc.original_name || 'Document document'}</p></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted"><p className="break-words">Uploaded {dateLabel(doc.uploaded_at)}{doc.uploaded_by_name ? ' by ' + doc.uploaded_by_name : ''}</p><p className="sm:text-right">{sizeLabel(doc.file_size)}{doc.mime_type ? ' / ' + doc.mime_type : ''}</p></div>
          {doc.has_file ? <Button size="sm" variant={index===0?'primary':'secondary'} icon={ExternalLink} loading={viewingId===doc.id} disabled={viewingId!==null} onClick={() => view(doc)} aria-label={'View ' + (doc.original_name || 'document') + ' in a new tab'}>{viewingId===doc.id?'Opening document...':'View document'}</Button> : <p className="text-xs text-status-warning">File unavailable. Check the original record for an available copy.</p>}
        </li>)}
      </ol> : <div className="rounded-xl border border-dashed border-border p-8 text-center"><FileText className="mx-auto text-muted mb-3" size={28} /><p className="font-semibold text-sm text-ink">No document attached yet</p><p className="mt-1 text-xs text-muted">{emptyMessage}</p></div>)}
    </div>
  </Modal>
}
