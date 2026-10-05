import { useEffect, useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import ResponsiveTable from './ResponsiveTable'
import Pagination from './Pagination'
import ModalLoading from './ModalLoading'
import DocumentWorkspaceModal from './DocumentWorkspaceModal'
import { apiFetch } from '../utils/api'
import { formatCurrency } from '../utils/formatters'
import { usePrivacy } from '../context/PrivacyContext'

const field='block w-full min-w-0 min-h-10 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink'
async function request(path, options) {
  const response=await apiFetch(path,options); const body=await response.json()
  if(!response.ok || !body.success) throw Error(Object.values(body.errors || {})[0]?.[0] || body.message || 'Could not complete the request.')
  return body
}
const history=id=>request('/api/deposit-batches/'+id+'/documents')
const viewDocument=async(id,doc,target)=>{const body=await request('/api/deposit-batches/'+id+'/documents/'+doc+'/view');if(!body.data?.url)throw Error('Document unavailable.');target.location.href=body.data.url;return {success:true,viewedInline:true}}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
export default function DepositBatchesModal({ open, onClose, onChanged, cashAccounts, canManage, canConfirm, userId }) {
  usePrivacy()
  const [mode,setMode]=useState('list'), [rows,setRows]=useState([]), [page,setPage]=useState(1), [meta,setMeta]=useState({last_page:1,total:0})
  const [status,setStatus]=useState('Pending'), [loading,setLoading]=useState(false), [error,setError]=useState(''), [busy,setBusy]=useState(false), [refresh,setRefresh]=useState(0)
  const [selected,setSelected]=useState({}), [account,setAccount]=useState(''), [date,setDate]=useState(today), [reference,setReference]=useState(''), [amount,setAmount]=useState(''), [search,setSearch]=useState('')
  const [batch,setBatch]=useState(null), [documents,setDocuments]=useState(null), [bankVerified,setBankVerified]=useState(false), [checksCleared,setChecksCleared]=useState(false), [reason,setReason]=useState('')
  useEffect(()=>{if(open){setMode('list');setPage(1);setError('');setBatch(null);setDocuments(null)}},[open])
  useEffect(()=>{
    if(!open || mode==='review')return
    let active=true;setLoading(true);setError('')
    const params=new URLSearchParams({page:String(page),...(mode==='create'?{cash_account_id:account,search}:{status})})
    request('/api/deposit-batches'+(mode==='create'?'/candidates':'')+'?'+params)
      .then(body=>{if(active){setRows(body.data);setMeta(body.meta)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[open,mode,page,status,account,search,refresh])
  const review=b=>{setBatch(b);setMode('review');setBankVerified(false);setChecksCleared(false);setReason('');setError('')}
  const start=()=>{setMode('create');setSelected({});setAccount('');setDate(today());setReference('');setAmount('');setSearch('');setPage(1);setError('')}
  const chosen=Object.values(selected)
  const totalCents=chosen.reduce((n,r)=>n+Math.round(Number(r.amount_received)*100),0)
  const difference=mode==='create'?Math.round(Number(amount||0)*100)-totalCents:Math.round(Number(batch?.deposit_amount||0)*100)-Math.round(Number(batch?.receipt_total||0)*100)
  const snapshots=batch?.receipt_snapshot || []
  const hasChecks=snapshots.some(r=>r.payment_method?.toLowerCase()==='check')
  const ownBatch=Number(batch?.prepared_by)===Number(userId) || snapshots.some(r=>Number(r.created_by)===Number(userId))
  const run=async(action)=>{if(busy)return;setBusy(true);setError('');try{await action();onChanged?.()}catch(e){setError(e.message)}finally{setBusy(false)}}
  const prepare=()=>run(async()=>{const body=await request('/api/deposit-batches',{method:'POST',body:JSON.stringify({cash_account_id:Number(account),deposit_date:date,bank_reference:reference,deposit_amount:amount,collection_ids:chosen.map(r=>r.id)})});review(body.data)})
  const confirm=()=>run(async()=>{const body=await request('/api/deposit-batches/'+batch.id+'/confirm',{method:'PATCH',body:JSON.stringify({bank_verified:bankVerified,checks_cleared:checksCleared})});review(body.data)})
  const cancel=()=>run(async()=>{const body=await request('/api/deposit-batches/'+batch.id+'/cancel',{method:'PATCH',body:JSON.stringify({reason})});review(body.data)})
  const close=()=>{if(!busy)onClose()}
  return <>
    <Modal open={open && !documents} onClose={close} title={mode==='create'?'Prepare Deposit Batch':mode==='review'?'Review Deposit Batch':'Deposit Batches'} size="2xl" footer={<>
      <Button variant="secondary" disabled={busy} onClick={mode==='list'?close:()=>{setMode('list');setPage(1);setError('')}}>{mode==='list'?'Close':'Back to batches'}</Button>
      {mode==='list' && canManage && <Button onClick={start}>Prepare batch</Button>}
      {mode==='create' && <Button loading={busy} disabled={!account || !date || !reference.trim() || Number(amount)<=0 || !chosen.length || chosen.length>100} onClick={prepare}>Submit batch for review</Button>}
      {mode==='review' && canConfirm && batch?.status==='Pending' && <Button loading={busy} disabled={ownBatch || difference!==0 || !batch.has_proof || !bankVerified || (hasChecks&&!checksCleared)} onClick={confirm}>Confirm entire batch</Button>}
    </>}>
      <div className="space-y-5 min-w-0">
        <p className="text-xs text-muted">Prepare one batch for one bank deposit. Admin verifies the bank evidence once. Unverified receipts post to Undeposited Funds on their collection dates; all deposits post to the bank on the deposit date. OCR is not bank verification.</p>
        {error && <div role="alert" className="rounded-lg bg-status-danger-bg p-3 text-sm text-status-danger break-words">{error}{mode!=='review' && <Button size="sm" variant="secondary" onClick={()=>setRefresh(n=>n+1)}>Retry</Button>}</div>}
        {mode==='list' && <label className="batch-field flex min-w-0 flex-col gap-2 text-xs font-medium text-muted w-full sm:max-w-sm"><span>Batch status</span><select className={field} value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option>Pending</option><option>Confirmed</option><option>Cancelled</option><option value="all">All batches</option></select></label>}
        {mode==='create' && <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
            <label className="batch-field flex min-w-0 flex-col gap-2 text-xs font-medium text-muted"><span>Deposit account</span><select className={field} value={account} onChange={e=>{setAccount(e.target.value);setSelected({});setPage(1)}} disabled={busy}><option value="">Choose account</option>{cashAccounts.map(a=><option key={a._key || a.id} value={a._key || a.id}>{a.account_name}</option>)}</select></label>
            <label className="batch-field flex min-w-0 flex-col gap-2 text-xs font-medium text-muted"><span>Actual deposit date</span><input className={field} type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label>
            <label className="batch-field flex min-w-0 flex-col gap-2 text-xs font-medium text-muted"><span>Bank deposit reference</span><input className={field} maxLength={150} value={reference} onChange={e=>setReference(e.target.value)} disabled={busy}/></label>
            <label className="batch-field flex min-w-0 flex-col gap-2 text-xs font-medium text-muted"><span>Amount on deposit slip</span><input className={field} type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>
          </div>
          <p className="rounded-lg border border-border p-3 text-sm text-ink">{chosen.length} receipts selected | Total {formatCurrency(totalCents/100)} | Difference {formatCurrency(difference/100)}</p>
          {amount && difference!==0 && <p className="text-xs text-status-warning">The amounts do not match. You can submit for review, but confirmation will be blocked until the batch is cancelled and corrected.</p>}
          <label className="batch-field flex min-w-0 flex-col gap-2 text-xs font-medium text-muted"><span>Find receipt</span><input className={field} placeholder="Booklet receipt number" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label>
        </>}
        {mode!=='review' && (loading?<ModalLoading label="Loading deposit batches"/>:<>
          <ResponsiveTable minTableWidth={640} className="w-full text-sm"><thead><tr>{(mode==='create'?['Select','Receipt / Invoice','Collected','Method','Amount']:['Batch / Reference','Deposit account','Date','Total','Status','Action']).map(h=><th key={h} className="p-2 text-left text-xs text-muted">{h}</th>)}</tr></thead><tbody>{rows.map(r=>mode==='create'?<tr key={r.id} className="border-t border-border"><td className="p-2"><input type="checkbox" aria-label={'Select receipt '+r.receipt_number} checked={!!selected[r.id]} disabled={busy || !account || Number(account)!==Number(r.cash_account_id)} onChange={e=>setSelected(current=>{const next={...current};if(e.target.checked)next[r.id]=r;else delete next[r.id];return next})}/></td><td className="p-2 break-words">{r.receipt_number}<p className="text-xs text-muted">{r.invoice_number}</p></td><td className="p-2">{r.collection_date}</td><td className="p-2">{r.payment_method}</td><td className="p-2 tabular-nums">{formatCurrency(r.amount_received)}</td></tr>:<tr key={r.id} className="border-t border-border"><td className="p-2 break-all">{r.batch_number}<p className="text-xs text-muted">{r.bank_reference}</p></td><td className="p-2 break-words">{r.cash_account_name}</td><td className="p-2">{r.deposit_date}</td><td className="p-2 tabular-nums">{formatCurrency(r.deposit_amount)}</td><td className="p-2">{r.status}</td><td className="p-2"><Button size="sm" variant="secondary" onClick={()=>review(r)}>Review</Button></td></tr>)}</tbody></ResponsiveTable>
          {!rows.length && !error && <p className="p-4 text-center text-sm text-muted">{mode==='create'?'No eligible receipts match this account or search.':'No batches found.'}</p>}
          <Pagination page={page} totalPages={meta.last_page} total={meta.total} label={mode==='create'?'eligible receipts':'batches'} onPageChange={setPage}/>
        </>)}
        {mode==='review' && batch && <>
          <div className="rounded-xl border border-border p-3 space-y-1 text-sm text-ink"><p className="font-semibold break-all">{batch.batch_number} | {batch.status}</p><p>{batch.cash_account_name} | {batch.deposit_date}</p><p className="break-all">Reference: {batch.bank_reference}</p><p>Prepared by: {batch.prepared_by_name || batch.prepared_by}</p><p>Receipt total: {formatCurrency(batch.receipt_total)} | Deposit: {formatCurrency(batch.deposit_amount)}</p><p className={difference?'text-status-danger':'text-status-success'}>{difference?'Amount mismatch: '+formatCurrency(difference/100):'Receipt total matches the entered deposit amount'}</p></div>
          <Button variant="secondary" onClick={()=>setDocuments(batch)} disabled={busy}>{batch.has_proof?'View bank evidence':'Attach bank evidence'}</Button>
          <ResponsiveTable minTableWidth={540} className="w-full text-sm"><thead><tr>{['Receipt','Method','Amount'].map(h=><th key={h} className="p-2 text-left text-xs text-muted">{h}</th>)}</tr></thead><tbody>{snapshots.map(r=><tr key={r.id} className="border-t border-border"><td className="p-2 break-all">{r.receipt_number}</td><td className="p-2">{r.payment_method}</td><td className="p-2 tabular-nums">{formatCurrency(r.amount)}</td></tr>)}</tbody></ResponsiveTable>
          {batch.status==='Pending' && <>
            {ownBatch && canConfirm && <p className="text-xs text-status-warning">Another administrator must confirm this batch because you prepared it or recorded one of its receipts.</p>}
            {canConfirm && <><label className="flex items-start gap-2 text-sm text-ink"><input className="mt-0.5 h-4 w-4 shrink-0 accent-primary" type="checkbox" checked={bankVerified} onChange={e=>setBankVerified(e.target.checked)} disabled={busy || ownBatch}/>I checked the bank evidence, account, reference, date and deposited amount.</label>{hasChecks && <label className="flex items-start gap-2 text-sm text-ink"><input className="mt-0.5 h-4 w-4 shrink-0 accent-primary" type="checkbox" checked={checksCleared} onChange={e=>setChecksCleared(e.target.checked)} disabled={busy || ownBatch}/>The bank has cleared every check in this batch.</label>}</>}
            {(canConfirm || Number(batch.prepared_by)===Number(userId)) && <details className="rounded-lg border border-border p-3"><summary className="text-sm text-muted cursor-pointer">Cancel batch and release receipts for correction</summary><label className="batch-field flex min-w-0 flex-col gap-2 text-xs font-medium text-muted my-4"><span>Reason</span><textarea className={field} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><Button variant="secondary" disabled={busy || reason.trim().length<5} onClick={cancel}>Cancel batch</Button></details>}
          </>}
          {batch.cancellation_reason && <p className="text-sm text-muted break-words">Cancellation reason: {batch.cancellation_reason}</p>}
        </>}
      </div>
    </Modal>
    <DocumentWorkspaceModal open={!!documents} onClose={()=>setDocuments(null)} title="Bank Deposit Evidence" extensions={['pdf','jpg','jpeg','png','webp']} record={{id:documents?.id,label:documents?.batch_number,description:'Shared evidence for all receipts in this deposit'}} fetchHistory={history} onView={viewDocument} canUpload={canManage && documents?.status==='Pending'} onUpload={async file=>{const form=new FormData();form.append('document',file);return request('/api/deposit-batches/'+documents.id+'/documents',{method:'POST',body:form})}} onUploaded={()=>{setBatch(b=>b?{...b,has_proof:true}:b);setDocuments(b=>b?{...b,has_proof:true}:b);setRefresh(n=>n+1)}}/>
  </>
}
