<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ActivityLogResource extends JsonResource
{
    protected const DESCRIPTIONS = [
        'Login' => 'Signed in successfully',
        'Failed Login' => 'Incorrect password entered',
        'Password Change' => 'Password was changed',
        '2FA Enabled' => 'Two-factor authentication turned on',
        '2FA Disabled' => 'Two-factor authentication turned off',
        'Session Revoked' => 'Signed out a device',
        'Signed Out Other Sessions' => 'All other sessions were revoked',
        'Account Deactivated' => 'Account was deactivated',
    ];

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->activity,
            'module' => $this->module,
            'description' => self::DESCRIPTIONS[$this->activity] ?? $this->activity,
            'ip' => $this->ip_address,
            'status' => str_contains($this->activity, 'Failed') ? 'failed' : 'success',
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}