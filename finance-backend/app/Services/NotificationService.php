<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Log;
use Throwable;

class NotificationService
{
    protected const PER_PAGE = 15;

    /**
     * The DB `type` column is an enum restricted to these four severity
     * levels. Anything else was a historical bug that caused the INSERT to
     * fail (Postgres enum rejection) — normalized away below.
     */
    protected const SEVERITIES = ['Info', 'Success', 'Warning', 'Error'];

    /**
     * Legacy callers used module names ("budget", "expense", ...) as `type`.
     * Translate those to a sensible severity + module so old code keeps
     * working AND rows actually insert (the enum previously rejected them).
     */
    protected const LEGACY_MODULES = [
        'receivable'         => 'Info',
        'payable'            => 'Info',
        'budget'             => 'Warning',
        'budget_over'        => 'Error',
        'budget_warning'     => 'Warning',
        'expense'            => 'Info',
        'collection'         => 'Info',
        'disbursement'       => 'Info',
        'forecast'           => 'Info',
        'ai_recommendation'  => 'Info',
        'tax'                => 'Info',
    ];

    public function __construct(protected WebPushService $webPush)
    {
    }

    /**
     * Paginated notifications for the given user, most recent first.
     *
     * FIX: previously hardcoded self::PER_PAGE regardless of what the
     * frontend requested (Notifications.jsx sends 20, the header bell
     * preview sends 5) — the controller/hook both imply per_page is
     * configurable, so it should actually be honored here.
     */
    public function listForUser(
        User $user,
        bool $unreadOnly = false,
        int $perPage = self::PER_PAGE,
        ?array $modules = null,
        ?array $types = null
    ): LengthAwarePaginator {
        $query = Notification::forUser($user->id)->latest();

        if ($unreadOnly) {
            $query->unread();
        }

        if ($modules !== null && $modules !== []) {
            $query->forModules($modules);
        }

        if ($types !== null && $types !== []) {
            $query->forTypes($types);
        }

        return $query->paginate($perPage);
    }

    public function unreadCount(User $user): int
    {
        return Notification::forUser($user->id)->unread()->count();
    }

    /**
     * Create a notification for a single user.
     *
     * $type must be a severity (Info/Success/Warning/Error). Legacy module
     * strings like "budget" are normalized to a severity and a $module.
     * When $module is not given it is inferred from the copy.
     */
    public function create(int $userId, string $type, string $title, string $message, ?string $module = null): Notification
    {
        $normalized = $this->normalize($type);
        $resolvedModule = $module !== null
            ? $this->normalizeModule($module)
            : ($normalized['module'] ?? $this->inferModule($title, $message));

        $notification = Notification::create([
            'user_id' => $userId,
            'type'    => $normalized['type'],
            'module'  => $resolvedModule,
            'title'   => $title,
            'message' => $message,
            'is_read' => false,
        ]);

        $this->dispatchPush($userId, $notification);

        return $notification;
    }

    /**
     * Convenience wrapper for notifying several users at once — e.g. every
     * Admin when a company-wide event happens (a budget is exceeded, a
     * disbursement is released), rather than just the record's owner.
     *
     * @param  iterable<int>  $userIds
     * @return list<Notification>
     */
    public function createForMany(iterable $userIds, string $type, string $title, string $message, ?string $module = null): array
    {
        $created = [];

        foreach ($userIds as $userId) {
            $created[] = $this->create($userId, $type, $title, $message, $module);
        }

        return $created;
    }

    public function markAsRead(User $user, Notification $notification): Notification
    {
        $this->authorizeOwnership($user, $notification);

        if (! $notification->is_read) {
            $notification->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
        }

        return $notification->fresh();
    }

    public function markAllAsRead(User $user): int
    {
        return Notification::forUser($user->id)
            ->unread()
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
    }

    public function delete(User $user, Notification $notification): void
    {
        $this->authorizeOwnership($user, $notification);

        $notification->delete();
    }

    /*
    |--------------------------------------------------------------------------
    | Push subscriptions
    |--------------------------------------------------------------------------
    */

    /**
     * Store (or refresh) a Web Push subscription for the user. Returns the
     * model or throws 422 when the payload is malformed.
     *
     * $sub['privacy_mode'] mirrors the frontend's Privacy Mode toggle so
     * OS toasts never leak amounts/names onto the screen when masking is on.
     *
     * @param  array{endpoint: string, keys: array{p256dh?: string, auth?: string}, privacy_mode?: bool}  $sub
     */
    public function subscribe(User $user, array $sub): PushSubscription
    {
        $endpoint = filter_var($sub['endpoint'] ?? '', FILTER_VALIDATE_URL);
        $keys = $sub['keys'] ?? [];

        if ($endpoint === false || empty($keys['p256dh']) || empty($keys['auth'])) {
            throw new HttpResponseException(response()->json([
                'success' => false,
                'message' => 'Invalid push subscription — expected an endpoint plus p256dh/auth keys.',
            ], 422));
        }

        return PushSubscription::updateOrCreate(
            ['user_id' => $user->id, 'endpoint' => $endpoint],
            [
                'keys'         => [
                    'p256dh' => $keys['p256dh'],
                    'auth'   => $keys['auth'],
                ],
                'privacy_mode' => (bool) ($sub['privacy_mode'] ?? false),
                'user_agent'   => mb_substr((string) request()->userAgent(), 0, 255),
            ]
        );
    }

    /**
     * Flip privacy on a single existing subscription (called when the user
     * toggles Privacy Mode so future toasts respect the new setting).
     */
    public function setSubscriptionPrivacy(User $user, string $endpoint, bool $privacyMode): ?PushSubscription
    {
        $subscription = PushSubscription::where('user_id', $user->id)
            ->where('endpoint', $endpoint)
            ->first();

        if ($subscription === null) {
            return null;
        }

        $subscription->update(['privacy_mode' => $privacyMode]);

        return $subscription->fresh();
    }

    public function unsubscribe(User $user, string $endpoint): bool
    {
        return (bool) PushSubscription::where('user_id', $user->id)
            ->where('endpoint', $endpoint)
            ->delete();
    }

    /**
     * A notification belongs to exactly one user; never let one user
     * read, mark, or delete another user's notification via a guessed ID.
     */
    protected function authorizeOwnership(User $user, Notification $notification): void
    {
        abort_if($notification->user_id !== $user->id, 403, 'This notification does not belong to you.');
    }

    /*
    |--------------------------------------------------------------------------
    | Type / module normalization
    |--------------------------------------------------------------------------
    */

    protected function normalize(string $type): array
    {
        if (in_array($type, self::SEVERITIES, true)) {
            return ['type' => $type, 'module' => null];
        }

        $lookup = strtolower($type);

        // Legacy module strings used as `type`. Severity is best-effort;
        // the module value survives so filtering still works.
        return [
            'type'   => self::LEGACY_MODULES[$lookup] ?? 'Info',
            'module' => array_key_exists($lookup, self::LEGACY_MODULES) ? $lookup : null,
        ];
    }

    protected function normalizeModule(string $module): string
    {
        $clean = preg_replace('/[^a-z0-9_]/', '', strtolower(trim($module)));
        if ($clean === '' || $clean === 'general') {
            return 'general';
        }

        return $clean;
    }

    protected function inferModule(string $title, string $message): ?string
    {
        $text = strtolower(($title ?? '') . ' ' . ($message ?? ''));

        foreach (array_keys(self::LEGACY_MODULES) as $module) {
            if (str_contains($text, $module)) {
                return $this->normalizeModule($module);
            }
        }

        if (str_contains($text, 'tax') || str_contains($text, 'bir')) {
            return 'tax';
        }

        return null;
    }

    /**
     * Fire-and-forget OS push. Never lets a push failure take down the
     * request that created the in-app notification.
     */
    protected function dispatchPush(int $userId, Notification $notification): void
    {
        try {
            $user = User::find($userId);
            if ($user !== null) {
                $this->webPush->sendToUser($user, $notification);
            }
        } catch (Throwable $e) {
            Log::warning("Failed to dispatch push notification: {$e->getMessage()}");
        }
    }
}