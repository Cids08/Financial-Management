<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class AiRecommendation extends Model
{
    use SoftDeletes;

    protected $table = 'ai_recommendations';

    protected $fillable = [
        'forecast_id',
        'category',
        'priority',
        'summary',
        'recommendation',
        'confidence_score',
        'estimated_impact',
        'generated_by',
        'updated_by',
        'generated_at',
        'deleted_by',
    ];

    protected $casts = [
        'confidence_score' => 'decimal:2',
        'estimated_impact' => 'decimal:2',
        'generated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    public function forecast(): BelongsTo
    {
        return $this->belongsTo(FinancialForecast::class, 'forecast_id');
    }

    public function generator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by');
    }
}