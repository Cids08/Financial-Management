import { useCallback } from 'react'
import DocumentWorkspaceModal from './DocumentWorkspaceModal'
import { apiFetch } from '../utils/api'
export default function CollectionProofHistoryModal({ collection, canManage = false, ...props }) {
  const fetchHistory = useCallback(async id => { const res=await apiFetch('/api/collections/'+id+'/proof'); const body=await res.json(); if(!res.ok) throw Error(body.message || 'Could not load documents.'); return body },[])
  const onUpload = async file => { const form=new FormData();form.append('proof',file);const res=await apiFetch('/api/collections/'+collection.id+'/proof',{method:'POST',body:form});const body=await res.json();if(!res.ok || !body.success)throw Error(Object.values(body.errors || {})[0]?.[0] || body.message || 'Upload failed.');return body }
  const onView = async (id,docId,target) => { const res=await apiFetch('/api/collections/'+id+'/proof/'+docId+'/view');const body=await res.json();if(!res.ok || !body.success || !body.data?.url)throw Error(body.message || 'Could not open document.');target.location.href=body.data.url;return {success:true,viewedInline:true} }
  return <DocumentWorkspaceModal {...props} title="Collection documents" record={{id:collection?.id,label:collection?.receipt_number,description:'Proof of receipt'}} fetchHistory={fetchHistory} onUpload={onUpload} onView={onView} canUpload={canManage && ['Pending','Confirmed'].includes(collection?.status) && !collection?.deleted_at} extensions={['pdf','jpg','jpeg','png']} />
}
