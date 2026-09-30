<?php

namespace App\Observers;

use App\Events\DataUpdated;
use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\ActivityLog;
use App\Models\AiRecommendation;
use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\ChartOfAccount;
use App\Models\Collection;
use App\Models\Collector;
use App\Models\Customer;
use App\Models\Department;
use App\Models\Disbursement;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\FinancialForecast;
use App\Models\FixedAsset;
use App\Models\SupportingDocument;
use App\Models\Supplier;
use App\Models\Role;
use App\Models\TaxObligation;
use App\Models\Title;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Broadcasting-ready model observer.
 *
 * Registered for every model the frontend pages render. On each relevant
 * lifecycle event it dispatches a DataUpdated refetch signal carrying the
 * page's module slug.
 *
 * The observer is a no-op when:
 *   - running in console (seeds/migrations/tinker must not spam Reverb), or
 *   - broadcasting is disabled (BROADCAST_CONNECTION !== reverb).
 *
 * A failed broadcast is swallowed so the model write that triggered it
 * never fails because a websocket is briefly unreachable.
 */
class DataUpdateObserver
{
    /**
     * Map model class -> module slug. Slugs must match the module strings
     * the frontend subscribes to (see useDataUpdates / echo.js payloads).
     */
    protected const MODULE_MAP = [
        AccountsPayable::class   => 'accounts-payable',
        AccountsReceivable::class => 'accounts-receivable',
        ActivityLog::class       => 'audit-logs',
        AiRecommendation::class  => 'ai-recommendations',
        AuditLog::class          => 'audit-logs',
        Budget::class            => 'budgets',
        CashAccount::class       => 'cash-accounts',
        ChartOfAccount::class    => 'chart-of-accounts',
        Collection::class        => 'collections',
        Collector::class         => 'collectors',
        Customer::class          => 'customers',
        Department::class        => 'departments',
        Disbursement::class      => 'disbursements',
        Expense::class           => 'expenses',
        ExpenseCategory::class   => 'expense-categories',
        FinancialForecast::class => 'forecasts',
        FixedAsset::class        => 'fixed-assets',
        Supplier::class          => 'suppliers',
        TaxObligation::class     => 'tax-obligations',
        Title::class             => 'titles',
        User::class              => 'users',
        Role::class              => 'roles',
    ];

    /**
     * SupportingDocument is polymorphic — resolve its module from the
     * reference_type class it was attached to, falling back to general.
     */
    protected static function resolveModule(Model $model): ?string
    {
        if ($model instanceof SupportingDocument) {
            $reference = $model->reference_type;

            return self::MODULE_MAP[$reference] ?? 'documents';
        }

        return self::MODULE_MAP[get_class($model)] ?? null;
    }

    /**
     * Model class names the observer is registered for. Used by
     * AppServiceProvider::boot() to register the observer on each.
     *
     * @return list<class-string<Model>>
     */
    public static function modelClasses(): array
    {
        return array_keys(self::MODULE_MAP);
    }

    protected static function broadcast(Model $model, string $action): void
    {
        if (app()->runningInConsole() || config('broadcasting.default') !== 'reverb') {
            return;
        }

        $module = self::resolveModule($model);

        if ($module === null) {
            return;
        }

        try {
            DataUpdated::dispatch($module, $action, $model->getKey());
        } catch (Throwable $e) {
            Log::warning("Failed to broadcast {$module}.{$action}: {$e->getMessage()}");
        }
    }

    public function created(Model $model): void
    {
        self::broadcast($model, 'created');
    }

    public function updated(Model $model): void
    {
        self::broadcast($model, 'updated');
    }

    public function deleted(Model $model): void
    {
        self::broadcast($model, 'deleted');
    }

    public function restored(Model $model): void
    {
        self::broadcast($model, 'restored');
    }
}