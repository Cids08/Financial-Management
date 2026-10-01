<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DashboardChartService;
use App\Services\DashboardService;
use Barryvdh\DomPDF\Facade\Pdf;
use App\Models\AccountsReceivable;
use App\Models\Collection;
use App\Models\Collector;
use App\Models\Setting;
use App\Support\FileStorage;
use Illuminate\Support\Str;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DashboardController extends Controller
{
    public function __construct(
        protected DashboardService $dashboardService,
        protected DashboardChartService $chartService,
    ) {
    }

    /**
     * GET /api/dashboard?year=2026
     *
     * Single aggregated payload for the Dashboard page's cards/lists.
     * Charts live on a separate endpoint (see charts() below) since
     * they're heavier grouped queries and the person may want the
     * cards to render before the charts finish.
     *
     * `year` is optional and defaults to the current calendar year. It
     * scopes the period figures only (revenue, expenses, net cash flow) —
     * the point-in-time cards (available cash, receivable, payable, counts)
     * and the forward-looking lists (deadlines, approvals, forecasts) are
     * the same regardless of which year is selected.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isStaff = strtolower($user?->role?->name ?? '') === 'staff';

        $staffData = $this->dashboardService->getStaffDashboardData();

        if ($isStaff) {
            return response()->json([
                'success' => true,
                'message' => 'Staff dashboard data retrieved successfully.',
                'data' => $staffData,
            ]);
        }

        $year = $this->resolveYear($request);

        $data = [
            'selected_year' => $year,
            'available_years' => $this->dashboardService->getAvailableYears(),
            'overview' => $this->dashboardService->getOverview($year),
            'module_cards' => $this->dashboardService->getModuleCards(),
            'recent_transactions' => $this->dashboardService->getRecentTransactions(),
            'pending_approvals' => $this->dashboardService->getPendingApprovals(),
            'upcoming_deadlines' => $this->dashboardService->getUpcomingDeadlines(),
            'notifications' => $this->dashboardService->getNotifications(),
            'ai_insights' => $this->dashboardService->getAiInsights(),
            'forecast_summary' => $this->dashboardService->getForecastSummary(),

            // Also provide staff keys so testing or previewing StaffDashboard never fails
            'summary' => $staffData['summary'],
            'attention' => $staffData['attention'],
            'recent_activity' => $staffData['recent_activity'],
        ];

        return response()->json([
            'success' => true,
            'message' => 'Dashboard data retrieved successfully.',
            'data' => $data,
        ]);
    }

    /**
     * GET /api/dashboard/charts?year=2026
     *
     * All "Charts & Trends" datasets in one payload: revenue_trend,
     * expense_trend, cash_flow_trend, collections_trend,
     * budget_utilization, receivable_aging, payable_aging,
     * expense_breakdown, cash_distribution.
     */
    public function charts(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->chartService->getAll($this->resolveYear($request)),
        ]);
    }

    /**
     * GET /api/dashboard/export?year=2026
     *
     * Renders the same overview/module-card/recent-transaction data shown
     * on the Dashboard page into a downloadable PDF snapshot. Reuses
     * DashboardService rather than querying separately, so the export
     * always matches what the person is looking at on screen — including
     * the year they picked, which is reflected in both the figures and the
     * filename.
     *
     * Requires barryvdh/laravel-dompdf (composer require barryvdh/laravel-dompdf).
     */
    public function exportPdf(Request $request): Response
    {
        $request->validate(['export_password' => ['required', 'string', 'min:12', 'max:64']]);
        $year = $this->resolveYear($request);

        // Letterhead + active currency come from Settings so the PDF matches
        // every browser-printed document (and doesn't hardcode "PHP").
        $settings = Setting::first();
        $currency = $settings?->currency ?: 'PHP';
        $user = $request->user();
        if ($user) {
            $user->loadMissing(['role', 'collector']);
        }

        $isCollector = strtolower($user?->role?->name ?? '') === 'collector'
            || $user?->collector !== null
            || ($user ? Collector::where('user_id', $user->id)->exists() : false);

        if ($isCollector) {
            return $this->exportCollectorPdf($request, $user, $year, $settings, $currency);
        }

        $isStaff = strtolower($user?->role?->name ?? '') === 'staff';
        if ($isStaff) {
            return $this->exportStaffPdf($request, $user, $year, $settings, $currency);
        }

        $data = [
            'generated_at' => now(),
            'selected_year' => $year,
            'company' => [
                'name' => $settings?->company_name ?: config('app.name', 'FMS'),
                'address' => $settings?->company_address,
                'phone' => $settings?->phone,
                'email' => $settings?->email,
                'tin' => $settings?->tin,
                // Inlined as a data URI so dompdf never has to reach out to
                // R2 mid-render  -  see FileStorage::inlineDataUri().
                'logo_data_uri' => FileStorage::inlineDataUri($settings?->company_logo),
            ],
            'currency' => $currency,
            // Drives the "figures cover ..." line: the current year runs
            // year-to-date, a past year covers the full 12 months. The end of
            // the range is rendered as an explicit date (e.g. "27 September
            // 2026") rather than the word "today", so a PDF that gets emailed
            // or filed still says which cutoff it was actually taken at.
            'period_end' => $year === (int) now()->year
                ? now()->format('j F Y')
                : '31 December ' . $year,
            'generated_by' => $user ? trim("{$user->first_name} {$user->last_name}") : null,
            'generated_by_role' => $user?->relationLoaded('role') ? ($user->role?->name ? Str::headline($user->role->name) : null) : null,
            'overview' => $this->dashboardService->getOverview($year),
            'module_cards' => $this->dashboardService->getModuleCards(),
            // A wider slice than the on-screen "8 most recent" — the PDF
            // is a standalone document, so it's worth giving more context.
            'recent_transactions' => $this->dashboardService->getRecentTransactions(25),
        ];

        $pdf = Pdf::loadView('pdf.dashboard-summary', $data)
            ->setPaper('a4', 'landscape');

        $filename = 'dashboard-summary-' . $year . '-' . now()->format('m-d') . '.pdf';

        return response(app(\App\Services\ProtectedExportService::class)->pdf($pdf->output(), $request->input('export_password')), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    /**
     * Exports a tailored collector dashboard & performance summary PDF
     * for the given calendar year.
     */
    private function exportCollectorPdf(Request $request, $user, int $year, ?Setting $settings, string $currency): Response
    {
        $collector = $user->collector
            ?? Collector::where('user_id', $user->id)->first()
            ?? Collector::where('email', $user->email)->first();

        $collectorId = $collector?->id;

        // Assigned AR query
        $arQuery = AccountsReceivable::query()
            ->with('customer')
            ->when($collectorId, fn ($q) => $q->where('collector_id', $collectorId))
            ->whereNull('deleted_at');

        $assignedInvoices = (clone $arQuery)->get();

        $outstandingBalance = (float) (clone $arQuery)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->sum('remaining_balance');

        $overdueInvoices = (clone $arQuery)
            ->where(function ($q) {
                $q->where('status', 'Overdue')
                    ->orWhere(function ($sub) {
                        $sub->whereNotIn('status', ['Paid', 'Cancelled'])
                            ->where('due_date', '<', now()->toDateString());
                    });
            })
            ->get();

        $overdueCount = $overdueInvoices->count();
        $overdueAmount = (float) $overdueInvoices->sum('remaining_balance');

        // Collections query for selected year
        $collectionsQuery = Collection::query()
            ->with(['accountsReceivable.customer', 'cashAccount'])
            ->when($collectorId, fn ($q) => $q->where('collector_id', $collectorId))
            ->whereYear('collection_date', $year)
            ->whereNull('deleted_at');

        $yearCollections = (clone $collectionsQuery)
            ->orderByDesc('collection_date')
            ->get();

        $confirmedCollections = $yearCollections->where('status', Collection::STATUS_CONFIRMED);
        $totalCollected = (float) $confirmedCollections->sum('amount_received');
        $confirmedCount = $confirmedCollections->count();

        $pendingCollections = $yearCollections->where('status', Collection::STATUS_PENDING);
        $totalPending = (float) $pendingCollections->sum('amount_received');
        $pendingCount = $pendingCollections->count();

        // Invoices needing attention / to collect
        $invoicesToCollect = (clone $arQuery)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->orderBy('due_date', 'asc')
            ->take(25)
            ->get();

        $data = [
            'generated_at' => now(),
            'selected_year' => $year,
            'company' => [
                'name' => $settings?->company_name ?: config('app.name', 'FMS'),
                'address' => $settings?->company_address,
                'phone' => $settings?->phone,
                'email' => $settings?->email,
                'tin' => $settings?->tin,
                'logo_data_uri' => FileStorage::inlineDataUri($settings?->company_logo),
            ],
            'currency' => $currency,
            'period_end' => $year === (int) now()->year
                ? now()->format('j F Y')
                : '31 December ' . $year,
            'collector' => [
                'name' => $collector ? trim("{$collector->first_name} {$collector->last_name}") : trim("{$user->first_name} {$user->last_name}"),
                'employee_no' => $collector?->employee_no ?? '—',
                'assigned_area' => $collector?->assigned_area ?? $collector?->serviceArea?->area_name ?? 'All Assigned Accounts',
                'email' => $collector?->email ?? $user->email,
                'phone' => $collector?->phone_number ?? '—',
                'target' => $collector?->monthly_target,
            ],
            'stats' => [
                'total_collected' => $totalCollected,
                'confirmed_count' => $confirmedCount,
                'total_pending' => $totalPending,
                'pending_count' => $pendingCount,
                'outstanding_balance' => $outstandingBalance,
                'overdue_count' => $overdueCount,
                'overdue_amount' => $overdueAmount,
                'total_assigned_count' => $assignedInvoices->count(),
            ],
            'invoices_to_collect' => $invoicesToCollect,
            'recent_collections' => $yearCollections->take(30),
        ];

        $pdf = Pdf::loadView('pdf.collector-dashboard-summary', $data)
            ->setPaper('a4', 'portrait');

        $filename = 'collector-dashboard-summary-' . $year . '-' . now()->format('m-d') . '.pdf';

        return response(app(\App\Services\ProtectedExportService::class)->pdf($pdf->output(), $request->input('export_password')), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    /**
     * Exports a tailored staff operational dashboard summary PDF.
     */
    private function exportStaffPdf(Request $request, $user, int $year, ?Setting $settings, string $currency): Response
    {
        $staffData = $this->dashboardService->getStaffDashboardData();

        $data = [
            'generated_at' => now(),
            'selected_year' => $year,
            'company' => [
                'name' => $settings?->company_name ?: config('app.name', 'FMS'),
                'address' => $settings?->company_address,
                'phone' => $settings?->phone,
                'email' => $settings?->email,
                'tin' => $settings?->tin,
                'logo_data_uri' => FileStorage::inlineDataUri($settings?->company_logo),
            ],
            'currency' => $currency,
            'generated_by' => $user ? trim("{$user->first_name} {$user->last_name}") : null,
            'generated_by_role' => $user?->relationLoaded('role') ? ($user->role?->name ? Str::headline($user->role->name) : null) : null,
            'summary' => $staffData['summary'],
            'attention' => $staffData['attention'],
            'recent_activity' => $staffData['recent_activity'],
        ];

        $pdf = Pdf::loadView('pdf.staff-dashboard-summary', $data)
            ->setPaper('a4', 'portrait');

        $filename = 'staff-dashboard-summary-' . now()->format('Y-m-d') . '.pdf';

        return response(app(\App\Services\ProtectedExportService::class)->pdf($pdf->output(), $request->input('export_password')), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    /**
     * Reads the `year` query param, defaulting to the current year. A
     * non-numeric or out-of-range value is a client mistake worth
     * surfacing (422) rather than silently showing the wrong year — the
     * picker is a plain year list, so this only ever fires on hand-typed
     * URLs.
     */
    private function resolveYear(Request $request): int
    {
        $currentYear = (int) now()->year;
        $raw = $request->query('year');

        if ($raw === null || $raw === '') {
            return $currentYear;
        }

        if (! is_numeric($raw) || (int) $raw != $raw) {
            abort(422, 'The year parameter must be a four-digit year.');
        }

        $year = (int) $raw;

        if ($year < 2000 || $year > $currentYear) {
            abort(422, "The year must be between 2000 and {$currentYear}.");
        }

        return $year;
    }
}