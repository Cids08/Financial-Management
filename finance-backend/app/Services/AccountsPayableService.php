<?php

namespace App\Services;

use App\Models\AccountsPayable;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class AccountsPayableService
{
    public function list(bool $withArchived = false): Collection
    {
        $query = AccountsPayable::query()->with(['supplier', 'creator', 'approver'])->latest('invoice_date');

        return $withArchived
            ? $query->onlyTrashed()->get()
            : $query->get();
    }

    /**
     * Matches AccountsPayable.jsx's stat cards. `payable` sums bills that
     * aren't fully paid — mirrors the frontend's `status !== 'Paid'` logic,
     * but see the status-constraint note in StoreAccountsPayableRequest;
     * once the real allowed values are confirmed this may need adjusting
     * if 'Paid' isn't spelled exactly that way in the DB.
     */
    public function stats(): array
    {
        $active = AccountsPayable::query();

        return [
            'total' => (clone $active)->count(),
            'payable' => (clone $active)->where('status', '!=', 'Paid')->sum('remaining_balance'),
            'overdue' => (clone $active)->where('status', 'Overdue')->count(),
            'archived' => AccountsPayable::onlyTrashed()->count(),
        ];
    }

    /**
     * $data: ['supplier_id', 'invoice_number', 'invoice_date', 'due_date',
     * 'amount', 'payment_method', 'billing_address', 'description',
     * 'reference_number', 'status'].
     *
     * remaining_balance is NOT NULL in the DB with no default — computed
     * here as original_amount - paid_amount (paid_amount starts at 0 for
     * a brand new bill, since there's no "record a payment" flow yet).
     */
    public function create(User $actor, array $data): AccountsPayable
    {
        return DB::transaction(function () use ($actor, $data) {
            $originalAmount = $data['amount'];
            $paidAmount = 0;

            $bill = AccountsPayable::create([
                'supplier_id' => $data['supplier_id'],
                'invoice_number' => $data['invoice_number'],
                'invoice_date' => $data['invoice_date'] ?? now()->toDateString(),
                'due_date' => $data['due_date'],
                'billing_address' => $data['billing_address'] ?? null,
                'purchase_order_no' => $data['purchase_order_no'] ?? null,
                'has_attachment' => $data['has_attachment'] ?? false,
                'original_amount' => $originalAmount,
                'paid_amount' => $paidAmount,
                'remaining_balance' => $originalAmount - $paidAmount,
                'payment_method' => $data['payment_method'] ?? null,
                'reference_number' => $data['reference_number'] ?? null,
                'status' => $data['status'] ?? 'Pending',
                'remarks' => $data['description'] ?? null,
                'created_by' => $actor->id,
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'create',
                'record_id' => $bill->id,
                'activity_description' => "Created bill {$bill->invoice_number}.",
                'new_values' => $bill->only(['supplier_id', 'invoice_number', 'original_amount', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $bill->load('supplier');
        });
    }

    /**
     * paid_amount isn't editable from this form (no "record a payment" UI
     * yet), so it's preserved as-is and remaining_balance is recomputed
     * against whatever original_amount changes to.
     */
    public function update(User $actor, AccountsPayable $bill, array $data): AccountsPayable
    {
        return DB::transaction(function () use ($actor, $bill, $data) {
            $original = $bill->only(['supplier_id', 'invoice_number', 'original_amount', 'status']);
            $newOriginalAmount = $data['amount'];

            $bill->fill([
                'supplier_id' => $data['supplier_id'],
                'invoice_number' => $data['invoice_number'],
                'invoice_date' => $data['invoice_date'] ?? $bill->invoice_date,
                'due_date' => $data['due_date'],
                'billing_address' => $data['billing_address'] ?? null,
                'purchase_order_no' => $data['purchase_order_no'] ?? null,
                'has_attachment' => $data['has_attachment'] ?? $bill->has_attachment,
                'original_amount' => $newOriginalAmount,
                'remaining_balance' => $newOriginalAmount - $bill->paid_amount,
                'payment_method' => $data['payment_method'] ?? null,
                'reference_number' => $data['reference_number'] ?? null,
                'status' => $data['status'] ?? $bill->status,
                'remarks' => $data['description'] ?? null,
            ]);
            $bill->save();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'update',
                'record_id' => $bill->id,
                'activity_description' => "Updated bill {$bill->invoice_number}.",
                'old_values' => $original,
                'new_values' => $bill->only(['supplier_id', 'invoice_number', 'original_amount', 'status']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $bill->load('supplier');
        });
    }

    /**
     * Sets approved_by/approved_at only — deliberately doesn't touch
     * `status`, since accounts_payable.status may have its own CHECK
     * constraint we haven't confirmed the values for (see the note in
     * StoreAccountsPayableRequest). If your workflow wants approval to
     * also flip status to something like 'Approved', confirm that's a
     * valid value first, then add it here.
     */
    public function approve(User $actor, AccountsPayable $bill): AccountsPayable
    {
        return DB::transaction(function () use ($actor, $bill) {
            $bill->update([
                'approved_by' => $actor->id,
                'approved_at' => now(),
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'approve',
                'record_id' => $bill->id,
                'activity_description' => "Approved bill {$bill->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $bill->load(['supplier', 'creator', 'approver']);
        });
    }

    public function archive(User $actor, AccountsPayable $bill): void
    {
        DB::transaction(function () use ($actor, $bill) {
            $bill->update(['deleted_by' => $actor->id]);
            $bill->delete();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'archive',
                'record_id' => $bill->id,
                'activity_description' => "Archived bill {$bill->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }

    public function restore(User $actor, AccountsPayable $bill): void
    {
        DB::transaction(function () use ($actor, $bill) {
            $bill->restore();
            $bill->update(['deleted_by' => null]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Accounts Payable',
                'action' => 'restore',
                'record_id' => $bill->id,
                'activity_description' => "Restored bill {$bill->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);
        });
    }
}