<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

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
            // profile_photo on the model is just a stored disk path (e.g.
            // "avatars/abc123.jpg"), not something a browser can load
            // directly — Storage::url() turns it into a full URL, same
            // as Users.jsx's `u.avatar_url` check expects. null when no
            // photo has been uploaded, so the frontend correctly falls
            // back to initials instead of rendering a broken <img>.
            'avatar_url' => $this->profile_photo
                ? Storage::url($this->profile_photo)
                : null,
            // deleted_at is the real "archived" signal — there's no
            // separate is_archived column in the DB.
            'is_archived' => $this->deleted_at !== null,
            'last_login' => $this->last_login?->toIso8601String(),
            // Only present immediately after UserService::create() sets
            // this transient, non-persisted attribute on the model
            // instance — index/update/restore never set it, so this is
            // null everywhere except that one response.
            'initial_password' => $this->initial_password ?? null,
        ];
    }
}