<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GenerateForecastRequest;
use App\Http\Resources\FinancialForecastDetailResource;
use App\Http\Resources\FinancialForecastResource;
use App\Models\FinancialForecast;
use App\Services\FinancialForecastService;
use Illuminate\Http\JsonResponse;
use RuntimeException;

class FinancialForecastController extends Controller
{
    public function __construct(protected FinancialForecastService $service)
    {
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => FinancialForecastResource::collection($this->service->list()),
        ]);
    }

    public function show(FinancialForecast $financialForecast): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => new FinancialForecastDetailResource($financialForecast->load('generator')),
        ]);
    }

    public function store(GenerateForecastRequest $request): JsonResponse
    {
        try {
            $forecast = $this->service->generate(
                $request->user(),
                $request->validated('forecast_type'),
                $request->validated('horizon_key')
            );
        } catch (RuntimeException $e) {
            // PythonArimaForecastEngine throws RuntimeException both for
            // "service unreachable" (connection timeout/refused) and for
            // any not-yet-implemented forecast_type — either way, this is
            // a known, anticipated failure mode of the engine itself, not
            // an unexpected application bug, so it gets a clean 503
            // instead of falling through to Laravel's generic 500 handler
            // with a raw exception message.
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'data' => null,
            ], 503);
        }

        return response()->json([
            'success' => true,
            'message' => 'Forecast generated successfully.',
            'data' => new FinancialForecastDetailResource($forecast),
        ], 201);
    }
}