<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Field names here intentionally mirror what Users.jsx already reads
 * (user_id, role_id, is_archived, last_login, ...) so the frontend
 * doesn't need to change to consume this API.
 */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'user_id' => $this->id,
            'role_id' => $this->role_id,
            'employee_no' => $this->employee_no,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'email' => $this->email,
            'status' => $this->status,
            // deleted_at is the real "archived" signal — there's no
            // separate is_archived column in the DB.
            'is_archived' => $this->deleted_at !== null,
            'last_login' => $this->last_login?->toIso8601String(),
        ];
    }
}