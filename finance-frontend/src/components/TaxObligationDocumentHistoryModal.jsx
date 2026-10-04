import DocumentHistoryModal from './DocumentHistoryModal'
export default function TaxObligationDocumentHistoryModal({ obligation, ...props }) {
  return <DocumentHistoryModal {...props} record={{id: obligation?.tax_id, label: 'Tax obligation #' + obligation?.tax_id, description: [obligation?.tax_type, obligation?.tax_period].filter(Boolean).join(' - ')}}  />
}
