<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Currency conversion for the single settings row.
     *
     * - base_currency: the currency every monetary column in the app is
     *   stored in (entered/kept in). Existing data is implicitly PHP, so
     *   that's the default.
     * - exchange_rates: JSON map of currency code => rate, meaning
     *   "1 {base_currency} = {rate} {code}". The base currency itself is
     *   always 1 and may be omitted. Amounts are converted for display
     *   only — stored values are never rewritten.
     */
    public function up(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->string('base_currency', 3)->default('PHP')->after('currency');
            $table->json('exchange_rates')->nullable()->after('base_currency');
        });
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn(['base_currency', 'exchange_rates']);
        });
    }
};
