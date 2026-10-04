import DocumentUploadModal from './DocumentUploadModal'
export default function TaxObligationDocumentUploadModal({ obligation, ...props }) {
  return <DocumentUploadModal {...props} record={{id: obligation?.tax_id, label: 'Tax obligation #' + obligation?.tax_id, description: [obligation?.tax_type, obligation?.tax_period].filter(Boolean).join(' - ')}} extensions={['pdf','jpg','jpeg','png']} />
}
