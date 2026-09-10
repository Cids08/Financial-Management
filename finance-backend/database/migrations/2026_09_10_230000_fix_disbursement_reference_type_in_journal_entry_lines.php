<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Fix journal_entry_lines.reference_type for Disbursement-sourced entries.
 *
 * Updates lowercase 'disbursement' records to sentence-case 'Disbursement'
 * matching the General Ledger's source formatting.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('journal_entry_lines')
            ->where('reference_type', 'disbursement')
            ->update(['reference_type' => 'Disbursement']);
    }

    public function down(): void
    {
        DB::table('journal_entry_lines')
            ->where('reference_type', 'Disbursement')
            ->update(['reference_type' => 'disbursement']);
    }
};
