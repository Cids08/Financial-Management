<?php

namespace App\Services;

use App\Models\Budget;
use App\Models\SupportingDocument;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class BudgetService
{
    /**
     * Paginated listing with the has_plan flag computed via a single query
     * (a correlated subquery), not one exists() query per row.
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

        return $query->latest('created_at')->paginate($perPage);
    }

    public function create(array $data, int $userId): Budget
    {
        return DB::transaction(function () use ($data, $userId) {
            return Budget::create([
                ...$data,
                'used_amount' => 0,
                'remaining_amount' => $data['allocated_amount'],
                'status' => 'Pending',
                'created_by' => $userId,
            ]);
        });
    }

    public function update(Budget $budget, array $data): Budget
    {
        return DB::transaction(function () use ($budget, $data) {
            // Allocated amount can shrink/grow before approval; remaining_amount
            // tracks the same delta since used_amount is always 0 pre-approval
            // (a budget cannot be spent against until it's approved).
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

    public function attachPlan(Budget $budget, \Illuminate\Http\UploadedFile $file, int $userId): SupportingDocument
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

    /**
     * The rule this whole feature is about: a budget cannot be approved
     * until a plan document is attached. Enforced here — not just in the
     * UI — since this is the single place all approval requests pass
     * through, per the project's Controller -> Service -> Model flow.
     */
    public function approve(Budget $budget, int $approverId): Budget
    {
        if ($budget->status !== 'Pending') {
            throw ValidationException::withMessages([
                'status' => 'Only a pending budget can be approved.',
            ]);
        }

        if (! $budget->has_plan) {
            throw ValidationException::withMessages([
                'plan' => 'This budget cannot be approved until a budget plan is attached.',
            ]);
        }

        return DB::transaction(function () use ($budget, $approverId) {
            $budget->update([
                'status' => 'Approved',
                'approved_by' => $approverId,
                'approved_at' => now(),
            ]);

            // TODO: per the project's business rules, budget approval should also
            // log an audit entry (audit_logs) and may trigger a notification —
            // wire those through their existing services here if not already
            // handled by a model observer.

            return $budget->fresh();
        });
    }

    public function reject(Budget $budget, int $approverId, ?string $reason = null): Budget
    {
        if ($budget->status !== 'Pending') {
            throw ValidationException::withMessages([
                'status' => 'Only a pending budget can be rejected.',
            ]);
        }

        return DB::transaction(function () use ($budget, $approverId, $reason) {
            $budget->update([
                'status' => 'Rejected',
                'approved_by' => $approverId,
                'approved_at' => now(),
                'remarks' => $reason ?? $budget->remarks,
            ]);

            return $budget->fresh();
        });
    }

    public function archive(Budget $budget, int $userId): Budget
    {
        // SoftDeletes only manages deleted_at automatically — deleted_by has to
        // be set explicitly before the soft delete happens.
        $budget->deleted_by = $userId;
        $budget->save();
        $budget->delete();

        return $budget;
    }

    public function restore(Budget $budget): Budget
    {
        $budget->deleted_by = null;
        $budget->restore();

        return $budget->fresh();
    }
}