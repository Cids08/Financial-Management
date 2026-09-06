<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DashboardChartService;
use App\Services\DashboardService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class DashboardController extends Controller
{
    public function __construct(
        protected DashboardService $dashboardService,
        protected DashboardChartService $chartService,
    ) {
    }

    /**
     * GET /api/dashboard
     *
     * Single aggregated payload for the Dashboard page's cards/lists.
     * Charts live on a separate endpoint (see charts() below) since
     * they're heavier grouped queries and the person may want the
     * cards to render before the charts finish.
     */
    public function index(): JsonResponse
    {
        $data = [
            'overview' => $this->dashboardService->getOverview(),
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
     * GET /api/dashboard/charts
     *
     * All 7 "Charts & Trends" datasets in one payload: revenue_trend,
     * expense_trend, cash_flow_trend, collections_trend,
     * budget_utilization, receivable_aging, payable_aging.
     */
    public function charts(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $this->chartService->getAll(),
        ]);
    }

    /**
     * GET /api/dashboard/export
     *
     * Renders the same overview/module-card/recent-transaction data shown
     * on the Dashboard page into a downloadable PDF snapshot. Reuses
     * DashboardService rather than querying separately, so the export
     * always matches what the person is looking at on screen.
     *
     * Requires barryvdh/laravel-dompdf (composer require barryvdh/laravel-dompdf).
     */
    public function exportPdf(): Response
    {
        $data = [
            'generated_at' => now(),
            'overview' => $this->dashboardService->getOverview(),
            'module_cards' => $this->dashboardService->getModuleCards(),
            // A wider slice than the on-screen "8 most recent" — the PDF
            // is a standalone document, so it's worth giving more context.
            'recent_transactions' => $this->dashboardService->getRecentTransactions(25),
        ];

        $pdf = Pdf::loadView('pdf.dashboard-summary', $data)
            ->setPaper('a4', 'portrait');

        $filename = 'dashboard-summary-' . now()->format('Y-m-d') . '.pdf';

        return $pdf->download($filename);
    }
}