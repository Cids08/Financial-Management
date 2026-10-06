<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the indexes backing three queries that run on nearly every dashboard or
 * list load, and that currently have no usable index at all.
 *
 * tax_obligations (payment_date, due_date)
 *   DashboardService reads this table twice per dashboard render:
 *     - whereNull('payment_date')->sum('tax_amount')   (line 216)
 *     - whereBetween('due_date', ...)->whereNull('payment_date')
 *       ->orderBy('due_date')->limit($limit)          (line 353)
 *   The table already has a btree on due_date alone, which does not help
 *   either query: both filter on payment_date first, so every row has to be
 *   visited to find the unpaid ones. The composite index covers the filter
 *   and the ordering together, and puts only the unpaid rows in the index.
 *
 * customers (email)
 *   StoreCustomerRequest and UpdateCustomerRequest both carry
 *   Rule::unique('customers', 'email')->whereNull('deleted_at'), which runs
 *   a SELECT against the whole table on every customer save. Note the ILIKE
 *   '%term%' search in Customer::scopeSearch is deliberately NOT covered
 *   here: a leading wildcard cannot use a btree index, so an index on email
 *   would not help that query and would only cost write throughput.
 *
 * financial_forecasts (generated_at)
 *   FinancialForecastService::list() orders by generated_at DESC for every
 *   one of its three modes (active, archived, all), returning the entire
 *   result set. Without an index that is a full scan plus a sort, and it is
 *   the endpoint the forecasting page calls on every load.
 *
 * All three are plain non-unique indexes, so unlike the reference-number
 * migration this cannot fail on existing data and needs no cleanup query
 * beforehand.
 *
 * ORDERING: timestamped AFTER 2026_10_06_000000_add_unique_reference_indexes.php
 * so the unique-reference work is always attempted first. That one can fail
 * on pre-existing duplicates and needs its detection query run beforehand;
 * these cannot, but keeping it first means a duplicate never leaves this
 * migration unapplied too.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tax_obligations', function (Blueprint $table) {
            $table->index(['payment_date', 'due_date'], 'tax_obligations_payment_date_due_date_index');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->index('email', 'customers_email_index');
        });

        Schema::table('financial_forecasts', function (Blueprint $table) {
            $table->index('generated_at', 'financial_forecasts_generated_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('financial_forecasts', function (Blueprint $table) {
            $table->dropIndex('financial_forecasts_generated_at_index');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex('customers_email_index');
        });

        Schema::table('tax_obligations', function (Blueprint $table) {
            $table->dropIndex('tax_obligations_payment_date_due_date_index');
        });
    }
};