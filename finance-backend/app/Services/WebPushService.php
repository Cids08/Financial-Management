<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Throwable;

/**
 * Thin wrapper around minishlink/web-push that:
 *
 *   - builds the VAPID auth block from config('webpush.vapid')
 *   - sends a push payload to one user's subscriptions
 *   - self-heals: expired (410/404) subscriptions are deleted so they
 *     never retried forever
 *   - degrades to a no-op when VAPID keys are not configured
 */
class WebPushService
{
    protected bool $configured = false;

    public function __construct()
    {
        $vapid = config('webpush.vapid');

        if (! empty($vapid['public_key']) && ! empty($vapid['private_key'])) {
            $this->configured = true;
        }
    }

    public function isConfigured(): bool
    {
        return $this->configured;
    }

    /**
     * Push a notification to every active subscription the user owns.
     * Returns how many messages were sent (best effort).
     */
    public function sendToUser(User $user, Notification $notification): int
    {
        if (! $this->configured) {
            return 0;
        }

        $subscriptions = PushSubscription::where('user_id', $user->id)->get();
        if ($subscriptions->isEmpty()) {
            return 0;
        }

        try {
            $webPush = new WebPush($this->auth());
            $webPush->setDefaultOptions([
                'TTL'     => config('webpush.default_ttl', 86400),
                'timeout' => config('webpush.default_timeout', 30),
            ]);

            foreach ($subscriptions as $subscription) {
                $payload = json_encode($this->payload($notification, (bool) $subscription->privacy_mode));
                if ($payload === false) {
                    continue;
                }

                $webPush->queueNotification(
                    Subscription::create([
                        'endpoint' => $subscription->endpoint,
                        'keys'     => $subscription->keys,
                    ]),
                    $payload
                );
            }

            $sent = 0;
            foreach ($webPush->flush() as $report) {
                if ($report->isSuccess()) {
                    $sent++;

                    continue;
                }

                // 404/410 = the browser removed our subscription (or the
                // device is gone). Drop it so we stop paying the cost.
                $status = $report->getResponse()?->getStatusCode();
                if (in_array($status, [404, 410], true)) {
                    PushSubscription::where('endpoint', $report->getEndpoint())->delete();
                } else {
                    Log::warning("Web push failed for {$report->getEndpoint()}: status {$status}");
                }
            }

            return $sent;
        } catch (Throwable $e) {
            Log::warning("Web push error: {$e->getMessage()}");

            return 0;
        }
    }

    protected function auth(): array
    {
        $vapid = config('webpush.vapid');

        return [
            'VAPID' => [
                'subject'    => $vapid['subject'],
                'publicKey'  => $vapid['public_key'],
                'privateKey' => $vapid['private_key'],
            ],
        ];
    }

    protected function payload(Notification $notification, bool $redacted = false): array
    {
        $data = [
            'url'        => '/notifications',
            'id'         => $notification->id,
            'type'       => $notification->type,
            'module'     => $notification->module,
            'created_at' => $notification->created_at?->toIso8601String(),
        ];

        if ($redacted) {
            // Privacy Mode: no amounts, names, or numbers on the screen or
            // in Action Center. The module label alone is harmless context.
            return [
                'title' => 'FMS: ' . ($this->moduleLabel($notification->module) ?? 'New notification'),
                'body'  => 'You have a new in-app notification. Open the app to view the details.',
                'tag'   => 'fms-' . $notification->id,
                'data'  => $data,
            ];
        }

        return [
            'title' => $notification->title,
            'body'  => $notification->message,
            'tag'   => 'fms-' . $notification->id,
            'data'  => $data,
        ];
    }

    protected function moduleLabel(?string $module): ?string
    {
        $labels = [
            'receivable'        => 'Receivable',
            'payable'           => 'Payable',
            'budget'            => 'Budget',
            'expense'           => 'Expense',
            'collection'        => 'Collection',
            'disbursement'      => 'Disbursement',
            'tax'               => 'Tax',
            'forecast'          => 'Forecast',
            'ai_recommendation' => 'AI Recommendation',
            'general'           => 'General',
        ];

        return $labels[$module] ?? null;
    }
}