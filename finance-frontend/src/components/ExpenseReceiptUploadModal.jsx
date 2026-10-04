import DocumentUploadModal from './DocumentUploadModal'
export default function ExpenseReceiptUploadModal({ expense, ...props }) {
  return <DocumentUploadModal {...props} record={{id: expense?.id, label: 'Expense #' + expense?.id, description: expense?.description}}  />
}
