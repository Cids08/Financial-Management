<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GenerateForecastRequest;
use App\Http\Resources\FinancialForecastDetailResource;
use App\Http\Resources\FinancialForecastResource;
use App\Models\FinancialForecast;
use App\Services\FinancialForecastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class FinancialForecastController extends Controller
{
    public function __construct(protected FinancialForecastService $service)
    {
    }

    /**
     * ?status=active (default) | archived | all
     * 'active' relies on FinancialForecast's default SoftDeletes global
     * scope to exclude archived rows — same convention as every other
     * archive/restore module in this app (customers, suppliers, etc.).
     */
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data' => FinancialForecastResource::collection(
                $this->service->list($request->query('status', 'active'))
            ),
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

    /**
     * Soft-delete (archive) a forecast. Route param resolves normally
     * here — archiving only ever targets a currently-active (non-trashed)
     * forecast, so no ->withTrashed() needed on this route.
     */
    public function archive(Request $request, FinancialForecast $financialForecast): JsonResponse
    {
        $this->service->archive($request->user(), $financialForecast);

        return response()->json([
            'success' => true,
            'message' => 'Forecast archived successfully.',
            'data' => null,
        ]);
    }

    /**
     * Restores a previously archived forecast. The route this action is
     * bound to MUST have ->withTrashed() (see routes/api.php) — without
     * it, Laravel's implicit route-model-binding excludes soft-deleted
     * rows and this would 404 before ever reaching this method.
     */
    public function restore(Request $request, FinancialForecast $financialForecast): JsonResponse
    {
        $this->service->restore($request->user(), $financialForecast);

        return response()->json([
            'success' => true,
            'message' => 'Forecast restored successfully.',
            'data' => null,
        ]);
    }
}