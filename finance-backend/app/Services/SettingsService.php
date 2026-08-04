<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class SettingsService
{
    protected const LOGO_DISK = 'public';
    protected const LOGO_DIR = 'branding';

    public function get(): Setting
    {
        return Setting::current();
    }

    /**
     * $data is expected pre-mapped to DB column names by the caller
     * (see SettingsController::update()).
     */
    public function update(User $actor, array $data): Setting
    {
        return DB::transaction(function () use ($actor, $data) {
            $setting = Setting::current();
            $original = $setting->only(array_keys($data));

            $setting->fill($data);
            $setting->save();

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Settings',
                'action' => 'update',
                'record_id' => $setting->id,
                'activity_description' => 'Updated company branding and financial settings.',
                'old_values' => $original,
                'new_values' => $setting->only(array_keys($data)),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $setting;
        });
    }

    public function updateLogo(User $actor, UploadedFile $logo): Setting
    {
        return DB::transaction(function () use ($actor, $logo) {
            $setting = Setting::current();
            $this->deleteExistingLogo($setting);

            $path = $logo->store(self::LOGO_DIR, self::LOGO_DISK);
            $setting->update(['company_logo' => $path]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Settings',
                'action' => 'update_logo',
                'record_id' => $setting->id,
                'activity_description' => 'Updated company logo.',
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $setting;
        });
    }

    public function removeLogo(User $actor): Setting
    {
        return DB::transaction(function () use ($actor) {
            $setting = Setting::current();
            $this->deleteExistingLogo($setting);
            $setting->update(['company_logo' => null]);

            AuditLog::create([
                'user_id' => $actor->id,
                'module' => 'Settings',
                'action' => 'remove_logo',
                'record_id' => $setting->id,
                'activity_description' => 'Removed company logo.',
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
            ]);

            return $setting;
        });
    }

    protected function deleteExistingLogo(Setting $setting): void
    {
        if ($setting->company_logo && Storage::disk(self::LOGO_DISK)->exists($setting->company_logo)) {
            Storage::disk(self::LOGO_DISK)->delete($setting->company_logo);
        }
    }
}