import { useEffect, useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import { apiFetch } from '../utils/api'
export default function AssignCollectorModal({ record, collectors, onClose, onSaved }) {
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setSelected(record?.collector_id || ''); setError('') }, [record])
  const save = async () => {
    if (!record || !selected || busy) return
    setBusy(true); setError('')
    try {
      const response = await apiFetch('/api/accounts-receivable/' + record.ar_id + '/collector', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({collector_id:Number(selected)})})
      const body = await response.json()
      if (!response.ok || !body.success) throw new Error(body.errors?.collector_id?.[0] || body.message || 'Could not assign collector.')
      onSaved(); onClose()
    } catch(e) { setError(e.message) } finally { setBusy(false) }
  }
  return <Modal open={!!record} onClose={() => { if(!busy) onClose() }} title="Assign Collector" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!selected || collectors.loading || !!collectors.error} onClick={save}>Assign Collector</Button></>}>
    <div className="space-y-4"><p className="font-semibold text-ink">{record?.invoice_number}</p><p className="text-sm text-muted">Assign collection responsibility. Invoice amounts and accounting entries stay unchanged.</p>
    {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
    <label htmlFor="ar-assigned-collector" className="block text-sm text-ink">Collector</label>
    <select id="ar-assigned-collector" className="w-full rounded-lg border border-border bg-bg p-3 text-ink" disabled={busy || collectors.loading} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a collector</option>{collectors.filter(c=>!c.status || c.status==='Active').map(c=><option key={c.collector_id} value={c.collector_id}>{c.first_name} {c.last_name}</option>)}</select>
    {collectors.loading && <p role="status" className="text-sm text-muted">Loading collectors...</p>}{collectors.error && <Button variant="secondary" onClick={collectors.reload}>Retry loading collectors</Button>}
    </div>
  </Modal>
}
