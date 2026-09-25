<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds a `module` dimension to notifications so the Notifications page
     * can filter by business unit (receivable, payable, budget, expense,
     * collection, disbursement, tax, forecast, ...). The existing `type`
     * column stays severity-only (Info/Success/Warning/Error) — module is a
     * free-form string, deliberately NOT an enum, so new units never
     * require a migration.
     *
     * Also creates the push_subscriptions table that powers real OS-level
     * web push notifications (Web Push / service worker subscriptions).
     */
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table) {
            $table->string('module', 40)->nullable()->after('type');
            $table->index(['user_id', 'is_read']);
        });

        // Best-effort backfill: derive the module from the notification
        // copy for legacy rows (all rows prior to this migration carried
        // only a severity in `type`).
        foreach (['tax', 'budget', 'expense', 'collection', 'disbursement', 'receivable', 'payable', 'forecast'] as $module) {
            DB::table('notifications')
                ->whereNull('module')
                ->where(function ($q) use ($module) {
                    $q->where('title', 'ilike', "%{$module}%")
                        ->orWhere('message', 'ilike', "%{$module}%");
                })
                ->update(['module' => $module]);
        }

        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('endpoint');
            $table->json('keys');
            $table->boolean('privacy_mode')->default(false);
            $table->string('user_agent', 255)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'endpoint']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');

        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'is_read']);
            $table->dropColumn('module');
        });
    }
};