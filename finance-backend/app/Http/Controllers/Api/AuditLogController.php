<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Services\AuditLogQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function __construct(protected AuditLogQueryService $auditLogQueryService)
    {
    }

    /**
     * GET /api/audit-logs?search=&module=&action=&user_id=&record_id=&date_from=&date_to=
     *
     * Read-only — no FormRequest/authorize() here. Access is gated at the
     * route level (see routes/api.php note below), matching how this app
     * already gates Settings' branding endpoints on a dedicated permission
     * string rather than a per-request check.
     *
     * record_id added alongside module: without it, callers wanting a
     * single record's history (e.g. one Accounts Payable bill's activity
     * log) have no way to scope the query and get every log row for that
     * whole module instead — module + record_id together is what actually
     * identifies "this one bill's" trail, since record_id alone isn't
     * unique across modules (bill #12 and, say, a Customer #12 would
     * collide without also filtering on module).
     */
    public function index(Request $request): JsonResponse
    {
        $paginated = $this->auditLogQueryService->list($this->filtersFromRequest($request));

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => AuditLogResource::collection($paginated->items()),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /**
     * GET /api/audit-logs/export?search=&module=&action=&user_id=&record_id=&date_from=&date_to=
     *
     * Same filters as index(), unpaginated (capped — see
     * AuditLogQueryService::EXPORT_LIMIT) — the frontend turns this into
     * a CSV client-side, same pattern as Settings.jsx's activity export.
     */
    public function export(Request $request): JsonResponse
    {
        $logs = $this->auditLogQueryService->exportList($this->filtersFromRequest($request));

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => AuditLogResource::collection($logs),
        ]);
    }

    /**
     * GET /api/audit-logs/modules — distinct module names for the filter
     * dropdown on the frontend.
     */
    public function modules(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => $this->auditLogQueryService->distinctModules(),
        ]);
    }

    /**
     * @return array{search?: string, module?: string, action?: string, user_id?: ?int, record_id?: ?int, date_from?: string, date_to?: string}
     */
    protected function filtersFromRequest(Request $request): array
    {
        return [
            'search'    => $request->string('search')->toString(),
            'module'    => $request->string('module')->toString(),
            'action'    => $request->string('action')->toString(),
            'user_id'   => $request->integer('user_id') ?: null,
            'record_id' => $request->integer('record_id') ?: null,
            'date_from' => $request->string('date_from')->toString(),
            'date_to'   => $request->string('date_to')->toString(),
        ];
    }
}