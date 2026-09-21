<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    protected const PERIODS = ['This Month', 'Last Month', 'This Quarter', 'This Year'];

    public function __construct(protected ReportService $reportService)
    {
    }

    protected function resolveRequestPeriods(Request $request): array
    {
        $request->validate([
            'period'       => ['sometimes', 'nullable', 'string'],
            'start_date'   => ['sometimes', 'nullable', 'date'],
            'end_date'     => ['sometimes', 'nullable', 'date'],
            'compare'      => ['sometimes'],
            'compare_mode' => ['sometimes', Rule::in(['prior_period', 'prior_year'])],
        ]);

        $period = $request->string('period')->toString() ?: null;
        $startDate = $request->string('start_date')->toString() ?: null;
        $endDate = $request->string('end_date')->toString() ?: null;
        $shouldCompare = $request->boolean('compare');
        $compareMode = $request->string('compare_mode')->toString() ?: 'prior_period';

        $current = $this->reportService->resolvePeriod($period, $startDate, $endDate);

        $prior = null;
        if ($shouldCompare) {
            $prior = $this->reportService->resolveComparisonPeriod($current['start'], $current['end'], $compareMode);
        }

        return [
            'current' => $current,
            'prior'   => $prior,
        ];
    }

    /**
     * GET /api/reports/income-statement
     */
    public function incomeStatement(Request $request): JsonResponse
    {
        ['current' => $curr, 'prior' => $prior] = $this->resolveRequestPeriods($request);
        $data = $this->reportService->incomeStatement(
            $curr['start'],
            $curr['end'],
            $prior ? $prior['start'] : null,
            $prior ? $prior['end'] : null,
            $curr['label'],
            $prior ? $prior['label'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $data,
        ]);
    }

    /**
     * GET /api/reports/cash-flow
     */
    public function cashFlow(Request $request): JsonResponse
    {
        ['current' => $curr, 'prior' => $prior] = $this->resolveRequestPeriods($request);
        $data = $this->reportService->cashFlow(
            $curr['start'],
            $curr['end'],
            $prior ? $prior['start'] : null,
            $prior ? $prior['end'] : null,
            $curr['label'],
            $prior ? $prior['label'] : null,
        );

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $data,
        ]);
    }

    /**
     * GET /api/reports/ar-aging
     * Aging is always "as of today" — the period selector doesn't apply here.
     */
    public function arAging(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->reportService->arAging(),
        ]);
    }

    /**
     * GET /api/reports/ap-aging
     */
    public function apAging(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->reportService->apAging(),
        ]);
    }

    /**
     * GET /api/reports/budget-vs-actual
     */
    public function budgetVsActual(Request $request): JsonResponse
    {
        ['current' => $curr, 'prior' => $prior] = $this->resolveRequestPeriods($request);
        $currentYear = (int) $curr['start']->year;
        $compareYear = $prior ? (int) $prior['start']->year : null;
        if ($compareYear && $compareYear === $currentYear) {
            $compareYear = $currentYear - 1;
        }

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->reportService->budgetVsActual($currentYear, $compareYear),
        ]);
    }
}