import DocumentWorkspaceModal from './DocumentWorkspaceModal'
export default function AccountsReceivableDocumentModal({ invoice, ...props }) { return <DocumentWorkspaceModal {...props} record={{id:invoice?.ar_id,label:invoice?.invoice_number,description:invoice?.description}} extensions={['pdf','jpg','jpeg','png','webp']} /> }
