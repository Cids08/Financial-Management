<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ChartOfAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'account_code' => $this->account_code,
            'account_name' => $this->account_name,
            'account_type' => $this->account_type,
            'account_category' => $this->account_category,
            'parent_account_id' => $this->parent_account_id,
            'parent' => $this->whenLoaded('parent', fn () => $this->parent
                ? ['id' => $this->parent->id, 'account_code' => $this->parent->account_code, 'account_name' => $this->parent->account_name]
                : null),
            'description' => $this->description,
            'is_active' => (bool) $this->is_active,
            'entries_count' => (int) ($this->entries_count ?? 0),
            'label' => "{$this->account_code} — {$this->account_name}",
        ];
    }
}