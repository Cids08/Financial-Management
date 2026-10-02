<?php

namespace App\Services;

use App\Models\Budget;
use App\Models\ChartOfAccount;
use Illuminate\Validation\ValidationException;

class ExpenseGlAccountService
{
    public function options(Budget $budget)
    {
        $allocations = $budget->accountAllocations()->pluck('account_id');
        $eligible = app(BudgetGlService::class)->eligibleAccounts();
        return ($allocations->isEmpty() ? $eligible : $eligible->whereIn('id', $allocations))->values();
    }

    public function selected(Budget $budget, ?int $accountId): ChartOfAccount
    {
        $account = $this->options($budget)->firstWhere('id', $accountId);
        if (! $accountId || ! $account) {
            throw ValidationException::withMessages([
                'gl_account_id' => 'Select an active expense or fixed-asset G/L account permitted by this budget. Its allocations may have changed.',
            ]);
        }
        return $account;
    }
}
