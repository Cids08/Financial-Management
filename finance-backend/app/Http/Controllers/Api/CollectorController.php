<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCollectorRequest;
use App\Http\Requests\UpdateCollectorRequest;
use App\Http\Resources\CollectorResource;
use App\Models\Collector;
use App\Services\CollectorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CollectorController extends Controller
{
    public function __construct(protected CollectorService $collectorService)
    {
    }

    /**
     * GET /api/collectors?search=&status=active|inactive&archived=0|1
     */
    public function index(Request $request): JsonResponse
    {
        $paginated = $this->collectorService->list([
            'search'   => $request->string('search')->toString(),
            'status'   => $request->string('status')->toString(),
            'archived' => $request->boolean('archived'),
        ]);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => CollectorResource::collection($paginated->items()),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /**
     * GET /api/collectors/available-users?collector_id=
     *
     * Powers the "Linked User Account" dropdown in Collectors.jsx's
     * Add/Edit modal — Users with the 'collector' role who aren't
     * already linked to a different Collector record.
     *
     * ?collector_id= is passed when editing an existing collector, so
     * that collector's own currently-linked user still appears in the
     * options (see CollectorService::availableUsers()'s docblock).
     */
    public function availableUsers(Request $request): JsonResponse
    {
        $collectorId = $request->integer('collector_id') ?: null;

        $users = $this->collectorService->availableUsers($collectorId);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $users,
        ]);
    }

    public function store(StoreCollectorRequest $request): JsonResponse
    {
        $collector = $this->collectorService->create($request->user(), $request->validated());

        return response()->json([
            'success'            => true,
            'message'            => $collector->temporary_password
                ? "Collector and user account added successfully."
                : 'Collector added successfully.',
            'data'               => new CollectorResource($collector),
            'temporary_password' => $collector->temporary_password ?? null,
        ], 201);
    }

    public function update(UpdateCollectorRequest $request, Collector $collector): JsonResponse
    {
        $collector = $this->collectorService->update($request->user(), $collector, $request->validated());

        return response()->json([
            'success' => true,
            'message' => 'Collector updated successfully.',
            'data'    => new CollectorResource($collector),
        ]);
    }

    /**
     * DELETE /api/collectors/{collector} — archives (soft delete), never
     * a hard delete, matching the mock's Archive button.
     */
    public function archive(Request $request, Collector $collector): JsonResponse
    {
        $collector = $this->collectorService->archive($request->user(), $collector);

        return response()->json([
            'success' => true,
            'message' => 'Collector archived.',
            'data'    => new CollectorResource($collector),
        ]);
    }

    /**
     * PATCH /api/collectors/{collector}/restore
     */
    public function restore(Request $request, int $collector): JsonResponse
    {
        $collector = Collector::onlyTrashed()->findOrFail($collector);
        $collector = $this->collectorService->restore($request->user(), $collector);

        return response()->json([
            'success' => true,
            'message' => 'Collector restored.',
            'data'    => new CollectorResource($collector),
        ]);
    }

    /**
     * GET /api/collectors/{collector}/efficiency?period=day|week|month|year
     * GET /api/collections/{collector}/efficiency (same handler, alt route)
     *
     * Powers Collectors.jsx's EfficiencyModal — returns a list of recent
     * period buckets (not a single number), each with collected vs.
     * target and a computed efficiency %.
     */
    public function efficiency(Request $request, Collector $collector): JsonResponse
    {
        $user = $request->user();

        // A Collector may only view their own efficiency stats. Not
        // currently reachable under RolesAndPermissionsSeeder's default
        // grants (the collector role doesn't get collectors.view by
        // default) — but that's an admin-editable permission, not a
        // code-level guarantee, so this check stays regardless of what's
        // currently seeded.
        if ($user->hasRole('collector') && $user->collector?->id !== $collector->id) {
            abort(403, 'You may only view your own efficiency stats.');
        }

        $period = $request->string('period')->toString();
        if (! in_array($period, ['day', 'week', 'month', 'year'], true)) {
            $period = 'month';
        }

        $rows = $this->collectorService->getEfficiency($collector, $period);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $rows,
        ]);
    }
}