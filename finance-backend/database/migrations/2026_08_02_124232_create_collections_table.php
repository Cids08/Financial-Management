<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * STUB: This migration has been superseded by
 * 2026_08_04_045202_create_collections_table.php which runs AFTER
 * collectors and cash_accounts tables are created (both needed as FK targets).
 * Keeping this file as a no-op so that projects that already ran it
 * (via the schema dump) don't error on migrate:fresh.
 */
return new class extends Migration
{
    public function up(): void
    {
        // No-op: real migration is in 2026_08_04_045202_create_collections_table.php
    }

    public function down(): void
    {
        // No-op
    }
};