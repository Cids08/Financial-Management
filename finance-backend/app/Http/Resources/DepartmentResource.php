<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DepartmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'department_id' => $this->id,
            'department_code' => $this->department_code,
            'department_name' => $this->department_name,
            'department_head' => $this->department_head,
            'department_email' => $this->department_email,
            'department_phone' => $this->department_phone,
            'description' => $this->description,
            'status' => $this->is_active ? 'Active' : 'Inactive',
            'headcount' => $this->whenCounted('users'),
        ];
    }
}