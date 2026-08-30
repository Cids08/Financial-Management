<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'title',
        'message',
        'type',
        'is_read',
        'read_at',
    ];

    protected function casts(): array
    {
        return [
            'is_read' => 'boolean',
            'read_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeUnread($query)
    {
        return $query->where('is_read', false);
    }

    // Widened from `int` to `?int` — DashboardService::getNotifications()
    // passes Auth::id(), which is nullable by signature. The previous
    // non-nullable `int` hint caused a TypeError (and a 500 on
    // GET /api/dashboard) any time Auth::id() resolved to null before
    // this scope ran.
    public function scopeForUser($query, ?int $userId)
    {
        if ($userId === null) {
            return $query->whereRaw('1 = 0'); // no authenticated user -> no notifications, not a crash
        }

        return $query->where('user_id', $userId);
    }
}