<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links a `collectors` row to the `users` row the collector logs in with,
 * so the backend can answer "which collector is the currently
 * authenticated user?" without guessing off email matching.
 *
 * Nullable: not every collector necessarily has a login account (e.g. one
 * added to the roster before their account was created), and not every
 * user with the Collector role is guaranteed to have a collectors row yet
 * either — this FK just makes the link possible where it exists.
 *
 * Unique: one user should not be able to impersonate two different
 * collector identities via this link.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('collectors', 'user_id')) {
            Schema::table('collectors', function (Blueprint $table) {
                $table->foreignId('user_id')
                    ->nullable()
                    ->unique()
                    ->after('id')
                    ->constrained('users')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::table('collectors', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};