<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GenerateForecastRequest;
use App\Http\Resources\FinancialForecastDetailResource;
use App\Http\Resources\FinancialForecastResource;
use App\Models\FinancialForecast;
use App\Services\FinancialForecastService;
use Illuminate\Http\JsonResponse;

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
        $forecast = $this->service->generate(
            $request->user(),
            $request->validated('forecast_type'),
            $request->validated('horizon_key')
        );

        return response()->json([
            'success' => true,
            'message' => 'Forecast generated successfully.',
            'data' => new FinancialForecastDetailResource($forecast),
        ], 201);
    }
}