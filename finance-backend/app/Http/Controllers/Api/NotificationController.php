<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use App\Models\Notification;
use App\Services\NotificationService;
use App\Services\WebPushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class NotificationController extends Controller
{
    public function __construct(
        protected NotificationService $notificationService,
        protected WebPushService $webPush
    ) {
    }

    /**
     * GET /api/notifications
     * GET /api/notifications?unread=1
     * GET /api/notifications?type[]=Warning&type[]=Error   (severity filter)
     * GET /api/notifications?module[]=budget&module[]=tax  (unit filter)
     * GET /api/notifications?per_page=5   (header bell preview)
     * GET /api/notifications?per_page=20  (full Notifications page)
     */
    public function index(Request $request): JsonResponse
    {
        $unreadOnly = $request->boolean('unread');

        $perPage = (int) $request->input('per_page', 15);
        if ($perPage < 1 || $perPage > 100) {
            $perPage = 15;
        }

        $modules = $this->arrayParam($request, 'module');
        $types = $this->arrayParam($request, 'type');

        $paginated = $this->notificationService->listForUser($request->user(), $unreadOnly, $perPage, $modules, $types);

        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => NotificationResource::collection($paginated->items())->resolve(),
            'meta'    => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /**
     * POST /api/notifications/subscribe
     *
     * Body: { endpoint, keys: { p256dh, auth } } — produced by the browser
     * PushManager when the service worker subscription is created.
     */
    public function subscribe(Request $request): JsonResponse
    {
        $payload = $request->all();

        $subscription = $this->notificationService->subscribe($request->user(), $payload);

        return response()->json([
            'success' => true,
            'message' => 'Push notifications enabled.',
            'data'    => [
                'id'       => $subscription->id,
                'endpoint' => $subscription->endpoint,
            ],
        ]);
    }

    /**
     * DELETE /api/notifications/subscribe
     *
     * Body: { endpoint } — removes just that browser's subscription.
     */
    public function unsubscribe(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'endpoint' => ['required', 'url'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'endpoint is required.',
            ], 422);
        }

        $removed = $this->notificationService->unsubscribe($request->user(), $request->input('endpoint'));

        return response()->json([
            'success' => true,
            'message' => $removed ? 'Push notifications disabled.' : 'No matching subscription.',
            'data'    => null,
        ]);
    }

    /**
     * PATCH /api/notifications/subscribe
     *
     * Body: { endpoint, privacy_mode: bool } — flips privacy for one
     * subscription so future toasts respect the user's Privacy Mode toggle
     * without re-subscribing.
     */
    public function updateSubscriptionPrivacy(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'endpoint'     => ['required', 'url'],
            'privacy_mode' => ['required', 'boolean'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'endpoint and privacy_mode are required.',
            ], 422);
        }

        $subscription = $this->notificationService->setSubscriptionPrivacy(
            $request->user(),
            $request->input('endpoint'),
            $request->boolean('privacy_mode')
        );

        return response()->json([
            'success' => true,
            'message' => $subscription !== null ? 'Push privacy updated.' : 'No matching subscription.',
            'data'    => $subscription ? ['id' => $subscription->id, 'privacy_mode' => $subscription->privacy_mode] : null,
        ]);
    }

    /**
     * GET /api/notifications/vapid-key
     *
     * Exposes only the PUBLIC VAPID key — the frontend needs it to create
     * the browser subscription. Private key never leaves the server.
     */
    public function vapidKey(): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => '',
            'data'    => [
                'vapid_public_key' => config('webpush.vapid.public_key'),
                'push_enabled'     => $this->webPush->isConfigured(),
            ],
        ]);
    }

    /**
     * Accepts a value passed either as a scalar ("module=budget") or as an
     * array ("module[]=budget&module[]=tax") and returns a clean string[]
     * (whitelisted to the given max count for safety).
     */
    protected function arrayParam(Request $request, string $key): array
    {
        $value = $request->input($key);

        if ($value === null) {
            return [];
        }

        $items = is_array($value) ? $value : [$value];

        return array_values(array_filter(array_map(
            fn ($v) => is_string($v) ? trim($v) : '',
            array_slice($items, 0, 20)
        ), fn ($v) => $v !== ''));
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