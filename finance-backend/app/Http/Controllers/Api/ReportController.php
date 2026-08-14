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

    protected function validatedPeriod(Request $request): string
    {
        $request->validate(['period' => ['sometimes', Rule::in(self::PERIODS)]]);

        return $request->string('period')->toString() ?: 'This Month';
    }

    /**
     * GET /api/reports/income-statement?period=This Quarter
     */
    public function incomeStatement(Request $request): JsonResponse
    {
        $period = $this->validatedPeriod($request);
        ['start' => $start, 'end' => $end] = $this->reportService->resolvePeriod($period);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->reportService->incomeStatement($start, $end),
        ]);
    }

    /**
     * GET /api/reports/cash-flow?period=This Quarter
     */
    public function cashFlow(Request $request): JsonResponse
    {
        $period = $this->validatedPeriod($request);
        ['start' => $start, 'end' => $end] = $this->reportService->resolvePeriod($period);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->reportService->cashFlow($start, $end),
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
     * GET /api/reports/budget-vs-actual?period=This Quarter
     */
    public function budgetVsActual(Request $request): JsonResponse
    {
        $period = $this->validatedPeriod($request);
        ['start' => $start] = $this->reportService->resolvePeriod($period);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->reportService->budgetVsActual($start->year),
        ]);
    }
}