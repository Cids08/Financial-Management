import DocumentWorkspaceModal from './DocumentWorkspaceModal'
export default function AccountsPayableDocumentModal({ bill, ...props }) { return <DocumentWorkspaceModal {...props} record={{id:bill?.ap_id,label:bill?.invoice_number,description:bill?.description}} extensions={['pdf','jpg','jpeg','png']} /> }
