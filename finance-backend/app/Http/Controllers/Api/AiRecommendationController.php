<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AiRecommendationResource;
use App\Models\AiRecommendation;
use Illuminate\Http\JsonResponse;

class AiRecommendationController extends Controller
{
    /**
     * Read-only — AIRecommendations.jsx has no add/edit form. Recommendations
     * are assumed to be produced by a separate forecasting process, not
     * created through this endpoint.
     */
    public function index(): JsonResponse
    {
        $recommendations = AiRecommendation::query()
            ->with(['forecast', 'generator'])
            ->orderByDesc('generated_at')
            ->get();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => AiRecommendationResource::collection($recommendations),
        ]);
    }
}