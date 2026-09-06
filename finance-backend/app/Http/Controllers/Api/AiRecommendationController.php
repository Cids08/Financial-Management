<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AiRecommendationResource;
use App\Models\AiRecommendation;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiRecommendationController extends Controller
{
    /**
     * Read-only except for archive/restore — AIRecommendations.jsx has no
     * add/edit form. Recommendations are assumed to be produced by a
     * separate forecasting process, not created through this endpoint.
     */
    public function index(): JsonResponse
    {
        // withTrashed() so the frontend's Archived tab has data to filter
        // to — AiRecommendationResource exposes is_archived so the client
        // can split active vs archived from this single response, same
        // shape the frontend's showArchived filter already expects.
        $recommendations = AiRecommendation::withTrashed()
            ->with(['forecast', 'generator'])
            ->orderByDesc('generated_at')
            ->get();

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => AiRecommendationResource::collection($recommendations),
        ]);
    }

    /**
     * Soft-deletes the recommendation (archive, not destroy), same
     * convention as FinancialForecastService::archive() and every other
     * module's archive() — the row stays in the DB for audit purposes, it
     * just drops out of the default active listing.
     */
    public function archive(Request $request, AiRecommendation $aiRecommendation): JsonResponse
    {
        $aiRecommendation->deleted_by = $request->user()->id;
        $aiRecommendation->save();
        $aiRecommendation->delete();

        AuditLog::create([
            'user_id' => $request->user()->id,
            'module' => 'AI Recommendations',
            'action' => 'archive',
            'record_id' => $aiRecommendation->id,
            'activity_description' => "Archived AI recommendation #{$aiRecommendation->id} ({$aiRecommendation->category}).",
            'new_values' => null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Recommendation archived.',
            'data' => new AiRecommendationResource($aiRecommendation->load(['forecast', 'generator'])),
        ]);
    }

    /**
     * Restores a previously archived recommendation. Route uses
     * ->withTrashed() (see routes/api.php) so the {aiRecommendation} route
     * binding resolves trashed rows too — a normal lookup would 404
     * before this is reached, same as FinancialForecastController::restore().
     */
    public function restore(Request $request, AiRecommendation $aiRecommendation): JsonResponse
    {
        $aiRecommendation->deleted_by = null;
        $aiRecommendation->restore();

        AuditLog::create([
            'user_id' => $request->user()->id,
            'module' => 'AI Recommendations',
            'action' => 'restore',
            'record_id' => $aiRecommendation->id,
            'activity_description' => "Restored AI recommendation #{$aiRecommendation->id} ({$aiRecommendation->category}).",
            'new_values' => null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Recommendation restored.',
            'data' => new AiRecommendationResource($aiRecommendation->load(['forecast', 'generator'])),
        ]);
    }
}