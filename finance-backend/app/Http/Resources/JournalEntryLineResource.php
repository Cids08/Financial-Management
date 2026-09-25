<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class JournalEntryLineResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'journal_id' => $this->id,
            'journal_entry_id' => $this->journal_entry_id,
            'transaction_no' => $this->journalEntry?->transaction_no,
            'transaction_date' => optional($this->journalEntry?->transaction_date)->format('Y-m-d'),
            'description' => $this->journalEntry?->description,
            'account_code' => $this->account?->account_code,
            'account_name' => $this->account?->account_name,
            'account_id' => $this->account_id,
            'debit' => (float) $this->debit,
            'credit' => (float) $this->credit,
            'reference_type' => $this->reference_type,
            'reference_id' => $this->reference_id,
            'remarks' => $this->remarks,
            'source' => $this->buildSource(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }

    /**
     * "Where did this line come from" — counterparty (customer/client/supplier/
     * payee) + the source document number. Falls back to the module label when
     * the source record is gone or unlinked.
     */
    private function buildSource(): array
    {
        $info = $this->source_info;

        return [
            'label' => $info['label'] ?? $this->prettyReference(),
            'name' => $info['name'] ?? '',
            'reference' => $info['reference'] ?? '',
            'reference_type' => $this->reference_type,
            'reference_id' => $this->reference_id,
        ];
    }

    private function prettyReference(): string
    {
        $text = trim((string) preg_replace('/[_-]+/', ' ', (string) $this->reference_type));
        return $text === '' ? '—' : ucfirst(strtolower($text));
    }
}