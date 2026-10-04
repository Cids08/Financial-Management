<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SupplierDocumentGuard
{
    // Call inside the write transaction. A common supplier lock serializes
    // AP and expense submissions, including simultaneous cross-module writes.
    public function check(?int $supplierId, ?string $reference, string $source, ?int $ignoreId = null): void
    {
        if (! $supplierId) return;
        DB::table('suppliers')->where('id', $supplierId)->lockForUpdate()->first();
        $field = $source === 'ap' ? 'invoice_number' : 'receipt_number';
        $key = mb_strtolower(trim($reference ?? ''));
        if ($key === '') throw ValidationException::withMessages([$field => 'Enter the supplier document number so duplicate costs can be checked.']);
        foreach (['ap' => ['accounts_payable', 'invoice_number', 'Cancelled'], 'expense' => ['expenses', 'receipt_number', 'Rejected']] as $kind => [$table, $column, $excluded]) {
            $query = DB::table($table)->where('supplier_id', $supplierId)->where('status', '!=', $excluded)
                ->whereRaw("LOWER(TRIM({$column})) = ?", [$key]);
            if ($source === $kind && $ignoreId) $query->where('id', '!=', $ignoreId);
            if ($query->exists()) throw ValidationException::withMessages([$field => 'This supplier document is already recorded in '.($kind === 'ap' ? 'Accounts Payable' : 'Expenses').'. Use the existing record instead of recording the cost again.']);
        }
    }
}
