<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProfileService
{
    protected const AVATAR_DISK = 'public';
    protected const AVATAR_DIR = 'avatars';

    /**
     * Update the authenticated user's editable profile fields.
     */
    public function update(User $user, array $data): User
    {
        return DB::transaction(function () use ($user, $data) {
            $user->fill([
                'first_name'   => $data['first_name'],
                'middle_name'  => $data['middle_name'] ?? null,
                'last_name'    => $data['last_name'],
                'suffix'       => $data['suffix'] ?? null,
                'email'        => $data['email'],
                'phone_number' => $data['phone_number'] ?? null,
                'updated_by'   => $user->id,
            ]);
            $user->save();

            return $user->fresh(['role', 'department']);
        });
    }

    /**
     * Store a new avatar, replacing any previous one.
     */
    public function updateAvatar(User $user, UploadedFile $avatar): User
    {
        return DB::transaction(function () use ($user, $avatar) {
            $this->deleteExistingAvatar($user);

            $path = $avatar->store(self::AVATAR_DIR, self::AVATAR_DISK);

            $user->update([
                'profile_photo' => $path,
                'updated_by'    => $user->id,
            ]);

            return $user->fresh(['role', 'department']);
        });
    }

    /**
     * Remove the current avatar.
     */
    public function removeAvatar(User $user): User
    {
        return DB::transaction(function () use ($user) {
            $this->deleteExistingAvatar($user);

            $user->update([
                'profile_photo' => null,
                'updated_by'    => $user->id,
            ]);

            return $user->fresh(['role', 'department']);
        });
    }

    protected function deleteExistingAvatar(User $user): void
    {
        if ($user->profile_photo && Storage::disk(self::AVATAR_DISK)->exists($user->profile_photo)) {
            Storage::disk(self::AVATAR_DISK)->delete($user->profile_photo);
        }
    }
}