<?php
namespace App\Services;
use App\Models\Budget;
use App\Models\ChartOfAccount;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;
class ApPostingGuard
{
    public function validate(?int $accountId, ?int $budgetId, string $date): ?Budget
    {
        $account = ChartOfAccount::where('is_active', true)->find($accountId);
        if (! $account || ! in_array($account->account_type, ['Expense', 'Asset'], true)) {
            throw ValidationException::withMessages(['account_id' => 'Select an active expense or asset G/L account. No account is selected automatically.']);
        }
        if (! $budgetId) return null;
        $budget = Budget::lockForUpdate()->find($budgetId);
        if (! $budget || $budget->status !== Budget::STATUS_ACTIVE) throw ValidationException::withMessages(['budget_id' => 'Select an active budget.']);
        $postingDate = Carbon::parse($date)->startOfDay();
        if ($postingDate->lt($budget->start_date) || $postingDate->gt($budget->end_date)) throw ValidationException::withMessages(['invoice_date' => 'Invoice date must fall within the selected budget period.']);
        try { app(ExpenseGlAccountService::class)->selected($budget, $accountId); }
        catch (ValidationException $e) { throw ValidationException::withMessages(['account_id' => 'Select an expense or fixed-asset account permitted by the budget allocations.']); }
        return $budget;
    }
}
