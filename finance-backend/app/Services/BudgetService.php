<?php

namespace App\Services;

use App\Models\Budget;
use App\Models\Department;
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
            'used' => (float) (clone $active)->sum('used_amount'),
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

        if (! empty($filters['date_from'])) {
            $query->whereDate('end_date', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->whereDate('start_date', '<=', $filters['date_to']);
        }

        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        return $query->latest('created_at')->paginate($perPage);
    }

    public function create(array $data, int $userId): Budget
    {
        $existing = Budget::query()
            ->where('department_id', $data['department_id'])
            ->where('fiscal_year', (int) $data['fiscal_year'])
            ->where('budget_type', 'ilike', trim($data['budget_type']))
            ->whereIn('status', [Budget::STATUS_ACTIVE, Budget::STATUS_DRAFT, Budget::STATUS_CLOSED])
            ->whereNull('deleted_at')
            ->first();

        if ($existing) {
            throw ValidationException::withMessages([
                'budget_type' => "A {$existing->budget_type} budget for this department for fiscal year {$data['fiscal_year']} already exists ({$existing->budget_name} [{$existing->budget_code}] - Status: {$existing->status}).",
            ]);
        }

        if (empty($data['budget_code'])) {
            $dept = Department::find($data['department_id']);
            $abbr = 'DEPT';
            if ($dept) {
                $name = $dept->department_name;
                if (stripos($name, 'finance') !== false) {
                    $abbr = 'FIN';
                } elseif (stripos($name, 'human') !== false || stripos($name, 'hr') !== false) {
                    $abbr = 'HR';
                } elseif (stripos($name, 'operation') !== false) {
                    $abbr = 'OPS';
                } elseif (stripos($name, 'marketing') !== false) {
                    $abbr = 'MKT';
                } elseif (stripos($name, 'legal') !== false) {
                    $abbr = 'LGL';
                } elseif (stripos($name, 'information') !== false || stripos($name, 'it') !== false) {
                    $abbr = 'IT';
                } elseif (stripos($name, 'accounting') !== false) {
                    $abbr = 'ACC';
                } elseif (stripos($name, 'admin') !== false) {
                    $abbr = 'ADM';
                } else {
                    $words = preg_split('/\s+/', trim($name));
                    $abbr = count($words) > 1
                        ? strtoupper(substr($words[0], 0, 1) . substr($words[1], 0, 1))
                        : strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name), 0, 4));
                }
            }

            $typeTag = '';
            $bType = $data['budget_type'] ?? '';
            if ($bType === 'Operational') {
                $typeTag = '-OP';
            } elseif ($bType === 'Capital') {
                $typeTag = '-CAP';
            } elseif ($bType === 'Project') {
                $typeTag = '-PRJ';
            } elseif ($bType === 'Emergency') {
                $typeTag = '-EMG';
            } elseif (! empty($bType)) {
                $clean = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $bType), 0, 3));
                $typeTag = $clean ? "-{$clean}" : '';
            }

            $fy = $data['fiscal_year'];
            $baseCode = "BUD-{$fy}-{$abbr}{$typeTag}";
            $code = $baseCode;
            $counter = 1;
            while (Budget::where('budget_code', $code)->exists()) {
                $code = sprintf('%s-%02d', $baseCode, $counter);
                $counter++;
            }
            $data['budget_code'] = $code;
        }

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
        $conflict = Budget::query()
            ->where('department_id', $budget->department_id)
            ->where('fiscal_year', (int) $budget->fiscal_year)
            ->where('budget_type', 'ilike', trim($budget->budget_type))
            ->whereIn('status', [Budget::STATUS_ACTIVE, Budget::STATUS_DRAFT, Budget::STATUS_CLOSED])
            ->where('id', '!=', $budget->id)
            ->whereNull('deleted_at')
            ->first();

        if ($conflict) {
            throw ValidationException::withMessages([
                'budget' => "Cannot restore budget: a {$conflict->status} {$conflict->budget_type} budget for this department for fiscal year {$budget->fiscal_year} already exists ({$conflict->budget_name} [{$conflict->budget_code}]).",
            ]);
        }

        $budget->deleted_by = null;
        $budget->restore();

        return $budget->fresh();
    }

    /**
     * Notifies whoever created the budget that it was approved or
     * rejected. Mirrors ExpenseService::notifyBudgetWarning()'s pattern —
     * no-op if there's no creator on record, same as that method's guard.
     *
     * FIXED: `type` was 'budget', intended to match NOTIFICATION_TYPE_META
     * on the frontend for icon/routing — but notifications_type_check only
     * allows Info/Success/Warning/Error, so every approval/rejection was
     * throwing a 500 before the notification (or the approval/rejection
     * itself, since this runs inside the same transaction) could complete.
     *
     * UNVERIFIED TRADEOFF: mapping to Success/Warning unblocks the crash,
     * but if NOTIFICATION_TYPE_META keys strictly off type === 'budget'
     * with no fallback, this notification will now render with whatever
     * generic icon Success/Warning maps to instead of a budget-specific
     * one — a cosmetic regression, not a functional one. If per-module
     * icons/routing matter, the real fix is a separate column (e.g.
     * reference_type/reference_id, matching the pattern
     * supporting_documents already uses) so `type` can stay a pure
     * severity level and module identity lives elsewhere. That's a
     * migration + model change I haven't made here since I don't have
     * visibility into notificationTypes.js or the notifications schema
     * beyond what this constraint violation revealed.
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
            'type' => $approved ? 'Success' : 'Warning',
            'is_read' => false,
        ]);
    }
}