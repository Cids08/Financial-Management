import DocumentHistoryModal from './DocumentHistoryModal'
export default function ExpenseReceiptHistoryModal({ expense, ...props }) {
  return <DocumentHistoryModal {...props} record={{id: expense?.id, label: 'Expense #' + expense?.id, description: expense?.description}}  />
}
