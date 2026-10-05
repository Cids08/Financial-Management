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
use App\Models\JournalEntryLine;
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

    /**
     * slug => normalised journal reference_type keys.
     *
     * journal_entry_lines stores its source as an unconstrained polymorphic
     * pair (reference_type / reference_id) with NO foreign key, so the database
     * happily lets a permanent delete orphan a posted journal entry: the
     * General Ledger keeps debits and credits whose source document no longer
     * exists, and the audit trail silently loses its counterparty.
     *
     * Over time the writers have used snake_case ('accounts_receivable'),
     * Title Case ('Disbursement') and plural ('Expenses', 'Collections') forms
     * for the same source, so every spelling that can legitimately exist in the
     * column is listed here. Keys are normalised with the same rule
     * JournalSourceResolver::groupKey() uses: strip every non-letter, lowercase.
     *
     * Entities absent from this map carry no journal lines of their own, so
     * there is nothing to block.
     */
    private const JOURNAL_REFERENCE_KEYS = [
        'accounts-receivable' => ['accountsreceivable', 'accountsreceivables', 'receivable', 'receivables', 'ar'],
        'accounts-payable'    => ['accountspayable', 'accountspayables', 'payable', 'payables', 'ap'],
        'collections'         => ['collection', 'collections'],
        'disbursements'       => ['disbursement', 'disbursements', 'dv'],
        'expenses'            => ['expense', 'expenses', 'appmodelsexpense'],
        'budgets'             => ['budget', 'budgets'],
        'tax-obligations'     => ['taxobligation', 'taxobligations', 'tax'],
        'fixed-assets'        => ['fixedasset', 'fixedassetdepreciation', 'depreciation'],
    ];

    /**
     * Counts posted journal lines that point at this record.
     *
     * Shared with RetentionPurgeService so the scheduled/lazy retention purge
     * applies exactly the same rule as the manual admin purge — otherwise the
     * automated job keeps manufacturing the orphans this check exists to stop.
     *
     * Filtering happens in PHP because the same reference_id is reused across
     * unrelated entities (expense #15 and collection #15 are different rows),
     * and the column's spelling is inconsistent, so a plain SQL equality on
     * reference_type would either miss real references or match a stranger's.
     * reference_id is always the id of an archived record, so the row count here
     * stays small.
     */
    public static function postedJournalLineCount(string $slug, int $id): int
    {
        $accepted = self::JOURNAL_REFERENCE_KEYS[$slug] ?? null;

        if ($accepted === null) {
            return 0;
        }

        return JournalEntryLine::query()
            ->where('reference_id', $id)
            ->whereNotNull('reference_type')
            ->pluck('reference_type')
            ->filter(fn ($type) => in_array(
                strtolower((string) preg_replace('/[^a-zA-Z]/', '', (string) $type)),
                $accepted,
                true
            ))
            ->count();
    }

    public function destroy(Request $request, string $slug, string $id): JsonResponse
    {
        // Route params come in as raw strings (the {id} segment); cast here
        // since Laravel's injection does not coerce scalars for controllers.
        $id = (int) $id;

        if (! isset(self::ENTITIES[$slug])) {
            return response()->json(['success' => false, 'message' => 'Unknown archived entity.'], 404);
        }

        $user = $request->user();
        if (! $user->hasAnyRole(['admin', 'super-admin'])) {
            return response()->json([
                'success' => false,
                'message' => 'Only administrators can permanently delete archived records.',
            ], 403);
        }

        $config = self::ENTITIES[$slug];
        $model = $config['model'];
        $label = $config['label'];

        $record = $model::onlyTrashed()->find($id);

        if (! $record) {
            return response()->json(['success' => false, 'message' => "Archived {$label} not found."], 404);
        }

        // Block the purge while any posted journal line still points at this
        // record. journal_entry_lines has no FK on (reference_type,
        // reference_id), so without this check forceDelete() silently orphans
        // the ledger lines: debits and credits survive with no source document,
        // no counterparty and no way to trace the amount. The correct route out
        // is to post a reversing journal entry first, then purge.
        $journalLineCount = self::postedJournalLineCount($slug, $id);

        if ($journalLineCount > 0) {
            return response()->json([
                'success' => false,
                'message' => "This archived {$label} still has {$journalLineCount} posted journal "
                    .'line'.($journalLineCount === 1 ? '' : 's').' referencing it and cannot be permanently '
                    .'deleted. Post a reversing journal entry first, then permanently delete it — deleting it '
                    .'now would leave those amounts in the General Ledger with no source document.',
            ], 409);
        }

        try {
            DB::transaction(function () use ($record, $model, $user, $id, $label, $slug, $request) {
                AuditLog::create([
                    'user_id' => $user->id,
                    'module' => $slug,
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