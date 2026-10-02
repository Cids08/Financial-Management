<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\ChartOfAccount;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class BudgetGlService
{
    public function eligibleAccounts()
    {
        return ChartOfAccount::query()->where('is_active', true)
            ->where(function ($q) {
                $q->where('account_type', 'Expense')->orWhere(function ($q) {
                    $q->where('account_type', 'Asset')->where('account_category', 'Fixed Asset');
                });
            })->orderBy('account_code')->get(['id', 'account_code', 'account_name', 'account_type']);
    }

    public function validateAllocations(array $rows, string $total): array
    {
        $data = Validator::make(['allocations' => $rows], [
            'allocations' => ['required', 'array', 'min:1', 'max:500'],
            'allocations.*.account_id' => ['required', 'integer', 'distinct'],
            'allocations.*.allocated_amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:9999999999999.99'],
        ])->validate()['allocations'];
        $allowed = $this->eligibleAccounts()->pluck('id')->all();
        $sum = '0.00';
        foreach ($data as $i => $row) {
            if (! in_array((int) $row['account_id'], $allowed, true)) {
                throw ValidationException::withMessages(["allocations.$i.account_id" => 'Select an active expense or fixed-asset G/L account.']);
            }
            $sum = Money::add($sum, $row['allocated_amount']);
        }
        if (Money::comp($sum, $total) !== 0) {
            throw ValidationException::withMessages(['allocations' => 'Account allocations must equal the full approved budget amount.']);
        }
        return array_map(fn ($r) => ['account_id' => (int) $r['account_id'], 'allocated_amount' => Money::add($r['allocated_amount'], 0)], $data);
    }

    public function save(Budget $budget, array $rows, int $userId, bool $canApprove): Budget
    {
        return DB::transaction(function () use ($budget, $rows, $userId, $canApprove) {
            $budget = Budget::query()->lockForUpdate()->findOrFail($budget->id);
            if (! in_array($budget->status, ['Draft', 'Active'], true)) {
                throw ValidationException::withMessages(['allocations' => 'Closed or cancelled budgets cannot be remapped.']);
            }
            abort_if($budget->status === 'Active' && ! $canApprove, 403, 'Budget approval permission is required to change active allocations.');
            $rows = $this->validateAllocations($rows, $budget->allocated_amount);
            $old = $budget->accountAllocations()->get(['account_id', 'allocated_amount'])->toArray();
            $budget->accountAllocations()->delete();
            $budget->accountAllocations()->createMany($rows);
            $budget->touch();
            AuditLog::create([
                'user_id' => $userId, 'module' => 'Budgets', 'action' => 'update', 'record_id' => $budget->id,
                'activity_description' => 'Updated G/L allocations for '.$budget->budget_code,
                'old_values' => ['allocations' => $old], 'new_values' => ['allocations' => $rows],
            ]);
            return $budget->load('accountAllocations.account');
        });
    }

    public function assertReady(Budget $budget): void
    {
        $this->validateAllocations($budget->accountAllocations()->get(['account_id', 'allocated_amount'])->toArray(), $budget->allocated_amount);
    }

    private function lines(Budget $budget)
    {
        // Include both debits and credits, so posted reversals reduce actuals.
        // Cash/AP/payroll liability settlements cannot become expense actuals.
        return DB::table('journal_entry_lines as l')
            ->join('journal_entries as j', 'j.id', '=', 'l.journal_entry_id')
            ->join('chart_of_accounts as a', 'a.id', '=', 'l.account_id')
            ->where('l.budget_id', $budget->id)->where('l.department_id', $budget->department_id)
            ->where('j.status', 'Posted')->whereNull('j.deleted_at')
            ->whereBetween('j.transaction_date', [$budget->start_date->toDateString(), $budget->end_date->toDateString()])
            ->where(function ($q) {
                $q->where('a.account_type', 'Expense')->orWhere(function ($q) {
                    $q->where('a.account_type', 'Asset')->where('a.account_category', 'Fixed Asset');
                });
            });
    }

    public function summary(Budget $budget): array
    {
        $budget->loadMissing('accountAllocations.account');
        $actuals = $this->lines($budget)->groupBy('a.id', 'a.account_code', 'a.account_name')
            ->select('a.id', 'a.account_code', 'a.account_name')->selectRaw('SUM(l.debit - l.credit) as actual')->get()->keyBy('id');
        $accounts = [];
        $planned = '0.00';
        $actual = '0.00';
        foreach ($budget->accountAllocations as $allocation) {
            $amount = Money::add($actuals->get($allocation->account_id)?->actual ?? 0, 0);
            $accounts[] = $this->accountRow($allocation->account_id, $allocation->account?->account_code, $allocation->account?->account_name, $allocation->allocated_amount, $amount);
            $planned = Money::add($planned, $allocation->allocated_amount);
            $actual = Money::add($actual, $amount);
            $actuals->forget($allocation->account_id);
        }
        foreach ($actuals as $row) {
            $accounts[] = $this->accountRow($row->id, $row->account_code, $row->account_name, '0', $row->actual);
            $actual = Money::add($actual, $row->actual);
        }
        $unallocated = Money::sub($budget->allocated_amount, $planned);
        return [
            'basis' => 'posted_gl', 'actual' => (float) $actual,
            'difference' => (float) Money::sub($budget->allocated_amount, $actual),
            'unallocated' => (float) $unallocated,
            'allocation_complete' => count($budget->accountAllocations) > 0 && Money::comp($unallocated, 0) === 0,
            'operational_used' => (float) $budget->used_amount,
            'operational_gl_difference' => (float) Money::sub($budget->used_amount, $actual),
            'accounts' => $accounts,
        ];
    }

    private function accountRow($id, $code, $name, $planned, $actual): array
    {
        return ['account_id' => $id, 'account_code' => $code, 'account_name' => $name,
            'allocated_amount' => (float) $planned, 'actual' => (float) $actual,
            'difference' => (float) Money::sub($planned, $actual)];
    }

    public function ledger(Budget $budget, ?int $accountId): array
    {
        $rows = $this->lines($budget)->when($accountId, fn ($q) => $q->where('l.account_id', $accountId))
            ->orderBy('j.transaction_date')->orderBy('l.id')
            ->get(['l.id', 'j.id as journal_entry_id', 'j.transaction_no', 'j.transaction_date', 'j.description', 'a.account_code', 'a.account_name', 'l.debit', 'l.credit', 'l.reference_type', 'l.reference_id']);
        $total = '0.00';
        foreach ($rows as $row) {
            $row->amount = (float) Money::sub($row->debit, $row->credit);
            $total = Money::add($total, Money::sub($row->debit, $row->credit));
        }
        return ['rows' => $rows, 'total' => (float) $total, 'start_date' => $budget->start_date->toDateString(), 'end_date' => $budget->end_date->toDateString()];
    }
}
