<?php

namespace App\Services;

use App\Models\Budget;
use App\Models\Notification;
use App\Models\SupportingDocument;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BudgetService
{
    public function stats(): array
    {
        $active = Budget::query()->whereNull('deleted_at');

        return [
            'total' => (clone $active)->count(),
            'pending' => (clone $active)->where('status', 'Draft')->count(),
            'allocated' => (float) (clone $active)->sum('allocated_amount'),
            'remaining' => (float) (clone $active)->sum('remaining_amount'),
            'archived' => Budget::onlyTrashed()->count(),
        ];
    }

    /**
     * status is constrained at the DB level (budgets_status_check) to:
     * Draft, Active, Closed, Cancelled — confirmed via pg_constraint.
     * There is no separate approval_status column. Draft = awaiting
     * approval, Active = approved and spendable, Cancelled = rejected,
     * Closed = end-of-cycle (not part of the approval flow at all).
     */
    public function paginate(array $filters, int $perPage = 20)
    {
        $query = Budget::query()
            ->with(['department', 'creator', 'approver'])
            ->withCount(['supportingDocuments as supporting_documents_count']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['fiscal_year'])) {
            $query->where('fiscal_year', $filters['fiscal_year']);
        }

        if (! empty($filters['search'])) {
            $term = '%'.$filters['search'].'%';
            $query->where(function ($q) use ($term) {
                $q->where('budget_name', 'ilike', $term)
                    ->orWhere('budget_code', 'ilike', $term);
            });
        }

        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        return $query->latest('created_at')->paginate($perPage);
    }

    public function create(array $data, int $userId): Budget
    {
        return DB::transaction(fn () => Budget::create([
            ...$data,
            'used_amount' => 0,
            'remaining_amount' => $data['allocated_amount'],
            'status' => 'Draft', // was 'Pending' — not a legal value per budgets_status_check
            'created_by' => $userId,
        ]));
    }

    public function update(Budget $budget, array $data, int $userId): Budget
    {
        // Editable only while Draft — once Active (approved) it's locked,
        // matching the frontend's original intent even though the old
        // check (status !== 'Approved') could never actually fire.
        if ($budget->status !== 'Draft') {
            throw ValidationException::withMessages([
                'status' => 'Only a Draft budget can be edited.',
            ]);
        }

        return DB::transaction(function () use ($budget, $data) {
            $budget->update([
                'allocated_amount' => $data['allocated_amount'],
                'remaining_amount' => $data['allocated_amount'] - $budget->used_amount,
                'warning_percentage' => $data['warning_percentage'] ?? $budget->warning_percentage,
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                'remarks' => $data['remarks'] ?? $budget->remarks,
            ]);

            return $budget->fresh();
        });
    }

    public function attachPlan(Budget $budget, UploadedFile $file, int $userId): SupportingDocument
    {
        $path = $file->store("budget-plans/{$budget->id}", 'local');

        return SupportingDocument::create([
            'reference_type' => 'budget',
            'reference_id' => $budget->id,
            'file_name' => basename($path),
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'uploaded_by' => $userId,
            'uploaded_at' => now(),
        ]);
    }

    public function approve(Budget $budget, int $approverId): Budget
    {
        if ($budget->status !== 'Draft') {
            throw ValidationException::withMessages(['status' => 'Only a Draft budget can be approved.']);
        }

        if (! $budget->has_plan) {
            throw ValidationException::withMessages(['plan' => 'This budget cannot be approved until a budget plan is attached.']);
        }

        return DB::transaction(function () use ($budget, $approverId) {
            // 'Approved' is not a legal status value — Active is the
            // approved/spendable state per budgets_status_check.
            $budget->update(['status' => 'Active', 'approved_by' => $approverId, 'approved_at' => now()]);

            $this->notifyCreator($budget, approved: true);

            return $budget->fresh();
        });
    }

    public function reject(Budget $budget, int $approverId, ?string $reason = null): Budget
    {
        if ($budget->status !== 'Draft') {
            throw ValidationException::withMessages(['status' => 'Only a Draft budget can be rejected.']);
        }

        return DB::transaction(function () use ($budget, $approverId, $reason) {
            // 'Rejected' is not a legal status value — Cancelled is the
            // closest match per budgets_status_check.
            $budget->update([
                'status' => 'Cancelled',
                'approved_by' => $approverId,
                'approved_at' => now(),
                'remarks' => $reason ?? $budget->remarks,
            ]);

            $this->notifyCreator($budget, approved: false, reason: $reason);

            return $budget->fresh();
        });
    }

    public function archive(Budget $budget, int $userId): Budget
    {
        $budget->deleted_by = $userId;
        $budget->save();
        $budget->delete();

        return $budget;
    }

    public function restore(Budget $budget, int $userId): Budget
    {
        $budget->deleted_by = null;
        $budget->restore();

        return $budget->fresh();
    }

    /**
     * Notifies whoever created the budget that it was approved or
     * rejected. Mirrors ExpenseService::notifyBudgetWarning()'s pattern —
     * no-op if there's no creator on record, same as that method's guard.
     *
     * `type` is 'budget', matching NOTIFICATION_TYPE_META on the frontend
     * (src/utils/notificationTypes.js) so this renders with the right
     * icon/route immediately, no frontend change needed for this one.
     */
    private function notifyCreator(Budget $budget, bool $approved, ?string $reason = null): void
    {
        if (! $budget->created_by) {
            return;
        }

        Notification::create([
            'user_id' => $budget->created_by,
            'title' => $approved ? 'Budget approved' : 'Budget rejected',
            'message' => $approved
                ? sprintf('Your budget "%s" (%s) was approved.', $budget->budget_name, $budget->budget_code)
                : sprintf(
                    'Your budget "%s" (%s) was rejected.%s',
                    $budget->budget_name,
                    $budget->budget_code,
                    $reason ? " Reason: {$reason}" : ''
                ),
            'type' => 'budget',
            'is_read' => false,
        ]);
    }
}