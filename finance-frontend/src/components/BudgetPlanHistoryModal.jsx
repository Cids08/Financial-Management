import DocumentHistoryModal from './DocumentHistoryModal'
export default function BudgetPlanHistoryModal({ budget, ...props }) {
  return <DocumentHistoryModal {...props} record={{id: budget?.budget_id, label: budget?.budget_code || 'Budget #' + budget?.budget_id, description: budget?.budget_name}}  />
}
