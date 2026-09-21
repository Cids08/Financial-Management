<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ActivityLogResource extends JsonResource
{
    protected const DESCRIPTIONS = [
        'Login' => 'Signed in successfully',
        'Failed Login' => 'Incorrect password entered',
        'Forced Logout' => 'Signed out — new login detected on another device',
        'Password Change' => 'Password was changed',
        '2FA Enabled' => 'Two-factor authentication turned on',
        '2FA Disabled' => 'Two-factor authentication turned off',
        'Session Revoked' => 'Signed out a device',
        'Signed Out Other Sessions' => 'All other sessions were revoked',
        'Account Deactivated' => 'Account was deactivated',
    ];

    public function toArray(Request $request): array
    {
        $status = match (true) {
            str_contains($this->activity, 'Failed') => 'failed',
            str_contains($this->activity, 'Forced') => 'warning',
            default => 'success',
        };

        return [
            'id' => $this->id,
            'action' => $this->activity,
            'module' => $this->module,
            'description' => self::DESCRIPTIONS[$this->activity] ?? $this->activity,
            'ip' => $this->ip_address,
            'status' => $status,
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}