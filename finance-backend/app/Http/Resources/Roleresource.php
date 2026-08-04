<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'role_id' => $this->id,
            // Users.jsx / Roles.jsx read `role_name` — the DB column is
            // `display_name` (`name` is the internal unique slug).
            'role_name' => $this->display_name,
            'description' => $this->description,
            // Requires ->withCount('users') on the query; falls back to
            // counting the loaded relation if that wasn't done.
            'userCount' => $this->users_count ?? $this->users?->count() ?? 0,
            // Only populated when ->with('permissions') was used (the
            // single-role fetch for the permissions modal); omitted as []
            // on the plain list endpoint to avoid an N+1 there.
            'permissionIds' => $this->relationLoaded('permissions')
                ? $this->permissions->pluck('id')->values()
                : [],
        ];
    }
}