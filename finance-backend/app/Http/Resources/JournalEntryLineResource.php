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
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}