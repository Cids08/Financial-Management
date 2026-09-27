<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class AiAdvisorConversation extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'user_id',
        'title',
        'summary',
    ];

    // Serialized alongside the row so the frontend can distinguish active vs
    // archived conversations the same way AiRecommendation exposes
    // is_archived (deleted_at is normally hidden from casts' JSON).
    protected $appends = ['is_archived'];

    public function isArchived(): bool
    {
        return $this->trashed();
    }

    public function getIsArchivedAttribute(): bool
    {
        return (bool) $this->deleted_at;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(AiAdvisorMessage::class, 'conversation_id')->orderBy('created_at');
    }
}