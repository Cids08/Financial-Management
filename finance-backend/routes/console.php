<?php

namespace App\Console\Commands;

use App\Models\Budget;
use App\Models\Notification;
use App\Models\TaxObligation;
use Carbon\Carbon;
use Illuminate\Console\Command;


class SendDeadlineNotifications extends Command
{
    protected $signature = 'notifications:send-deadlines';

    protected $description = 'Create notifications for upcoming tax obligation and budget-period deadlines.';

    protected const TAX_WARNING_DAYS = 7;
    protected const BUDGET_WARNING_DAYS = 14;

    public function handle(): int
    {
        $taxCount = $this->notifyUpcomingTaxDeadlines();
        $budgetCount = $this->notifyUpcomingBudgetDeadlines();

        $this->info("Sent {$taxCount} tax deadline notification(s) and {$budgetCount} budget deadline notification(s).");

        return self::SUCCESS;
    }

    protected function notifyUpcomingTaxDeadlines(): int
    {
        $today = Carbon::today();
        $horizon = $today->copy()->addDays(self::TAX_WARNING_DAYS);
        $sent = 0;

        $obligations = TaxObligation::query()
            ->whereNull('payment_date')
            ->whereBetween('due_date', [$today, $horizon])
            ->whereNotNull('created_by')
            ->get();

        foreach ($obligations as $obligation) {
            $title = 'Tax filing deadline approaching';
            $daysLeft = $today->diffInDays(Carbon::parse($obligation->due_date), false);

            $alreadySentToday = Notification::where('user_id', $obligation->created_by)
                ->where('type', 'tax')
                ->where('title', $title)
                ->whereRaw('message ILIKE ?', ["%{$obligation->tax_type}%{$obligation->tax_period}%"])
                ->whereDate('created_at', $today)
                ->exists();

            if ($alreadySentToday) {
                continue;
            }

            Notification::create([
                'user_id' => $obligation->created_by,
                'title' => $title,
                'message' => sprintf(
                    '%s (%s) is due in %d day%s, on %s.',
                    $obligation->tax_type,
                    $obligation->tax_period,
                    max(0, $daysLeft),
                    $daysLeft === 1 ? '' : 's',
                    Carbon::parse($obligation->due_date)->format('M j, Y')
                ),
                // 'tax' is NOT in NOTIFICATION_TYPE_META on the frontend
                // (src/utils/notificationTypes.js) — renders with the
                // default Bell icon/route to /reports until that map is
                // extended with a 'tax' entry (suggest: Landmark icon,
                // route '/transactions/tax-obligations', matching the
                // icon already used for this module in menuData.js).
                'type' => 'tax',
                'is_read' => false,
            ]);

            $sent++;
        }

        return $sent;
    }

    protected function notifyUpcomingBudgetDeadlines(): int
    {
        $today = Carbon::today();
        $horizon = $today->copy()->addDays(self::BUDGET_WARNING_DAYS);
        $sent = 0;

        $budgets = Budget::query()
            ->whereNull('deleted_at')
            ->whereBetween('end_date', [$today, $horizon])
            ->get();

        foreach ($budgets as $budget) {
            $recipientId = $budget->approved_by ?? $budget->created_by;

            if (! $recipientId) {
                continue;
            }

            $title = 'Budget period ending soon';
            $daysLeft = $today->diffInDays(Carbon::parse($budget->end_date), false);

            $alreadySentToday = Notification::where('user_id', $recipientId)
                ->where('type', 'budget')
                ->where('title', $title)
                ->whereRaw('message ILIKE ?', ["%{$budget->budget_code}%"])
                ->whereDate('created_at', $today)
                ->exists();

            if ($alreadySentToday) {
                continue;
            }

            Notification::create([
                'user_id' => $recipientId,
                'title' => $title,
                'message' => sprintf(
                    '"%s" (%s) ends in %d day%s, on %s.',
                    $budget->budget_name,
                    $budget->budget_code,
                    max(0, $daysLeft),
                    $daysLeft === 1 ? '' : 's',
                    Carbon::parse($budget->end_date)->format('M j, Y')
                ),
                // 'budget' IS already mapped on the frontend — renders
                // with the right icon/route immediately.
                'type' => 'budget',
                'is_read' => false,
            ]);

            $sent++;
        }

        return $sent;
    }
}