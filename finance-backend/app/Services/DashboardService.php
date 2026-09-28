<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\AiRecommendation;
use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\Collection as CollectionModel; // aliased — see note in App\Models\Collection
use App\Models\Collector;
use App\Models\Customer;
use App\Models\Disbursement;
use App\Models\Expense;
use App\Models\FinancialForecast;
use App\Models\Notification;
use App\Models\Supplier;
use App\Models\TaxObligation;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Aggregates read-only financial metrics for the Dashboard.
 *
 * All sections are now wired against real models/columns from the ERD.
 *
 * A NOTE ON STATUS ENUMS: several tables (collections, disbursements,
 * budgets, tax_obligations) have a free-text `status` column whose exact
 * allowed values I haven't independently verified against a DB CHECK
 * constraint the way journal_entries.status was confirmed to be
 * Draft/Posted/Cancelled. Wherever a query needed to distinguish
 * "pending vs. done", I preferred a structural column instead of
 * guessing the status string:
 *   - disbursements/budgets "awaiting approval" -> whereNull('approved_by')
 *   - tax_obligations "unpaid" -> whereNull('payment_date')
 *   - budgets "currently active" -> today between start_date/end_date,
 *     AND approved (approved_by IS NOT NULL)
 * This avoids the exact failure mode we hit before (a status string
 * that doesn't match the DB's actual casing silently returning zero
 * rows instead of erroring). 'Active' for collectors/customers/suppliers
 * is kept as-is since that pattern is already proven working elsewhere
 * in this file.
 */
class DashboardService
{
    public function getOverview(?int $year = null): array
    {
        $year ??= (int) Carbon::today()->year;

        $yearStart = Carbon::create($year, 1, 1);
        $lastYearStart = $yearStart->copy()->subYear();

        // A past year is complete  -  so it runs to Dec 31  -  while the
        // current year is still accumulating, so it stops at today. A future
        // year has nothing in it yet, hence the empty window.
        $end = $this->yearEnd($year);

        // Actual cash collected, not invoiced AR  -  Collection now exists.
        // Scoped to the selected year instead of a rolling windowed month,
        // so the overview cards match the "this year" framing by default.
        $revenueThisYear = CollectionModel::whereBetween('collection_date', [$yearStart, $end])
            ->sum('amount_received');

        $revenueLastYear = CollectionModel::whereBetween('collection_date', [$lastYearStart, $this->yearEnd($year - 1)])
            ->sum('amount_received');

        $expensesThisYear = Expense::whereBetween('expense_date', [$yearStart, $end])
            ->where('status', '!=', Expense::STATUS_REJECTED)
            ->sum('expense_amount');

        $expensesLastYear = Expense::whereBetween('expense_date', [$lastYearStart, $this->yearEnd($year - 1)])
            ->where('status', '!=', Expense::STATUS_REJECTED)
            ->sum('expense_amount');

        $availableCash = CashAccount::where('status', 'Active')->sum('current_balance');

        $netCashFlow = $revenueThisYear - $expensesThisYear;
        $netCashFlowLastYear = $revenueLastYear - $expensesLastYear;

        return [
            'total_revenue' => [
                'value' => (float) $revenueThisYear,
                'trend' => $this->percentChange($revenueLastYear, $revenueThisYear),
                'note' => 'Actual cash collected in ' . $year . ' (Collections), not invoiced AR.',
            ],
            'total_expenses' => [
                'value' => (float) $expensesThisYear,
                'trend' => $this->percentChange($expensesLastYear, $expensesThisYear),
            ],
            'available_cash' => [
                'value' => (float) $availableCash,
                'trend' => null, // point-in-time balance, no meaningful period trend
                'note' => 'Current balance across active cash accounts.',
            ],
            'net_cash_flow' => [
                'value' => (float) $netCashFlow,
                'trend' => $this->percentChange($netCashFlowLastYear, $netCashFlow),
            ],
        ];
    }

    /**
     * Years the Dashboard's year picker can offer, newest first.
     *
     * Derived from the earliest actual transaction date rather than a
     * hardcoded floor, so a fresh install doesn't show a decade of empty
     * years. The current year is always present even with no records yet.
     * A future year is deliberately NOT offered: nothing on the dashboard
     * reads forecast figures, so it would just render as an empty year.
     */
    public function getAvailableYears(): array
    {
        $currentYear = (int) Carbon::today()->year;

        $dates = collect([
            CollectionModel::min('collection_date'),
            Expense::min('expense_date'),
            AccountsReceivable::min('invoice_date'),
            AccountsPayable::min('invoice_date'),
            Disbursement::min('payment_date'),
        ])->filter()->map(fn ($date) => (int) Carbon::parse($date)->year);

        $earliest = $dates->isEmpty() ? $currentYear : $dates->min();

        return collect(range($currentYear, max($earliest, $currentYear - 10), -1))
            ->map(fn ($year) => (string) $year)
            ->values()
            ->toArray();
    }

    /**
     * Where a year's figures should stop accumulating. The current year is
     * still in progress (stop at today), any past year is complete (stop at
     * its Dec 31), and a future year has nothing in it yet.
     */
    private function yearEnd(int $year): Carbon
    {
        if ($year === (int) Carbon::today()->year) {
            return Carbon::today()->endOfDay();
        }

        if ($year > (int) Carbon::today()->year) {
            // Deliberately before the year's start  ->  always an empty window.
            return Carbon::create($year, 1, 1)->subDay();
        }

        return Carbon::create($year, 12, 31)->endOfDay();
    }

    public function getModuleCards(): array
    {
        $today = Carbon::today();

        return [
            'total_customers' => Customer::where('status', 'Active')->count(),
            'total_suppliers' => Supplier::where('status', 'Active')->count(),
            'receivable' => (float) AccountsReceivable::whereNotIn('status', ['Paid', 'Cancelled'])->sum('remaining_balance'),
            'cash_balance' => (float) CashAccount::where('status', 'Active')->sum('current_balance'),
            'payable' => (float) AccountsPayable::whereNotIn('status', ['Paid', 'Cancelled'])->sum('remaining_balance'),

            'active_collectors' => Collector::where('status', 'Active')->count(),

            'collections_today' => (float) CollectionModel::whereDate('collection_date', $today)->sum('amount_received'),

            'disbursements_today' => (float) Disbursement::whereDate('payment_date', $today)->sum('amount_paid'),

            // "Unpaid" via payment_date IS NULL rather than a guessed status string.
            'tax_obligations' => (float) TaxObligation::whereNull('payment_date')->sum('tax_amount'),

            // "Currently active" via date range, restricted to approved budgets —
            // a budget still awaiting approval (approved_by IS NULL) shouldn't
            // count as active just because its dates overlap today.
            'active_budgets' => Budget::whereDate('start_date', '<=', $today)
                ->whereDate('end_date', '>=', $today)
                ->whereNotNull('approved_by')
                ->count(),
        ];
    }

    public function getRecentTransactions(int $limit = 8): array
    {
        $receivables = AccountsReceivable::query()
            ->select(['invoice_date as date', 'invoice_number as reference', DB::raw("'Invoice Issued' as transaction"), 'customer_id', 'original_amount as amount', 'status', 'created_at'])
            ->with('customer:id,customer_name')
            ->latest('created_at')->limit($limit)->get();

        $payables = AccountsPayable::query()
            ->select(['invoice_date as date', 'invoice_number as reference', DB::raw("'Supplier Invoice' as transaction"), 'supplier_id', 'original_amount as amount', 'status', 'created_at'])
            ->with('supplier:id,supplier_name')
            ->latest('created_at')->limit($limit)->get();

        $expenses = Expense::query()
            ->select(['expense_date as date', 'receipt_number as reference', DB::raw("'Expense Voucher' as transaction"), 'description as party', 'expense_amount as amount', 'status', 'created_at'])
            ->latest('created_at')->limit($limit)->get();

        $collections = CollectionModel::query()
            ->select(['collection_date as date', 'receipt_number as reference', DB::raw("'Customer Collection' as transaction"), 'collector_id', 'amount_received as amount', 'status', 'created_at'])
            ->with('collector:id,first_name,last_name')
            ->latest('created_at')->limit($limit)->get();

        $disbursements = Disbursement::query()
            ->select(['payment_date as date', 'voucher_number as reference', DB::raw("'Supplier Disbursement' as transaction"), 'payee as party', 'amount_paid as amount', 'status', 'created_at'])
            ->latest('created_at')->limit($limit)->get();

        $merged = collect()
            ->concat($receivables->map(fn ($r) => $this->mapTransaction($r, $r->customer->customer_name ?? '—', '/transactions/receivable')))
            ->concat($payables->map(fn ($r) => $this->mapTransaction($r, $r->supplier->supplier_name ?? '—', '/transactions/payable')))
            ->concat($expenses->map(fn ($r) => $this->mapTransaction($r, $r->party ?? '—', '/transactions/expenses')))
            ->concat($collections->map(fn ($r) => $this->mapTransaction($r, $r->collector?->full_name ?? '—', '/transactions/collections')))
            ->concat($disbursements->map(fn ($r) => $this->mapTransaction($r, $r->party ?? '—', '/transactions/disbursements')))
            ->sortByDesc('created_at')
            ->take($limit)
            ->values();

        return $merged->toArray();
    }

    protected function mapTransaction($row, string $party, string $route): array
    {
        return [
            'date' => optional($row->date)->format('Y-m-d') ?? $row->date,
            'reference' => $row->reference,
            'transaction' => $row->transaction,
            'party' => $party,
            'amount' => (float) $row->amount,
            'status' => $row->status,
            'route' => $route,
            'created_at' => $row->created_at,
        ];
    }

    public function getPendingApprovals(int $limit = 6): array
    {
        $expenses = Expense::where('status', Expense::STATUS_PENDING)
            ->latest('created_at')->limit($limit)->get()
            ->map(fn ($e) => [
                'title' => "Expense Voucher - {$e->description}",
                'date' => optional($e->created_at)->format('Y-m-d'),
                'status' => $e->is_over_budget ? 'Escalated' : 'Pending',
                'type' => 'expense',
                'route' => '/transactions/expenses',
            ]);

        // "Awaiting approval" via approved_by IS NULL rather than a guessed status string.
        $budgets = Budget::whereNull('approved_by')
            ->latest('created_at')->limit($limit)->get()
            ->map(fn ($b) => [
                'title' => "Budget Approval - {$b->budget_name}",
                'date' => optional($b->created_at)->format('Y-m-d'),
                'status' => 'Pending',
                'type' => 'budget',
                'route' => '/transactions/budgets',
            ]);

        $disbursements = Disbursement::whereNull('approved_by')
            ->latest('created_at')->limit($limit)->get()
            ->map(fn ($d) => [
                'title' => "Supplier Payment - {$d->payee}",
                'date' => optional($d->created_at)->format('Y-m-d'),
                'status' => 'Pending',
                'type' => 'disbursement',
                'route' => '/transactions/disbursements',
            ]);

        return collect()
            ->concat($expenses)
            ->concat($budgets)
            ->concat($disbursements)
            ->sortByDesc('date')
            ->take($limit)
            ->values()
            ->toArray();
    }

    public function getUpcomingDeadlines(int $limit = 6): array
    {
        $today = Carbon::today();
        $horizon = $today->copy()->addDays(30);

        $receivables = AccountsReceivable::whereBetween('due_date', [$today, $horizon])
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->with('customer:id,customer_name')
            ->orderBy('due_date')->limit($limit)->get()
            ->map(fn ($r) => [
                'title' => 'Due Accounts Receivable',
                'detail' => '₱' . number_format($r->remaining_balance, 2) . ' from ' . ($r->customer->customer_name ?? '—'),
                'date' => $r->due_date,
                'route' => '/transactions/receivable',
            ]);

        $payables = AccountsPayable::whereBetween('due_date', [$today, $horizon])
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->with('supplier:id,supplier_name')
            ->orderBy('due_date')->limit($limit)->get()
            ->map(fn ($p) => [
                'title' => 'Upcoming Supplier Payment',
                'detail' => '₱' . number_format($p->remaining_balance, 2) . ' to ' . ($p->supplier->supplier_name ?? '—'),
                'date' => $p->due_date,
                'route' => '/transactions/payable',
            ]);

        $taxes = TaxObligation::whereBetween('due_date', [$today, $horizon])
            ->whereNull('payment_date')
            ->orderBy('due_date')->limit($limit)->get()
            ->map(fn ($t) => [
                'title' => 'Tax Filing Deadline',
                'detail' => $t->tax_type . ' — ' . $t->tax_period,
                'date' => $t->due_date,
                'route' => '/transactions/tax-obligations',
            ]);

        // Eager-load department to avoid an N+1 query per budget row below.
        // Not filtered by approved_by — this section warns about upcoming
        // end dates regardless of approval state, unlike active_budgets above.
        $budgetReviews = Budget::whereBetween('end_date', [$today, $horizon])
            ->with('department:id,department_name')
            ->orderBy('end_date')->limit($limit)->get()
            ->map(fn ($b) => [
                'title' => 'Budget Period Ending',
                'detail' => $b->budget_name . ' (' . $b->department?->department_name . ')',
                'date' => $b->end_date,
                'route' => '/transactions/budgets',
            ]);

        return collect()
            ->concat($receivables)
            ->concat($payables)
            ->concat($taxes)
            ->concat($budgetReviews)
            ->sortBy('date')
            ->take($limit)
            ->values()
            ->toArray();
    }

    public function getNotifications(int $limit = 6): array
    {
        $userId = Auth::id();

        // Auth::id() is nullable by signature — without this guard, a null
        // here reached Notification::scopeForUser() and threw a TypeError
        // (500 on GET /api/dashboard) before scopeForUser was widened to
        // accept ?int. This guard is a second line of defense on top of
        // that fix: no authenticated user simply means no notifications.
        if ($userId === null) {
            return [];
        }

        return Notification::forUser($userId)
            ->latest('created_at')->limit($limit)->get()
            ->map(fn ($n) => [
                'text' => $n->message,
                'title' => $n->title,
                'type' => $n->type,
                'is_read' => (bool) $n->is_read,
                'time' => $n->created_at->diffForHumans(),
                'route' => $this->routeForNotificationType($n->type),
            ])
            ->toArray();
    }

    protected function routeForNotificationType(?string $type): string
    {
        return match ($type) {
            'receivable' => '/transactions/receivable',
            'payable' => '/transactions/payable',
            'budget' => '/transactions/budgets',
            'forecast' => '/analytics/forecasting',
            'ai_recommendation' => '/analytics/ai-recommendations',
            default => '/reports',
        };
    }

    public function getAiInsights(int $limit = 4): array
    {
        return AiRecommendation::query()
            ->latest('generated_at')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => [
                'text' => $r->summary,
                'recommendation' => $r->recommendation,
                'category' => $r->category,
                'priority' => $r->priority,
                'confidence_score' => (float) $r->confidence_score,
                'estimated_impact' => $r->estimated_impact !== null ? (float) $r->estimated_impact : null,
                'route' => '/analytics/ai-recommendations',
            ])
            ->toArray();
    }

    /**
     * Latest forecast per forecast_type (Cash Flow / Revenue / Collections /
     * Expenses / Accounts Receivable — see FinancialForecastService::FORECAST_TYPES).
     *
     * NOTE: grouping is on forecast_type, not forecast_target.
     * forecast_target is a shared financial-statement category (DB CHECK
     * constrains it to Revenue/Expense/Cash Flow/Budget), and
     * FinancialForecastService::FORECAST_TARGET_MAP deliberately collapses
     * Collections + Accounts Receivable into 'Cash Flow' there — grouping
     * by forecast_target would merge those distinct forecast types into a
     * single row instead of showing each one. forecast_type is the
     * granular value the user actually picks when generating a forecast,
     * and is what the Financial Forecasting page's TYPE column displays,
     * so that's what the dashboard groups and labels by too.
     */
    public function getForecastSummary(): array
    {
        $latestIdsPerType = FinancialForecast::query()
            ->selectRaw('MAX(id) as id')
            ->groupBy('forecast_type')
            ->pluck('id');

        return FinancialForecast::whereIn('id', $latestIdsPerType)
            ->orderByDesc('generated_at')
            ->get()
            ->map(fn ($f) => [
                'forecast_target' => $f->forecast_type, // frontend label — see note above
                'forecast_type' => $f->forecast_type,
                'predicted_amount' => (float) $f->predicted_amount,
                'actual_amount' => $f->actual_amount !== null ? (float) $f->actual_amount : null,
                'confidence_level' => (float) $f->confidence_level,
                'trend' => $f->actual_amount !== null
                    ? $this->percentChange((float) $f->actual_amount, (float) $f->predicted_amount)
                    : null,
                'forecast_start' => optional($f->forecast_start)->format('Y-m-d'),
                'forecast_end' => optional($f->forecast_end)->format('Y-m-d'),
                'route' => '/analytics/forecasting',
            ])
            ->toArray();
    }

    public function getStaffDashboardData(): array
    {
        $today = Carbon::today();
        $startOfMonth = Carbon::now()->startOfMonth();
        $endOfMonth = Carbon::now()->endOfMonth();

        // 1. Summary stat cards
        $summary = [
            'customers' => Customer::where('status', 'Active')->count(),
            'suppliers' => Supplier::where('status', 'Active')->count(),
            'ar_outstanding' => (float) AccountsReceivable::whereNotIn('status', ['Paid', 'Cancelled'])->sum('remaining_balance'),
            'ap_outstanding' => (float) AccountsPayable::whereNotIn('status', ['Paid', 'Cancelled'])->sum('remaining_balance'),
            'expenses_this_month' => (float) Expense::whereBetween('expense_date', [$startOfMonth, $endOfMonth])
                ->where('status', '!=', Expense::STATUS_REJECTED)
                ->sum('expense_amount'),
        ];

        // 2. Attention Sections
        // AR Awaiting Follow-up (Overdue or unpaid receivables, ordered by overdue first)
        $arAttention = AccountsReceivable::query()
            ->with('customer:id,customer_name')
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->where(function ($q) use ($today) {
                $q->where('due_date', '<=', $today)
                  ->orWhere('status', 'Overdue')
                  ->orWhere('remaining_balance', '>', 0);
            })
            ->orderByRaw('CASE WHEN due_date <= ? THEN 0 ELSE 1 END', [$today])
            ->orderBy('due_date', 'asc')
            ->limit(10)
            ->get()
            ->map(fn ($inv) => [
                'id' => $inv->id,
                'customer_name' => $inv->customer?->customer_name ?? $inv->invoice_number,
                'amount' => (float) $inv->remaining_balance,
                'due_date' => optional($inv->due_date)->format('Y-m-d') ?? (string) $inv->due_date,
            ])
            ->values()
            ->toArray();

        // AP Pending Approval (Bills awaiting approval or pending review)
        $apQuery = AccountsPayable::query()
            ->with('supplier:id,supplier_name')
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->where(function ($q) {
                $q->whereNull('approved_by')
                  ->orWhere('status', 'Pending');
            })
            ->orderBy('due_date', 'asc')
            ->limit(10)
            ->get();

        if ($apQuery->isEmpty()) {
            // If none awaiting approval, surface unpaid bills approaching due date
            $apQuery = AccountsPayable::query()
                ->with('supplier:id,supplier_name')
                ->whereNotIn('status', ['Paid', 'Cancelled'])
                ->orderBy('due_date', 'asc')
                ->limit(10)
                ->get();
        }

        $apAttention = $apQuery->map(fn ($bill) => [
            'id' => $bill->id,
            'supplier_name' => $bill->supplier?->supplier_name ?? $bill->invoice_number,
            'amount' => (float) $bill->remaining_balance,
            'due_date' => optional($bill->due_date)->format('Y-m-d') ?? (string) $bill->due_date,
        ])->values()->toArray();

        // Expenses Pending Approval
        $expenseQuery = Expense::query()
            ->where('status', Expense::STATUS_PENDING)
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get();

        if ($expenseQuery->isEmpty()) {
            $expenseQuery = Expense::query()
                ->where('status', 'Pending')
                ->orderBy('created_at', 'desc')
                ->limit(10)
                ->get();
        }

        $expenseAttention = $expenseQuery->map(fn ($exp) => [
            'id' => $exp->id,
            'description' => $exp->description ?: "Expense #{$exp->id}",
            'amount' => (float) $exp->expense_amount,
            'submitted_at' => optional($exp->created_at)->toIso8601String(),
        ])->values()->toArray();

        // Disbursements Pending Approval
        $disbursementAttention = Disbursement::query()
            ->whereNull('approved_by')
            ->whereNotIn('status', ['Approved', 'Released', 'Cancelled', 'Rejected'])
            ->orderBy('created_at', 'desc')
            ->limit(10)
            ->get()
            ->map(fn ($d) => [
                'id' => $d->id,
                'reference' => $d->voucher_number ?: "DV-{$d->id}",
                'amount' => (float) $d->amount_paid,
                'submitted_at' => optional($d->created_at)->toIso8601String(),
            ])
            ->values()
            ->toArray();

        // Budgets Missing a Plan
        $budgetAttention = Budget::query()
            ->where('status', Budget::STATUS_DRAFT)
            ->whereDoesntHave('supportingDocuments')
            ->limit(10)
            ->get()
            ->map(fn ($b) => [
                'id' => $b->id,
                'budget_name' => $b->budget_name,
                'reason' => 'No budget plan attached',
            ])
            ->values()
            ->toArray();

        // 3. Recent Activity feed
        $recentLogs = AuditLog::query()
            ->with('user:id,first_name,last_name')
            ->latest('created_at')
            ->limit(15)
            ->get()
            ->map(fn ($log) => [
                'id' => $log->id,
                'type' => $log->module ?? 'Activity',
                'description' => $log->activity_description ?? "{$log->action} in {$log->module}",
                'actor_name' => $log->user ? "{$log->user->first_name} {$log->user->last_name}" : 'System',
                'created_at' => optional($log->created_at)->toIso8601String(),
            ]);

        if ($recentLogs->isEmpty()) {
            $recentLogs = collect($this->getRecentTransactions(10))->map(fn ($tx, $idx) => [
                'id' => $idx + 1,
                'type' => $tx['transaction'] ?? 'Transaction',
                'description' => "{$tx['transaction']}: {$tx['reference']} ({$tx['party']})",
                'actor_name' => $tx['party'] ?? 'System',
                'created_at' => $tx['created_at'] ? Carbon::parse($tx['created_at'])->toIso8601String() : now()->toIso8601String(),
            ]);
        }

        return [
            'summary' => $summary,
            'attention' => [
                'ar' => $arAttention,
                'ap' => $apAttention,
                'expenses' => $expenseAttention,
                'disbursements' => $disbursementAttention,
                'budgets' => $budgetAttention,
            ],
            'recent_activity' => $recentLogs->values()->toArray(),
        ];
    }

    protected function percentChange(float $previous, float $current): ?float
    {
        if ($previous == 0.0) {
            return null;
        }

        return round((($current - $previous) / abs($previous)) * 100, 1);
    }
}