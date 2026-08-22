<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            if (! Schema::hasColumn('personal_access_tokens', 'ip_address')) {
                $table->string('ip_address', 45)->nullable()->after('tokenable_id');
            }

            if (! Schema::hasColumn('personal_access_tokens', 'user_agent')) {
                $table->string('user_agent')->nullable()->after('ip_address');
            }

            // Populated by a geolocation lookup on the IP at login time (see
            // AuthService::resolveLocation). Left null until that lookup
            // succeeds or if no provider is configured — SessionResource
            // already falls back to "Unknown location" on the frontend.
            if (! Schema::hasColumn('personal_access_tokens', 'location')) {
                $table->string('location')->nullable()->after('user_agent');
            }
        });
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            foreach (['ip_address', 'user_agent', 'location'] as $column) {
                if (Schema::hasColumn('personal_access_tokens', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};