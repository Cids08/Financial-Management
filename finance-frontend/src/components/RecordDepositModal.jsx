import { useEffect, useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import { apiFetch } from '../utils/api'
export default function RecordDepositModal({ record, onClose, onSaved, onDocuments }) {
  const [date,setDate] = useState('')
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  useEffect(()=>{setDate(record?.deposit_date || today);setError('')},[record])
  const save = async()=>{
    if(busy || !date) return
    setBusy(true);setError('')
    try {
      const res=await apiFetch('/api/collections/'+record.id,{method:'PUT',body:JSON.stringify({deposit_date:date})})
      const body=await res.json()
      if(!res.ok || !body.success) throw Error(Object.values(body.errors || {})[0]?.[0] || body.message || 'Could not record deposit.')
      onSaved();onClose()
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <Modal open={!!record} onClose={()=>{if(!busy)onClose()}} title="Record Bank Deposit" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!date} onClick={save}>Record Deposit</Button></>}>
    <div className="space-y-4"><p className="font-semibold text-ink">Receipt {record?.receipt_number}</p><p className="text-sm text-muted">Deposit account: {record?.cash_account_name || 'Account selected on the collection'}</p><p className="text-xs text-muted">Keep the original booklet receipt number. Upload the bank deposit slip in Documents. Recording a deposit does not confirm payment or post to the ledger.</p><label className="block text-sm text-ink" htmlFor="collection-deposit-date">Actual deposit date</label><input id="collection-deposit-date" type="date" min={record?.collection_date} max={today} value={date} onChange={e=>setDate(e.target.value)} disabled={busy} className="w-full rounded-lg border border-border bg-bg p-3 text-ink"/>{record?.payment_method==='Check' && <p className="text-xs text-status-warning">Depositing a check does not mean it has cleared. Admin must verify bank clearance before confirming.</p>}<Button variant="secondary" disabled={busy} onClick={()=>onDocuments(record)}>View / attach deposit evidence</Button>{error && <p role="alert" className="text-sm text-status-danger">{error}</p>}</div>
  </Modal>
}
