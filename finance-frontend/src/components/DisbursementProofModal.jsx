import { useCallback, useEffect, useState } from 'react'
import DocumentWorkspaceModal from './DocumentWorkspaceModal'
import DocumentHistoryModal from './DocumentHistoryModal'
import Button from './Button'
import { apiFetch } from '../utils/api'

export default function DisbursementProofModal({ disbursement, onUpload, canManage = true, ...props }) {
  const [source, setSource] = useState('payment')
  useEffect(() => { setSource('payment') }, [props.open, disbursement?.disbursement_id])
  const fetchApDocuments = useCallback(async id => {
    const response = await apiFetch('/api/accounts-payable/' + id + '/document')
    const body = await response.json()
    if (!response.ok || !body.success) throw new Error(response.status === 403 ? 'You need Accounts Payable viewing permission to access the linked invoice documents.' : body.message || 'Could not load linked AP documents.')
    return body
  }, [])
  const viewApDocument = useCallback(async (id, documentId, target) => {
    const response = await apiFetch('/api/accounts-payable/' + id + '/document/' + documentId + '/view')
    const body = await response.json()
    if (!response.ok || !body.success || !body.data?.url) throw new Error(body.message || 'Could not open the linked AP document.')
    target.location.href = body.data.url
    return { success: true, viewedInline: true }
  }, [])
  const navigation = busy => <div className="space-y-3">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Document source">
      <Button size="sm" variant={source === 'payment' ? 'primary' : 'secondary'} aria-pressed={source === 'payment'} disabled={busy} onClick={() => setSource('payment')}>Payment documents</Button>
      {disbursement?.ap_id && <Button size="sm" variant={source === 'ap' ? 'primary' : 'secondary'} aria-pressed={source === 'ap'} disabled={busy} onClick={() => setSource('ap')}>Linked AP documents</Button>}
    </div>
    <p className="text-xs text-muted">{source === 'ap' ? 'Original supplier documents linked from Accounts Payable. No duplicate upload is needed. These documents are not proof of payment.' : 'Attach new payment evidence, such as a bank confirmation or acknowledged receipt. Linked supplier invoices do not satisfy the payment-proof requirement.'}</p>
  </div>
  if (source === 'ap' && disbursement?.ap_id) return <DocumentHistoryModal open={props.open} onClose={props.onClose} title="Disbursement documents" record={{id:disbursement.ap_id,label:disbursement.invoice_number || 'Linked AP bill',description:disbursement.payee}} toolbar={navigation} fetchHistory={fetchApDocuments} onView={viewApDocument} emptyMessage="No supporting document is attached to the linked AP bill. Manage supplier documents in Accounts Payable." />
  return <DocumentWorkspaceModal {...props} title="Disbursement documents" contextToolbar={navigation} record={{id:disbursement?.disbursement_id,label:disbursement?.voucher_number,description:disbursement?.payee}} canUpload={canManage && !disbursement?.is_archived && !['Released', 'Rejected', 'Cancelled'].includes(disbursement?.status)} onUpload={async file => { const result = await onUpload(disbursement.disbursement_id,file); return result?.success === false ? result : {success:true} }} />
}
