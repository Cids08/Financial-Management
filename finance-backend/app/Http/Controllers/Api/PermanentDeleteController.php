<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\AiRecommendation;
use App\Models\AuditLog;
use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\Collection;
use App\Models\Collector;
use App\Models\Customer;
use App\Models\Department;
use App\Models\Disbursement;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\FinancialForecast;
use App\Models\FixedAsset;
use App\Models\Supplier;
use App\Models\TaxObligation;
use App\Models\Title;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\QueryException;

/**
 * Permanently deletes ARCHIVED (soft-deleted) records across every entity.
 *
 * Only Admin / Super Admin may do this; the frontend hides the button for
 * everyone else and this controller rejects everyone else too (belt and
 * braces, mirroring RestrictsMasterDataToAdmins). Also the single source of
 * truth for the automatic retention purge: PurgeArchivedRecords and
 * RetentionPurgeService iterate the same ENTITIES manifest.
 */
class PermanentDeleteController extends Controller
{
    /**
     * slug => [model class, manage permission, human-readable label].
     * Keep in sync with the archive/restore capabilities in routes/api.php.
     */
    public const ENTITIES = [
        'users' => ['model' => User::class, 'permission' => 'users.manage', 'label' => 'user'],
        'departments' => ['model' => Department::class, 'permission' => 'departments.manage', 'label' => 'department'],
        'titles' => ['model' => Title::class, 'permission' => 'users.manage', 'label' => 'job title'],
        'customers' => ['model' => Customer::class, 'permission' => 'customers.manage', 'label' => 'customer'],
        'suppliers' => ['model' => Supplier::class, 'permission' => 'suppliers.manage', 'label' => 'supplier'],
        'collectors' => ['model' => Collector::class, 'permission' => 'collectors.manage', 'label' => 'collector'],
        'cash-accounts' => ['model' => CashAccount::class, 'permission' => 'cash-accounts.manage', 'label' => 'cash account'],
        'fixed-assets' => ['model' => FixedAsset::class, 'permission' => 'fixed-assets.manage', 'label' => 'fixed asset'],
        'expense-categories' => ['model' => ExpenseCategory::class, 'permission' => 'expense-categories.manage', 'label' => 'expense category'],
        'accounts-receivable' => ['model' => AccountsReceivable::class, 'permission' => 'ar.manage', 'label' => 'invoice'],
        'accounts-payable' => ['model' => AccountsPayable::class, 'permission' => 'ap.manage', 'label' => 'payable'],
        'expenses' => ['model' => Expense::class, 'permission' => 'expenses.manage', 'label' => 'expense'],
        'tax-obligations' => ['model' => TaxObligation::class, 'permission' => 'tax.manage', 'label' => 'tax obligation'],
        'ai-recommendations' => ['model' => AiRecommendation::class, 'permission' => 'ai.view', 'label' => 'AI recommendation'],
        'forecasts' => ['model' => FinancialForecast::class, 'permission' => 'forecasting.manage', 'label' => 'forecast'],
        'collections' => ['model' => Collection::class, 'permission' => 'collections.manage', 'label' => 'collection'],
        'budgets' => ['model' => Budget::class, 'permission' => 'budgets.manage', 'label' => 'budget'],
        'disbursements' => ['model' => Disbursement::class, 'permission' => 'disbursements.manage|disbursements.approve|disbursements.release', 'label' => 'disbursement'],
    ];

    public function destroy(Request $request, string $entity, int $id): JsonResponse
    {
        if (! isset(self::ENTITIES[$entity])) {
            return response()->json(['success' => false, 'message' => 'Unknown archived entity.'], 404);
        }

        $user = $request->user();
        if (! $user->hasAnyRole(['admin', 'super-admin'])) {
            return response()->json([
                'success' => false,
                'message' => 'Only administrators can permanently delete archived records.',
            ], 403);
        }

        [$model, , $label] = self::ENTITIES[$entity];
        $record = $model::onlyTrashed()->find($id);

        if (! $record) {
            return response()->json(['success' => false, 'message' => "Archived {$label} not found."], 404);
        }

        try {
            DB::transaction(function () use ($record, $model, $user, $id, $label, $entity) {
                AuditLog::create([
                    'user_id' => $user->id,
                    'module' => $entity,
                    'action' => 'permanent_delete',
                    'record_id' => $id,
                    'activity_description' => "Permanently deleted an archived {$label}.",
                    'old_values' => $record->toArray(),
                    'new_values' => [],
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ]);

                $record->forceDelete();
            });
        } catch (QueryException $e) {
            // e.g. disbursements.cash_account_id -> cash_accounts is a
            // RESTRICT FK, so a cash account still referenced by any child
            // row (even a soft-deleted one) cannot be purged.
            return response()->json([
                'success' => false,
                'message' => "This archived {$label} is still referenced by existing records and cannot be permanently deleted. Remove or restore the related records first.",
            ], 409);
        }

        return response()->json([
            'success' => true,
            'message' => "Archived {$label} permanently deleted.",
        ]);
    }
}