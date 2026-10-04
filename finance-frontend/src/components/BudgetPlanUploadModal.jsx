import DocumentUploadModal from './DocumentUploadModal'
export default function BudgetPlanUploadModal({ budget, ...props }) {
  return <DocumentUploadModal {...props} record={{id: budget?.budget_id, label: budget?.budget_code || 'Budget #' + budget?.budget_id, description: budget?.budget_name}} extensions={['pdf','doc','docx','xls','xlsx']} />
}
