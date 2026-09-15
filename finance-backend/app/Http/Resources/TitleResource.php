<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TitleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'title_id' => $this->id,
            'title_name' => $this->name,
            'status' => $this->is_active ? 'Active' : 'Inactive',
            'headcount' => $this->whenCounted('users'),
        ];
    }
}