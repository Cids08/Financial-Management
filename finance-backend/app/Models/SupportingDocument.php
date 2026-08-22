<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupportingDocument extends Model
{
    protected $fillable = [
        'reference_type',
        'reference_id',
        'file_name',
        'original_name',
        'storage_path',
        'mime_type',
        'file_size',
        'uploaded_by',
        'uploaded_at',
    ];

    protected $casts = [
        'uploaded_at' => 'datetime',
    ];

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}