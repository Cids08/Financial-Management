<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

class ProfileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'name'        => trim("{$this->first_name} {$this->last_name}"),
            'first_name'  => $this->first_name,
            'middle_name' => $this->middle_name,
            'last_name'   => $this->last_name,
            'suffix'      => $this->suffix,
            'email'       => $this->email,
            'phone'       => $this->phone_number,

            // roles.name is stored as a slug ('super-admin'); Str::headline()
            // renders it for display ('Super Admin') without needing a
            // separate display_name column. Idempotent on an already-nice
            // string, so this is safe even if some roles are seeded pretty.
            'role'        => $this->whenLoaded('role', fn () => $this->role?->name ? Str::headline($this->role->name) : null),

            'department'  => $this->whenLoaded('department', fn () => $this->department?->name),

            // This is the field that mattered for the broken-image bug:
            // always emit a full, absolute URL — never a bare storage
            // path — so the <img src> never depends on the frontend's
            // own origin resolving it as a relative path.
            //
            // Deliberately NOT using Storage::disk('public')->url() here:
            // that method lives on the concrete FilesystemAdapter, not on
            // the Illuminate\Contracts\Filesystem\Filesystem interface
            // Storage::disk() is type-hinted to return, so static analysis
            // (and some IDEs) flag it as an unknown method even though it
            // works at runtime. asset() sidesteps the ambiguity entirely
            // and produces the same absolute URL, assuming the standard
            // `php artisan storage:link` symlink is in place.
            'avatar_url'  => $this->profile_photo
                ? asset('storage/' . ltrim($this->profile_photo, '/'))
                : null,
        ];
    }
}