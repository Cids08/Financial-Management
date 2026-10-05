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
     * @return array{start: Carbon, end: Carbon, label: string}
     */
    public function resolvePeriod(?string $period = null, ?string $startDate = null, ?string $endDate = null): array
    {
        if ($startDate && $endDate) {
            $start = Carbon::parse($startDate)->startOfDay();
            $end = Carbon::parse($endDate)->endOfDay();
            return [
                'start' => $start,
                'end'   => $end,
                'label' => $start->format('M d, Y') . ' – ' . $end->format('M d, Y'),
            ];
        }

        $now = now();
        $period = $period ?: 'This Month';

        // Check if numeric year e.g. "2025" or "2026"
        if (is_numeric($period) && (int) $period >= 2000 && (int) $period <= 2100) {
            $year = (int) $period;
            $start = Carbon::create($year, 1, 1, 0, 0, 0)->startOfYear();
            $end = Carbon::create($year, 12, 31, 23, 59, 59)->endOfYear();
            return [
                'start' => $start,
                'end'   => $end,
                'label' => "FY {$year}",
            ];
        }

        return match ($period) {
            'Last Month'    => [
                'start' => $now->copy()->subMonthNoOverflow()->startOfMonth(),
                'end'   => $now->copy()->subMonthNoOverflow()->endOfMonth(),
                'label' => $now->copy()->subMonthNoOverflow()->format('F Y'),
            ],
            'This Quarter'  => [
                'start' => $now->copy()->firstOfQuarter(),
                'end'   => $now->copy()->lastOfQuarter(),
                'label' => 'Q' . $now->quarter . ' ' . $now->year,
            ],
            'This Year'     => [
                'start' => $now->copy()->startOfYear(),
                'end'   => $now->copy()->endOfYear(),
                'label' => "FY {$now->year}",
            ],
            default         => [
                'start' => $now->copy()->startOfMonth(),
                'end'   => $now->copy()->endOfMonth(),
                'label' => $now->format('F Y'),
            ], // 'This Month'
        };
    }

    /**
     * Resolves the comparative prior period based on mode ('prior_period' or 'prior_year')
     * @return array{start: Carbon, end: Carbon, label: string}
     */
    public function resolveComparisonPeriod(Carbon $start, Carbon $end, string $mode = 'prior_period'): array
    {
        if ($mode === 'prior_year') {
            $cStart = $start->copy()->subYear();
            $cEnd = $end->copy()->subYear();
            return [
                'start' => $cStart,
                'end'   => $cEnd,
                'label' => $cStart->format('M d, Y') . ' – ' . $cEnd->format('M d, Y'),
            ];
        }

        // Prior period mode: shift backward by the matching period span
        if ($start->isSameDay($start->copy()->startOfMonth()) && $end->isSameDay($end->copy()->endOfMonth())) {
            $cStart = $start->copy()->subMonthNoOverflow()->startOfMonth();
            $cEnd = $start->copy()->subMonthNoOverflow()->endOfMonth();
        } elseif ($start->isSameDay($start->copy()->startOfYear()) && $end->isSameDay($end->copy()->endOfYear())) {
            $cStart = $start->copy()->subYear()->startOfYear();
            $cEnd = $start->copy()->subYear()->endOfYear();
        } else {
            $diffDays = $start->diffInDays($end) + 1;
            $cEnd = $start->copy()->subDay()->endOfDay();
            $cStart = $cEnd->copy()->subDays($diffDays - 1)->startOfDay();
        }

        return [
            'start' => $cStart,
            'end'   => $cEnd,
            'label' => $cStart->format('M d, Y') . ' – ' . $cEnd->format('M d, Y'),
        ];
    }

    protected function queryIncomeData(Carbon $start, Carbon $end)
    {
        return JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->join('chart_of_accounts', 'chart_of_accounts.id', '=', 'journal_entry_lines.account_id')
            ->where('journal_entries.status', 'Posted')
            ->whereNull('journal_entries.deleted_at')
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
    }

    /**
     * Revenue and expenses, straight from posted General Ledger entries.
     */
    public function incomeStatement(Carbon $start, Carbon $end, ?Carbon $compareStart = null, ?Carbon $compareEnd = null, ?string $currentLabel = null, ?string $priorLabel = null): array
    {
        $currentRows = $this->queryIncomeData($start, $end);

        if (!$compareStart || !$compareEnd) {
            $revenue = $currentRows->where('account_type', 'Revenue')->map(fn ($r) => [
                'account' => "{$r->account_code} — {$r->account_name}",
                'amount'  => (float) $r->net_credit,
            ])->values();

            $expenses = $currentRows->where('account_type', 'Expense')->map(fn ($r) => [
                'account' => "{$r->account_code} — {$r->account_name}",
                'amount'  => (float) $r->net_debit,
            ])->values();

            return ['revenue' => $revenue, 'expenses' => $expenses];
        }

        // Comparison mode
        $priorRows = $this->queryIncomeData($compareStart, $compareEnd);

        $buildGroup = function (string $type) use ($currentRows, $priorRows) {
            $field = $type === 'Revenue' ? 'net_credit' : 'net_debit';
            $currMap = $currentRows->where('account_type', $type)->keyBy(fn ($r) => "{$r->account_code} — {$r->account_name}");
            $priorMap = $priorRows->where('account_type', $type)->keyBy(fn ($r) => "{$r->account_code} — {$r->account_name}");

            $allAccounts = $currMap->keys()->merge($priorMap->keys())->unique()->sort()->values();

            return $allAccounts->map(function ($acc) use ($currMap, $priorMap, $field) {
                $currVal = (float) ($currMap->get($acc)?->{$field} ?? 0);
                $priorVal = (float) ($priorMap->get($acc)?->{$field} ?? 0);
                $variance = $currVal - $priorVal;
                $pct = $priorVal != 0 ? round(($variance / abs($priorVal)) * 100, 1) : ($currVal > 0 ? 100.0 : 0.0);

                return [
                    'account'      => $acc,
                    'amount'       => $currVal,
                    'prior_amount' => $priorVal,
                    'variance'     => $variance,
                    'pct_change'   => $pct,
                ];
            })->values();
        };

        $revenue = $buildGroup('Revenue');
        $expenses = $buildGroup('Expense');

        $currRevTotal = $revenue->sum('amount');
        $priorRevTotal = $revenue->sum('prior_amount');
        $currExpTotal = $expenses->sum('amount');
        $priorExpTotal = $expenses->sum('prior_amount');
        $currNet = $currRevTotal - $currExpTotal;
        $priorNet = $priorRevTotal - $priorExpTotal;
        $netVariance = $currNet - $priorNet;

        return [
            'revenue' => $revenue,
            'expenses' => $expenses,
            'comparison' => [
                'enabled' => true,
                'current_label' => $currentLabel ?: ($start->format('M d, Y') . ' – ' . $end->format('M d, Y')),
                'prior_label'   => $priorLabel ?: ($compareStart->format('M d, Y') . ' – ' . $compareEnd->format('M d, Y')),
                'current_totals' => [
                    'revenue' => $currRevTotal,
                    'expenses' => $currExpTotal,
                    'net_income' => $currNet,
                ],
                'prior_totals' => [
                    'revenue' => $priorRevTotal,
                    'expenses' => $priorExpTotal,
                    'net_income' => $priorNet,
                ],
                'variance' => [
                    'revenue' => $currRevTotal - $priorRevTotal,
                    'expenses' => $currExpTotal - $priorExpTotal,
                    'net_income' => $netVariance,
                    'net_income_pct' => $priorNet != 0 ? round(($netVariance / abs($priorNet)) * 100, 1) : null,
                ],
            ],
        ];
    }

    protected function queryCashFlowData(Carbon $start, Carbon $end): array
    {
        // Archived settled records still represent real cash movement.
        $period = [$start->toDateString(), $end->toDateString()];
        $inflows = DB::table('collections')->where('status', 'Confirmed')
            ->whereBetween(DB::raw('CASE WHEN deposit_journal_entry_id IS NOT NULL THEN deposit_date ELSE collection_date END'), $period)
            ->selectRaw('cash_account_id, SUM(amount_received) as total')->groupBy('cash_account_id')->pluck('total', 'cash_account_id');
        $payments = DB::table('disbursements')->where('status', 'Released')
            ->whereBetween(DB::raw('COALESCE(released_date, payment_date)'), $period)
            ->selectRaw('cash_account_id, SUM(COALESCE(net_amount, amount_paid - COALESCE(ewt_amount, 0))) as total')
            ->groupBy('cash_account_id')->pluck('total', 'cash_account_id');
        $expenses = DB::table('expenses')->where('status', 'Approved')
            ->whereBetween('expense_date', $period)
            ->selectRaw('cash_account_id, SUM(expense_amount) as total')->groupBy('cash_account_id')->pluck('total', 'cash_account_id');
        $ids = $inflows->keys()->merge($payments->keys())->merge($expenses->keys())->unique();
        $accounts = DB::table('cash_accounts')->whereIn('id', $ids->filter(fn ($id) => $id !== '' && $id !== null))->get()->keyBy('id');
        return $ids->map(function ($id) use ($accounts, $inflows, $payments, $expenses) {
            $account = $accounts->get($id);
            return [
                'account' => $account ? "{$account->account_code} - {$account->account_name}" : 'Unassigned cash account',
                'inflow' => (float) $inflows->get($id, 0),
                'outflow' => (float) \App\Support\Money::add($payments->get($id, 0), $expenses->get($id, 0)),
            ];
        })->values()->all();
    }

    /**
     * Inflow = Collections, outflow = Disbursements
     */
    public function cashFlow(Carbon $start, Carbon $end, ?Carbon $compareStart = null, ?Carbon $compareEnd = null, ?string $currentLabel = null, ?string $priorLabel = null): array
    {
        $current = $this->queryCashFlowData($start, $end);

        if (!$compareStart || !$compareEnd) {
            return $current;
        }

        $prior = collect($this->queryCashFlowData($compareStart, $compareEnd))->keyBy('account');
        $currentColl = collect($current)->keyBy('account');
        $allAccounts = $currentColl->keys()->merge($prior->keys())->unique()->sort()->values();

        return $allAccounts->map(function ($acc) use ($currentColl, $prior) {
            $c = $currentColl->get($acc);
            $p = $prior->get($acc);

            $inflow = (float) ($c['inflow'] ?? 0);
            $outflow = (float) ($c['outflow'] ?? 0);
            $net = $inflow - $outflow;

            $priorInflow = (float) ($p['inflow'] ?? 0);
            $priorOutflow = (float) ($p['outflow'] ?? 0);
            $priorNet = $priorInflow - $priorOutflow;
            $varNet = $net - $priorNet;

            return [
                'account'       => $acc,
                'inflow'        => $inflow,
                'outflow'       => $outflow,
                'net'           => $net,
                'prior_inflow'  => $priorInflow,
                'prior_outflow' => $priorOutflow,
                'prior_net'     => $priorNet,
                'variance_net'  => $varNet,
                'pct_change'    => $priorNet != 0 ? round(($varNet / abs($priorNet)) * 100, 1) : null,
            ];
        })->values()->all();
    }

    /**
     * AR aging
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

    protected function queryBudgetData(int $fiscalYear): array
    {
        $groups = [];
        $gl = app(BudgetGlService::class);
        foreach (Budget::with(['department', 'accountAllocations.account'])->where('fiscal_year', $fiscalYear)->whereIn('status', ['Active', 'Closed'])->get() as $budget) {
            $id = $budget->department_id;
            $groups[$id] ??= ['department' => $budget->department?->department_name ?? 'Unassigned', 'allocated' => 0.0, 'actual' => 0.0];
            $groups[$id]['allocated'] = (float) \App\Support\Money::add($groups[$id]['allocated'], $budget->allocated_amount);
            $groups[$id]['actual'] = (float) \App\Support\Money::add($groups[$id]['actual'], $gl->summary($budget)['actual']);
        }
        return array_values($groups);
    }

    /**
     * Budget vs actual, with optional comparison fiscal year.
     */
    public function budgetVsActual(int $fiscalYear, ?int $compareYear = null): array
    {
        $current = $this->queryBudgetData($fiscalYear);

        if (!$compareYear) {
            return $current;
        }

        $prior = collect($this->queryBudgetData($compareYear))->keyBy('department');
        $currentColl = collect($current)->keyBy('department');
        $allDepts = $currentColl->keys()->merge($prior->keys())->unique()->sort()->values();

        return $allDepts->map(function ($dept) use ($currentColl, $prior) {
            $c = $currentColl->get($dept);
            $p = $prior->get($dept);

            $allocated = (float) ($c['allocated'] ?? 0);
            $actual = (float) ($c['actual'] ?? 0);
            $variance = $allocated - $actual;

            $priorAllocated = (float) ($p['allocated'] ?? 0);
            $priorActual = (float) ($p['actual'] ?? 0);
            $priorVariance = $priorAllocated - $priorActual;

            $actualDiff = $actual - $priorActual;

            return [
                'department'      => $dept,
                'allocated'       => $allocated,
                'actual'          => $actual,
                'variance'        => $variance,
                'prior_allocated' => $priorAllocated,
                'prior_actual'    => $priorActual,
                'prior_variance'  => $priorVariance,
                'actual_diff'     => $actualDiff,
                'pct_change'      => $priorActual != 0 ? round(($actualDiff / abs($priorActual)) * 100, 1) : null,
            ];
        })->values()->all();
    }
}