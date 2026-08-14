<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialForecast extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'forecast_no',
        'forecast_name',
        'forecast_type',
        'forecast_target',
        'historical_start',
        'historical_end',
        'forecast_start',
        'forecast_end',
        'forecast_period',
        'actual_amount',
        'predicted_amount',
        'confidence_level',
        'mape',
        'rmse',
        'algorithm',
        'model_version',
        'status',
        'generated_by',
        'updated_by',
        'generated_at',
        'remarks',
        'deleted_by',
    ];

    protected $casts = [
        'historical_start' => 'date',
        'historical_end' => 'date',
        'forecast_start' => 'date',
        'forecast_end' => 'date',
        'actual_amount' => 'decimal:2',
        'predicted_amount' => 'decimal:2',
        'confidence_level' => 'decimal:2',
        'mape' => 'decimal:2',
        'rmse' => 'decimal:2',
        'generated_at' => 'datetime',
    ];

    public function generator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}