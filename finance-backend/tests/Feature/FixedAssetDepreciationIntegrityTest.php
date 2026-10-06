<?php

namespace Tests\Feature;

use App\Models\FixedAsset;
use App\Models\User;
use App\Services\FixedAssetService;
use Carbon\Carbon;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * FixedAssetService::update() recomputed accumulated_depreciation and
 * book_value from the depreciation basis on every save.
 *
 * Those figures are not a pure function of the basis once a depreciation run
 * has happened: executeDepreciationRun() posts a journal entry (Dr depreciation
 * expense, Cr accumulated depreciation) and writes the same figures onto the
 * asset. So the recompute silently rewrote already-posted history — the
 * contra-asset account in the trial balance stopped agreeing with the asset
 * register, with nothing in the audit log and no reversing entry.
 */
class FixedAssetDepreciationIntegrityTest extends TestCase
{
    public function createApplication()
    {
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();

        // Isolated SQLite only; the real migration chain is PostgreSQL SQL.
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');

        // Fixed so the elapsed-time arithmetic below is deterministic.
        Carbon::setTestNow('2026-10-06 00:00:00');

        // create() seeds the depreciation accounts into the chart of accounts.
        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('chart_of_accounts', function (Blueprint $t) {
            $t->id();
            $t->string('account_code')->nullable();
            $t->string('account_name')->nullable();
            $t->string('account_type')->nullable();
            $t->string('account_category')->nullable();
            $t->text('description')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('departments', function (Blueprint $t) {
            $t->id();
            $t->string('name')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('email')->nullable();
            $t->string('first_name')->nullable();
            $t->string('last_name')->nullable();
            $t->string('status')->default('Active');
            $t->unsignedInteger('role_id')->nullable();
            $t->unsignedInteger('created_by')->nullable();
            $t->unsignedInteger('updated_by')->nullable();
            $t->unsignedInteger('deleted_by')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        Schema::create('fixed_assets', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('department_id')->nullable();
            $t->string('asset_code')->unique();
            $t->string('asset_name');
            $t->string('asset_category')->default('Equipment');
            $t->string('serial_number')->nullable();
            $t->string('brand')->nullable();
            $t->string('model')->nullable();
            $t->string('location')->nullable();
            $t->date('purchase_date');
            $t->decimal('purchase_cost', 15, 2);
            $t->decimal('salvage_value', 15, 2)->default(0);
            $t->integer('useful_life_years');
            $t->string('depreciation_method')->default('Straight Line');
            $t->decimal('annual_depreciation', 15, 2)->default(0);
            $t->decimal('accumulated_depreciation', 15, 2)->default(0);
            $t->decimal('book_value', 15, 2)->default(0);
            $t->string('status')->default('Active');
            $t->text('remarks')->nullable();
            $t->unsignedInteger('created_by')->nullable();
            $t->unsignedInteger('updated_by')->nullable();
            $t->unsignedInteger('deleted_by')->nullable();
            $t->timestamps();
            $t->softDeletes();
        });

        DB::table('roles')->insert(['id' => 1, 'name' => 'admin']);
        DB::table('departments')->insert(['id' => 1, 'name' => 'Finance']);
        DB::table('users')->insert([
            'id' => 1, 'email' => 'admin@example.test', 'first_name' => 'Ada',
            'last_name' => 'Admin', 'status' => 'Active',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function actor(): User
    {
        return User::find(1);
    }

    /**
     * An asset two years into a five-year life: 500,000 cost, 50,000 salvage,
     * so 90,000 a year and roughly 180,000 accumulated.
     */
    private function asset(array $overrides = []): FixedAsset
    {
        $id = (int) DB::table('fixed_assets')->max('id') + 1;

        DB::table('fixed_assets')->insert(array_merge([
            'id' => $id,
            'asset_code' => 'FA-'.$id,
            'asset_name' => 'Delivery Van',
            'asset_category' => 'Equipment',
            'purchase_date' => '2024-10-06',
            'purchase_cost' => 500000,
            'salvage_value' => 50000,
            'useful_life_years' => 5,
            'depreciation_method' => 'Straight Line',
            'annual_depreciation' => 90000,
            // Exactly what a depreciation run writes: 730 days / 365.25 years
            // x 90,000 a year. Storing a round 180,000 here instead would be
            // fiction the formula can never reproduce.
            'accumulated_depreciation' => 179876.80,
            'book_value' => 320123.20,
            'status' => 'Active',
        ], $overrides));

        return FixedAsset::find($id);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'asset_code'        => 'FA-UPDATED',
            'asset_name'        => 'Delivery Van',
            'asset_category'    => 'Equipment',
            'purchase_date'     => '2024-10-06',
            'purchase_cost'     => 500000,
            'salvage_value'     => 50000,
            'useful_life_years' => 5,
            'depreciation_method' => 'Straight Line',
        ], $overrides);
    }

    public function test_an_edit_cannot_reduce_depreciation_already_posted_to_the_ledger(): void
    {
        // 180,000 is posted. Spreading the useful life to 10 years would
        // recompute it to roughly 90,000, contradicting a credit that has
        // already hit the contra-asset account.
        $asset = $this->asset();

        try {
            $this->app->make(FixedAssetService::class)->update($this->actor(), $asset, $this->payload([
                'asset_code'        => $asset->asset_code,
                'useful_life_years' => 10,
            ]));
            $this->fail('Reducing posted accumulated depreciation must be refused');
        } catch (ValidationException $e) {
            $this->assertNotEmpty($e->errors());
        }

        $fresh = $asset->fresh();
        $this->assertSame('179876.80', $fresh->accumulated_depreciation);
        $this->assertSame('320123.20', $fresh->book_value);
    }

    public function test_a_lower_purchase_cost_is_also_refused(): void
    {
        // Same destructive direction: less cost, less depreciation, but the
        // contra-asset account already carries the higher credit.
        $asset = $this->asset();

        $this->expectException(ValidationException::class);

        try {
            $this->app->make(FixedAssetService::class)->update($this->actor(), $asset, $this->payload([
                'asset_code'    => $asset->asset_code,
                'purchase_cost' => 200000,
            ]));
        } finally {
            $this->assertSame('179876.80', $asset->fresh()->accumulated_depreciation);
        }
    }

    public function test_a_higher_salvage_value_is_also_refused(): void
    {
        $asset = $this->asset();

        $this->expectException(ValidationException::class);

        try {
            $this->app->make(FixedAssetService::class)->update($this->actor(), $asset, $this->payload([
                'asset_code'    => $asset->asset_code,
                'salvage_value' => 300000,
            ]));
        } finally {
            $this->assertSame('179876.80', $asset->fresh()->accumulated_depreciation);
        }
    }

    public function test_an_ordinary_edit_is_still_allowed(): void
    {
        $asset = $this->asset();

        $updated = $this->app->make(FixedAssetService::class)->update($this->actor(), $asset, $this->payload([
            'asset_code' => $asset->asset_code,
            'asset_name' => 'Delivery Van (Repainted)',
            'location'   => 'Cebu Depot',
        ]));

        $this->assertSame('Delivery Van (Repainted)', $updated->asset_name);
        $this->assertSame('Cebu Depot', $updated->location);

        // Same basis, so the figures are unchanged.
        $this->assertSame('179876.80', $updated->accumulated_depreciation);
        $this->assertSame('90000.00', $updated->annual_depreciation);
    }

    public function test_an_omitted_salvage_value_does_not_reset_to_zero(): void
    {
        // salvage_value is nullable, so a client can legitimately leave it
        // out. The old code turned that into 0, silently discarding the
        // depreciable base and overstating annual depreciation.
        $asset = $this->asset(['salvage_value' => 50000]);

        $payload = $this->payload(['asset_code' => $asset->asset_code]);
        unset($payload['salvage_value']);

        $updated = $this->app->make(FixedAssetService::class)->update($this->actor(), $asset, $payload);

        $this->assertSame('50000.00', $updated->salvage_value);
        $this->assertSame('90000.00', $updated->annual_depreciation);
    }

    public function test_a_brand_new_asset_may_still_be_set_up_from_scratch(): void
    {
        // Nothing has been posted yet, so the full basis must remain
        // settable on creation.
        $created = $this->app->make(FixedAssetService::class)->create($this->actor(), [
            'asset_code'        => 'FA-NEW',
            'asset_name'        => 'Forklift',
            'asset_category'    => 'Equipment',
            'purchase_date'     => '2026-01-01',
            'purchase_cost'     => 250000,
            'salvage_value'     => 25000,
            'useful_life_years' => 5,
        ]);

        $this->assertSame('45000.00', $created->annual_depreciation);
        $this->assertGreaterThan(0, (float) $created->accumulated_depreciation);
    }
}