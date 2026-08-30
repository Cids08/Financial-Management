<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\AiRecommendation;
use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\Collection as CollectionModel; // aliased — see note in App\Models\Collection
use App\Models\Collector;
use App\Models\Customer;
use App\Models\Disbursement;
use App\Models\Expense;
use App\Models\FinancialForecast;
use App\Models\FixedAsset;
use App\Models\JournalEntry;
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
 *   - budgets "currently active" -> today between start_date/end_date
 * This avoids the exact failure mode we hit before (a status string
 * that doesn't match the DB's actual casing silently returning zero
 * rows instead of erroring). 'Active' for collectors/customers/suppliers
 * is kept as-is since that pattern is already proven working elsewhere
 * in this file.
 */
class DashboardService
{
    public function getOverview(): array
    {
        $today = Carbon::today();
        $monthStart = $today->copy()->startOfMonth();
        $lastMonthStart = $today->copy()->subMonthNoOverflow()->startOfMonth();
        $lastMonthEnd = $today->copy()->subMonthNoOverflow()->endOfMonth();

        // Actual cash collected, not invoiced AR — Collection now exists.
        $revenueThisMonth = CollectionModel::whereBetween('collection_date', [$monthStart, $today])
            ->sum('amount_received');

        $revenueLastMonth = CollectionModel::whereBetween('collection_date', [$lastMonthStart, $lastMonthEnd])
            ->sum('amount_received');

        $expensesThisMonth = Expense::whereBetween('expense_date', [$monthStart, $today])
            ->where('status', '!=', Expense::STATUS_REJECTED)
            ->sum('expense_amount');

        $expensesLastMonth = Expense::whereBetween('expense_date', [$lastMonthStart, $lastMonthEnd])
            ->where('status', '!=', Expense::STATUS_REJECTED)
            ->sum('expense_amount');

        $availableCash = CashAccount::where('status', 'Active')->sum('current_balance');

        $netCashFlow = $revenueThisMonth - $expensesThisMonth;
        $netCashFlowLastMonth = $revenueLastMonth - $expensesLastMonth;

        return [
            'total_revenue' => [
                'value' => (float) $revenueThisMonth,
                'trend' => $this->percentChange($revenueLastMonth, $revenueThisMonth),
                'note' => 'Actual cash collected (Collections), not invoiced AR.',
            ],
            'total_expenses' => [
                'value' => (float) $expensesThisMonth,
                'trend' => $this->percentChange($expensesLastMonth, $expensesThisMonth),
            ],
            'available_cash' => [
                'value' => (float) $availableCash,
                'trend' => null, // point-in-time balance, no meaningful period trend
            ],
            'net_cash_flow' => [
                'value' => (float) $netCashFlow,
                'trend' => $this->percentChange($netCashFlowLastMonth, $netCashFlow),
            ],
        ];
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
            'fixed_assets_value' => (float) FixedAsset::whereNotIn('status', ['Disposed', 'Written Off'])->sum('book_value'),

            'active_collectors' => Collector::where('status', 'Active')->count(),

            'collections_today' => (float) CollectionModel::whereDate('collection_date', $today)->sum('amount_received'),

            'disbursements_today' => (float) Disbursement::whereDate('payment_date', $today)->sum('amount_paid'),

            // "Unpaid" via payment_date IS NULL rather than a guessed status string.
            'tax_obligations' => (float) TaxObligation::whereNull('payment_date')->sum('tax_amount'),

            // "Currently active" via date range rather than a guessed status string.
            'active_budgets' => Budget::whereDate('start_date', '<=', $today)
                ->whereDate('end_date', '>=', $today)
                ->count(),

            // Confirmed enum: journal_entries.status CHECK (Draft|Posted|Cancelled).
            'pending_journal_entries' => JournalEntry::where('status', 'Draft')->count(),
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

        $budgetReviews = Budget::whereBetween('end_date', [$today, $horizon])
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

    protected function percentChange(float $previous, float $current): ?float
    {
        if ($previous == 0.0) {
            return null;
        }

        return round((($current - $previous) / abs($previous)) * 100, 1);
    }
}