<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DashboardChartService;
use App\Services\DashboardService;
use Barryvdh\DomPDF\Facade\Pdf;
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
        $year = $this->resolveYear($request);

        // Letterhead + active currency come from Settings so the PDF matches
        // every browser-printed document (and doesn't hardcode "PHP").
        $settings = Setting::first();
        $currency = $settings?->currency ?: 'PHP';
        $user = $request->user();

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
            ->setPaper('a4', 'portrait');

        $filename = 'dashboard-summary-' . $year . '-' . now()->format('m-d') . '.pdf';

        return $pdf->download($filename);
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