<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActivityLog extends Model
{
    protected $fillable = ['user_id', 'activity', 'module', 'ip_address'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public static function record(?int $userId, string $activity, string $module, ?string $ip = null): self
    {
        return static::create(compact('userId', 'activity', 'module') + ['user_id' => $userId, 'ip_address' => $ip]);
    }
}