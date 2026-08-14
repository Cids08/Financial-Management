<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ServiceArea extends Model
{
    public $timestamps = true;

    protected $fillable = [
        'name',
        'code',
    ];

    public function collectors(): HasMany
    {
        return $this->hasMany(Collector::class);
    }
}