<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\Budget;
use App\Models\ChartOfAccount;
use App\Models\Collection;
use App\Models\Disbursement;
use App\Models\JournalEntryLine;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Facades\DB;

class ReportService
{
    /**
     * @return array{start: Carbon, end: Carbon}
     */
    public function resolvePeriod(string $period): array
    {
        $now = now();

        return match ($period) {
            'Last Month'    => ['start' => $now->copy()->subMonthNoOverflow()->startOfMonth(), 'end' => $now->copy()->subMonthNoOverflow()->endOfMonth()],
            'This Quarter'  => ['start' => $now->copy()->firstOfQuarter(), 'end' => $now->copy()->lastOfQuarter()],
            'This Year'     => ['start' => $now->copy()->startOfYear(), 'end' => $now->copy()->endOfYear()],
            default         => ['start' => $now->copy()->startOfMonth(), 'end' => $now->copy()->endOfMonth()], // 'This Month'
        };
    }

    /**
     * Revenue and expenses, straight from posted General Ledger entries —
     * Revenue accounts are credited, Expense accounts are debited, per
     * standard double-entry convention. Only status='Posted' journal
     * entries count; drafts/voided entries never hit a financial statement.
     */
    public function incomeStatement(Carbon $start, Carbon $end): array
    {
        $rows = JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->join('chart_of_accounts', 'chart_of_accounts.id', '=', 'journal_entry_lines.account_id')
            ->where('journal_entries.status', 'Posted')
            ->whereBetween('journal_entries.transaction_date', [$start->toDateString(), $end->toDateString()])
            ->whereIn('chart_of_accounts.account_type', ['Revenue', 'Expense'])
            ->select(
                'chart_of_accounts.account_code',
                'chart_of_accounts.account_name',
                'chart_of_accounts.account_type',
                DB::raw('SUM(journal_entry_lines.credit) - SUM(journal_entry_lines.debit) as net_credit'),
                DB::raw('SUM(journal_entry_lines.debit) - SUM(journal_entry_lines.credit) as net_debit'),
            )
            ->groupBy('chart_of_accounts.id', 'chart_of_accounts.account_code', 'chart_of_accounts.account_name', 'chart_of_accounts.account_type')
            ->get();

        $revenue = $rows->where('account_type', 'Revenue')->map(fn ($r) => [
            'account' => "{$r->account_code} — {$r->account_name}",
            'amount'  => (float) $r->net_credit,
        ])->values();

        $expenses = $rows->where('account_type', 'Expense')->map(fn ($r) => [
            'account' => "{$r->account_code} — {$r->account_name}",
            'amount'  => (float) $r->net_debit,
        ])->values();

        return ['revenue' => $revenue, 'expenses' => $expenses];
    }

    /**
     * Inflow = Collections, outflow = Disbursements — both grouped by
     * cash_account_id, the only two tables in the ERD that actually link
     * to a specific cash account. Expenses are NOT included in outflow
     * here: the expenses table has no cash_account_id, so attributing an
     * expense to a specific account would be a guess, not a fact.
     */
    public function cashFlow(Carbon $start, Carbon $end): array
    {
        $inflows = Collection::query()
            ->join('cash_accounts', 'cash_accounts.id', '=', 'collections.cash_account_id')
            ->whereBetween('collections.collection_date', [$start->toDateString(), $end->toDateString()])
            ->whereNull('collections.deleted_at')
            ->select('cash_accounts.id', 'cash_accounts.account_code', 'cash_accounts.account_name', DB::raw('SUM(collections.amount_received) as total'))
            ->groupBy('cash_accounts.id', 'cash_accounts.account_code', 'cash_accounts.account_name')
            ->get()
            ->keyBy('id');

        $outflows = Disbursement::query()
            ->join('cash_accounts', 'cash_accounts.id', '=', 'disbursements.cash_account_id')
            ->whereBetween('disbursements.payment_date', [$start->toDateString(), $end->toDateString()])
            ->whereNull('disbursements.deleted_at')
            ->select('cash_accounts.id', 'cash_accounts.account_code', 'cash_accounts.account_name', DB::raw('SUM(disbursements.amount_paid) as total'))
            ->groupBy('cash_accounts.id', 'cash_accounts.account_code', 'cash_accounts.account_name')
            ->get()
            ->keyBy('id');

        $accountIds = $inflows->keys()->merge($outflows->keys())->unique();

        return $accountIds->map(function ($id) use ($inflows, $outflows) {
            $account = $inflows->get($id) ?? $outflows->get($id);

            return [
                'account' => "{$account->account_code} — {$account->account_name}",
                'inflow'  => (float) ($inflows->get($id)->total ?? 0),
                'outflow' => (float) ($outflows->get($id)->total ?? 0),
            ];
        })->values()->all();
    }

    /**
     * AR aging, bucketed by days past due_date, using remaining_balance —
     * only invoices that still have money owed (remaining_balance > 0)
     * count toward any bucket. Not date-filtered by the report period:
     * aging is inherently "as of today", not "during this period".
     */
    public function arAging(): array
    {
        return $this->agingReport(
            AccountsReceivable::query()->with('customer')->where('remaining_balance', '>', 0),
            fn ($row) => $row->customer?->customer_name ?? 'Unknown Customer',
        );
    }

    public function apAging(): array
    {
        return $this->agingReport(
            AccountsPayable::query()->with('supplier')->where('remaining_balance', '>', 0),
            fn ($row) => $row->supplier?->supplier_name ?? 'Unknown Supplier',
            partyKey: 'supplier',
        );
    }

    protected function agingReport($query, callable $nameResolver, string $partyKey = 'customer'): array
    {
        $today = now()->startOfDay();
        $grouped = [];

        foreach ($query->get() as $row) {
            $name = $nameResolver($row);
            $daysOverdue = $today->diffInDays(Carbon::parse($row->due_date), false) * -1; // positive = overdue

            $bucket = match (true) {
                $daysOverdue <= 0   => 'current',
                $daysOverdue <= 30  => 'd1_30',
                $daysOverdue <= 60  => 'd31_60',
                $daysOverdue <= 90  => 'd61_90',
                default             => 'over90',
            };

            $grouped[$name] ??= [$partyKey => $name, 'current' => 0, 'd1_30' => 0, 'd31_60' => 0, 'd61_90' => 0, 'over90' => 0];
            $grouped[$name][$bucket] += (float) $row->remaining_balance;
        }

        return array_values($grouped);
    }

    /**
     * Budget vs actual, grouped by department, for whichever fiscal year
     * the period's start date falls in. used_amount is already a running
     * total maintained on the budgets row itself (per the ERD) — not
     * re-derived from expenses here, so this reflects the same balance
     * Budgets.jsx itself shows.
     */
    public function budgetVsActual(int $fiscalYear): array
    {
        return Budget::query()
            ->join('departments', 'departments.id', '=', 'budgets.department_id')
            ->where('budgets.fiscal_year', $fiscalYear)
            ->whereNull('budgets.deleted_at')
            ->select(
                'departments.department_name',
                DB::raw('SUM(budgets.allocated_amount) as allocated'),
                DB::raw('SUM(budgets.used_amount) as actual'),
            )
            ->groupBy('departments.id', 'departments.department_name')
            ->get()
            ->map(fn ($r) => [
                'department' => $r->department_name,
                'allocated'  => (float) $r->allocated,
                'actual'     => (float) $r->actual,
            ])
            ->values()
            ->all();
    }
}