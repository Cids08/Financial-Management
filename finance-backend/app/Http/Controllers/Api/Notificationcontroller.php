<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(protected NotificationService $notificationService)
    {
    }

    /**
     * GET /api/notifications
     * GET /api/notifications?unread=1
     */
    public function index(Request $request): JsonResponse
    {
        $unreadOnly = $request->boolean('unread');
        $paginated = $this->notificationService->listForUser($request->user(), $unreadOnly);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => NotificationResource::collection($paginated->items()),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /**
     * GET /api/notifications/unread-count
     *
     * Powers the small badge on the Header bell icon — kept as its own
     * lightweight endpoint so the frontend can poll it cheaply without
     * pulling the full list.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => [
                'unread_count' => $this->notificationService->unreadCount($request->user()),
            ],
        ]);
    }

    /**
     * PATCH /api/notifications/{notification}/read
     */
    public function markAsRead(Request $request, Notification $notification): JsonResponse
    {
        $notification = $this->notificationService->markAsRead($request->user(), $notification);

        return response()->json([
            'success' => true,
            'message' => 'Notification marked as read.',
            'data'    => new NotificationResource($notification),
        ]);
    }

    /**
     * PATCH /api/notifications/read-all
     */
    public function markAllAsRead(Request $request): JsonResponse
    {
        $updated = $this->notificationService->markAllAsRead($request->user());

        return response()->json([
            'success' => true,
            'message' => "{$updated} notification(s) marked as read.",
            'data'    => null,
        ]);
    }

    /**
     * DELETE /api/notifications/{notification}
     */
    public function destroy(Request $request, Notification $notification): JsonResponse
    {
        $this->notificationService->delete($request->user(), $notification);

        return response()->json([
            'success' => true,
            'message' => 'Notification removed.',
            'data'    => null,
        ]);
    }
}