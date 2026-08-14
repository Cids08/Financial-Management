<?php

namespace App\Services;

use App\Models\TaxObligation;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class TaxObligationService
{
    protected const PER_PAGE = 15;

    /**
     * @param array{search?: string, status?: string, archived?: bool} $filters
     */
    public function list(array $filters): LengthAwarePaginator
    {
        $query = TaxObligation::query()->with(['createdBy', 'deletedBy']);

        if (! empty($filters['archived'])) {
            $query->onlyTrashed();
        }

        $query->search($filters['search'] ?? null)->latest('due_date');

        $paginated = $query->paginate(self::PER_PAGE);

        // Status filter (Pending/Overdue/Paid) has to run after fetching,
        // since "Overdue" doesn't exist as a stored value to filter on in
        // SQL — it's derived per-row. Given this table is small in
        // practice (finite tax filings per period), filtering post-fetch
        // on an already-paginated page is an acceptable trade-off here;
        // revisit with a computed DB column if this table grows large.
        if (! empty($filters['status']) && $filters['status'] !== 'all') {
            $paginated->setCollection(
                $paginated->getCollection()->filter(
                    fn (TaxObligation $o) => $o->derivedStatus() === $filters['status']
                )->values()
            );
        }

        return $paginated;
    }

    public function create(User $user, array $data): TaxObligation
    {
        return DB::transaction(function () use ($user, $data) {
            return TaxObligation::create([
                ...$data,
                'tax_amount'       => $this->computeTaxAmount($data),
                'status'           => ($data['is_paid'] ?? false) ? 'Paid' : 'Pending',
                'payment_date'     => ($data['is_paid'] ?? false) ? ($data['payment_date'] ?? now()->toDateString()) : null,
                'reference_number' => ($data['is_paid'] ?? false) ? ($data['reference_number'] ?? null) : null,
                'created_by'       => $user->id,
            ]);
        });
    }

    public function update(User $user, TaxObligation $obligation, array $data): TaxObligation
    {
        return DB::transaction(function () use ($obligation, $data) {
            $obligation->update([
                ...$data,
                'tax_amount'       => $this->computeTaxAmount($data),
                'status'           => ($data['is_paid'] ?? false) ? 'Paid' : 'Pending',
                'payment_date'     => ($data['is_paid'] ?? false) ? ($data['payment_date'] ?? now()->toDateString()) : null,
                'reference_number' => ($data['is_paid'] ?? false) ? ($data['reference_number'] ?? null) : null,
            ]);

            return $obligation->fresh(['createdBy', 'deletedBy']);
        });
    }

    public function archive(User $user, TaxObligation $obligation): TaxObligation
    {
        return DB::transaction(function () use ($user, $obligation) {
            $obligation->update(['deleted_by' => $user->id]);
            $obligation->delete();

            return $obligation->fresh(['createdBy', 'deletedBy']);
        });
    }

    public function restore(User $user, TaxObligation $obligation): TaxObligation
    {
        return DB::transaction(function () use ($obligation) {
            $obligation->restore();
            $obligation->update(['deleted_by' => null]);

            return $obligation->fresh(['createdBy', 'deletedBy']);
        });
    }

    protected function computeTaxAmount(array $data): float
    {
        $rate = (float) ($data['tax_rate'] ?? 0);
        $taxable = (float) ($data['taxable_amount'] ?? 0);

        return round($taxable * ($rate / 100), 2);
    }
}