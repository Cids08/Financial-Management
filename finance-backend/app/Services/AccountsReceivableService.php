<?php

namespace App\Services;

use App\Models\AccountsReceivable;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\SupportingDocument;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AccountsReceivableService
{
    /**
     * $filters: ['status' => ?string, 'archived' => bool, 'search' => ?string, 'collector_id' => ?int]
     * Matches the filter behavior already implemented client-side in
     * AccountsReceivable.jsx's `filtered` useMemo, moved server-side.
     *
     * collector_id is the enforcement point for Collector-role scoping —
     * see AccountsReceivableController::index(), which forces this value
     * to the caller's own collector id rather than trusting the client.
     */
    public function list(array $filters = []): Collection
    {
        $query = AccountsReceivable::query()->with(['customer', 'collector']);

        // Soft-deleted rows are excluded by default via SoftDeletes' global
        // scope. is_archived is a separate flag — only filter on it when the
        // caller explicitly asks for a subset, so a plain list() call can
        // return everything (active + archived) in one request.
        if (array_key_exists('archived', $filters)) {
            $query->where('is_archived', $filters['archived']);
        }

        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $query->where('status', $filters['status']);
        }

        if (array_key_exists('collector_id', $filters) && $filters['collector_id'] !== null) {
            $query->where('collector_id', $filters['collector_id']);
        }

        if (! empty($filters['search'])) {
            $term = '%' . $filters['search'] . '%';
            $query->where(function ($q) use ($term) {
                $q->where('invoice_number', 'ilike', $term)
                    ->orWhere('reference_no', 'ilike', $term)
                    ->orWhereHas('customer', function ($cq) use ($term) {
                        $cq->where('customer_name', 'ilike', $term);
                    });
            });
        }

        return $query->orderByDesc('created_at')->get();
    }

    public function create(User $actor, array $data): AccountsReceivable
    {
        return DB::transaction(function () use ($actor, $data) {
            $balance = $data['balance'] ?? $data['original_amount'];
            $penaltyRate = $data['penalty_rate'] ?? 0;
            $penaltyAmount = $penaltyRate > 0
                ? round(($data['original_amount'] * $penaltyRate) / 100, 2)
                : 0;

            $referenceNo = !empty($data['reference_no'])
                ? $data['reference_no']
                : self::generateReferenceNo();

            $ar = AccountsReceivable::create([
                'customer_id' => $data['customer_id'],
                'collector_id' => $data['collector_id'] ?? null,
                'invoice_number' => $data['invoice_number'],
                'invoice_date' => $data['invoice_date'],
                'due_date' => $data['due_date'],
                'original_amount' => $data['original_amount'],
                'paid_amount' => max(0, $data['original_amount'] - $balance),
                'remaining_balance' => $balance,
                'payment_method' => $data['payment_method'] ?? null,
                'payment_terms' => $data['payment_terms'] ?? null,
                'purchase_order_no' => $data['purchase_order_no'] ?? null,
                'reference_no' => $referenceNo,
                'penalty_rate' => $penaltyRate,
                'penalty_amount' => $penaltyAmount,
                'remarks' => $data['remarks'] ?? null,
                'status' => $data['status'],
                'created_by' => $actor->id,
                'is_archived' => false,
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'AccountsReceivable',
                'action' => 'create',
                'record_id' => $ar->id,
                'activity_description' => "Created invoice {$ar->invoice_number}.",
                'new_values' => $ar->only(array_keys($data)),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $ar->load(['customer', 'collector']);
        });
    }

    public function update(User $actor, AccountsReceivable $ar, array $data): AccountsReceivable
    {
        return DB::transaction(function () use ($actor, $ar, $data) {
            $original = $ar->only(array_keys($data) + ['id']);

            $balance = $data['balance'] ?? $data['original_amount'];
            $penaltyRate = $data['penalty_rate'] ?? 0;
            $penaltyAmount = $penaltyRate > 0
                ? round(($data['original_amount'] * $penaltyRate) / 100, 2)
                : 0;

            $ar->update([
                'customer_id' => $data['customer_id'],
                'collector_id' => array_key_exists('collector_id', $data) ? $data['collector_id'] : $ar->collector_id,
                'invoice_number' => $data['invoice_number'],
                'invoice_date' => $data['invoice_date'],
                'due_date' => $data['due_date'],
                'original_amount' => $data['original_amount'],
                'paid_amount' => max(0, $data['original_amount'] - $balance),
                'remaining_balance' => $balance,
                'payment_method' => $data['payment_method'] ?? null,
                'payment_terms' => $data['payment_terms'] ?? null,
                'purchase_order_no' => $data['purchase_order_no'] ?? null,
                'reference_no' => $data['reference_no'] ?? null,
                'penalty_rate' => $penaltyRate,
                'penalty_amount' => $penaltyAmount,
                'remarks' => $data['remarks'] ?? null,
                'status' => $data['status'],
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'AccountsReceivable',
                'action' => 'update',
                'record_id' => $ar->id,
                'activity_description' => "Updated invoice {$ar->invoice_number}.",
                'old_values' => $original,
                'new_values' => $ar->only(array_keys($data) + ['id']),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $ar->load(['customer', 'collector']);
        });
    }

    /**
     * Flips is_archived, matching the single toggle button in the frontend
     * (Archive / RotateCcw icon on the same action).
     */
    public function toggleArchive(User $actor, AccountsReceivable $ar): AccountsReceivable
    {
        $nextArchived = ! $ar->is_archived;

        // When archiving, only completed/settled invoices (Paid or Cancelled) can be archived.
        // In-flight or overdue invoices must remain in the active collections queue.
        if ($nextArchived && ! in_array($ar->status, ['Paid', 'Cancelled'], true)) {
            throw ValidationException::withMessages([
                'status' => 'Only completed or settled invoices (Paid or Cancelled) can be archived. In-flight and overdue invoices must remain in the active collections queue.',
            ]);
        }

        return DB::transaction(function () use ($actor, $ar, $nextArchived) {
            $ar->update([
                'is_archived' => $nextArchived,
                'archived_at' => $nextArchived ? now() : null,
                'archived_by' => $nextArchived ? $actor->id : null,
            ]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'AccountsReceivable',
                'action' => $nextArchived ? 'archive' : 'restore',
                'record_id' => $ar->id,
                'activity_description' => ($nextArchived ? 'Archived' : 'Restored') . " invoice {$ar->invoice_number}.",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $ar->load(['customer', 'collector']);
        });
    }

    public static function generateReferenceNo(): string
    {
        $last = AccountsReceivable::withTrashed()
            ->where('reference_no', 'like', 'REF-AR-%')
            ->orderByDesc('id')
            ->value('reference_no');

        $nextNum = 1;
        if ($last && preg_match('/REF-AR-(\d+)/i', $last, $matches)) {
            $nextNum = (int) $matches[1] + 1;
        } else {
            $count = AccountsReceivable::withTrashed()->count();
            $nextNum = $count + 1;
        }

        while (AccountsReceivable::withTrashed()->where('reference_no', sprintf('REF-AR-%03d', $nextNum))->exists()) {
            $nextNum++;
        }

        return sprintf('REF-AR-%03d', $nextNum);
    }

    public function attachDocument(AccountsReceivable $ar, UploadedFile $file, User $actor): SupportingDocument
    {
        $path = $file->store("accounts-receivable-documents/{$ar->id}", 'local');

        $document = SupportingDocument::create([
            'reference_type' => 'accounts_receivable',
            'reference_id' => $ar->id,
            'file_name' => basename($path),
            'original_name' => $file->getClientOriginalName(),
            'storage_path' => $path,
            'mime_type' => $file->getClientMimeType(),
            'file_size' => $file->getSize(),
            'uploaded_by' => $actor->id,
            'uploaded_at' => now(),
        ]);

        AuditLog::create([
            'user_id' => $actor->id,
            'module' => 'AccountsReceivable',
            'action' => 'attach_document',
            'record_id' => $ar->id,
            'activity_description' => "Attached document \"{$file->getClientOriginalName()}\" to invoice {$ar->invoice_number}.",
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]);

        return $document;
    }

    public function getDocumentHistory(AccountsReceivable $ar): Collection
    {
        return SupportingDocument::query()
            ->with('uploader:id,first_name,last_name')
            ->where('reference_type', 'accounts_receivable')
            ->where('reference_id', $ar->id)
            ->orderByDesc('uploaded_at')
            ->orderByDesc('id')
            ->get()
            ->map(function (SupportingDocument $doc) {
                $doc->uploaded_by_name = $doc->uploader
                    ? trim("{$doc->uploader->first_name} {$doc->uploader->last_name}")
                    : null;
                $doc->has_file = (bool) $doc->storage_path;
                return $doc;
            });
    }

    /* ---------------------------------------------------------------------- */
    /* Aging & Statement of Account                                            */
    /* ---------------------------------------------------------------------- */

    /**
     * Returns an aging summary matrix: one row per customer with subtotals
     * for each aging bucket (Current, 1-30, 31-60, 61-90, 90+ days overdue).
     * Only non-archived, non-paid, non-cancelled active invoices are counted.
     */
    public function getAgingSummary(): array
    {
        $today = Carbon::today();

        $invoices = AccountsReceivable::query()
            ->with('customer:id,customer_name,customer_code,email,contact_person,contact_number,address')
            ->where('is_archived', false)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->whereNull('deleted_at')
            ->get();

        // Group by customer and bucket each invoice
        $byCustomer = [];
        foreach ($invoices as $inv) {
            $custId   = $inv->customer_id;
            $custName = $inv->customer->customer_name ?? "Customer #{$custId}";

            if (!isset($byCustomer[$custId])) {
                $byCustomer[$custId] = [
                    'customer_id'      => $custId,
                    'customer_name'    => $custName,
                    'customer_code'    => $inv->customer->customer_code ?? null,
                    'email'            => $inv->customer->email ?? null,
                    'contact_person'   => $inv->customer->contact_person ?? null,
                    'contact_number'   => $inv->customer->contact_number ?? null,
                    'address'          => $inv->customer->address ?? null,
                    'current'          => 0.0,
                    'd1_30'            => 0.0,
                    'd31_60'           => 0.0,
                    'd61_90'           => 0.0,
                    'over90'           => 0.0,
                    'total_outstanding' => 0.0,
                    'invoice_count'    => 0,
                ];
            }

            $balance   = (float) $inv->remaining_balance;
            $dueDate   = Carbon::parse($inv->due_date);
            $daysOverdue = $today->diffInDays($dueDate, false); // negative = overdue

            if ($daysOverdue >= 0) {
                $byCustomer[$custId]['current'] += $balance;
            } elseif ($daysOverdue >= -30) {
                $byCustomer[$custId]['d1_30'] += $balance;
            } elseif ($daysOverdue >= -60) {
                $byCustomer[$custId]['d31_60'] += $balance;
            } elseif ($daysOverdue >= -90) {
                $byCustomer[$custId]['d61_90'] += $balance;
            } else {
                $byCustomer[$custId]['over90'] += $balance;
            }

            $byCustomer[$custId]['total_outstanding'] += $balance;
            $byCustomer[$custId]['invoice_count']++;
        }

        // Sort by total outstanding descending
        usort($byCustomer, fn ($a, $b) => $b['total_outstanding'] <=> $a['total_outstanding']);

        return array_values($byCustomer);
    }

    /**
     * Returns a full Statement of Account for a single customer:
     * customer header, aging buckets, and a line-by-line invoice list.
     */
    public function getStatementOfAccount(int $customerId): array
    {
        $today    = Carbon::today();
        $customer = Customer::findOrFail($customerId);

        $invoices = AccountsReceivable::query()
            ->where('customer_id', $customerId)
            ->where('is_archived', false)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->whereNull('deleted_at')
            ->orderBy('due_date')
            ->get();

        $aging = ['current' => 0.0, 'd1_30' => 0.0, 'd31_60' => 0.0, 'd61_90' => 0.0, 'over90' => 0.0];
        $lines = [];

        foreach ($invoices as $inv) {
            $balance     = (float) $inv->remaining_balance;
            $dueDate     = Carbon::parse($inv->due_date);
            $daysOverdue = $today->diffInDays($dueDate, false);

            if ($daysOverdue >= 0) {
                $bucket = 'current';
                $aging['current'] += $balance;
            } elseif ($daysOverdue >= -30) {
                $bucket = 'd1_30';
                $aging['d1_30'] += $balance;
            } elseif ($daysOverdue >= -60) {
                $bucket = 'd31_60';
                $aging['d31_60'] += $balance;
            } elseif ($daysOverdue >= -90) {
                $bucket = 'd61_90';
                $aging['d61_90'] += $balance;
            } else {
                $bucket = 'over90';
                $aging['over90'] += $balance;
            }

            $lines[] = [
                'ar_id'            => $inv->id,
                'invoice_number'   => $inv->invoice_number,
                'reference_no'     => $inv->reference_no,
                'invoice_date'     => $inv->invoice_date,
                'due_date'         => $inv->due_date,
                'original_amount'  => (float) $inv->original_amount,
                'paid_amount'      => (float) $inv->paid_amount,
                'remaining_balance'=> $balance,
                'penalty_rate'     => (float) $inv->penalty_rate,
                'penalty_amount'   => (float) $inv->penalty_amount,
                'status'           => $inv->status,
                'days_overdue'     => $daysOverdue >= 0 ? 0 : abs((int) $daysOverdue),
                'aging_bucket'     => $bucket,
            ];
        }

        return [
            'customer' => [
                'id'             => $customer->id,
                'customer_code'  => $customer->customer_code,
                'customer_name'  => $customer->customer_name,
                'contact_person' => $customer->contact_person,
                'contact_number' => $customer->contact_number,
                'email'          => $customer->email,
                'address'        => $customer->address,
                'credit_limit'   => (float) $customer->credit_limit,
            ],
            'aging'            => $aging,
            'total_outstanding' => array_sum($aging),
            'invoices'         => $lines,
            'as_of_date'       => $today->toDateString(),
        ];
    }

    /**
     * Returns SOA data for all customers that have at least one active
     * outstanding invoice — used for the batch-print feature.
     */
    public function getBatchStatementOfAccounts(): array
    {
        $today = Carbon::today();

        // Get distinct customer IDs that have outstanding invoices
        $customerIds = AccountsReceivable::query()
            ->where('is_archived', false)
            ->whereNotIn('status', ['Paid', 'Cancelled'])
            ->whereNull('deleted_at')
            ->distinct()
            ->pluck('customer_id');

        $result = [];
        foreach ($customerIds as $customerId) {
            $result[] = $this->getStatementOfAccount($customerId);
        }

        // Sort by total outstanding descending
        usort($result, fn ($a, $b) => $b['total_outstanding'] <=> $a['total_outstanding']);

        return $result;
    }
}