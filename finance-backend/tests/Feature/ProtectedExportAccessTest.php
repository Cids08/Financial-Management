<?php

namespace Tests\Feature;

use App\Http\Middleware\EnforceRetentionPolicy;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ProtectedExportAccessTest extends TestCase
{
    public function createApplication()
    {
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();
        // Retention cleanup is unrelated to exports and must not access live data.
        $this->withoutMiddleware(EnforceRetentionPolicy::class);

        // /api/dashboard/export is gated by permission:dashboard.view, so the
        // middleware resolves the caller's role before the controller's
        // password validation ever runs. The role/permission tables have to
        // exist for that to be a 403-or-pass rather than a 500.
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
        DB::purge('sqlite');

        if (! Schema::hasTable('roles')) {
            Schema::create('roles', function (Blueprint $t) {
                $t->id();
                $t->string('name');
                $t->timestamps();
                $t->softDeletes();
            });
        }
        if (! Schema::hasTable('permissions')) {
            Schema::create('permissions', function (Blueprint $t) {
                $t->id();
                $t->string('permission_name');
                $t->timestamps();
                $t->softDeletes();
            });
        }
        if (! Schema::hasTable('role_permissions')) {
            Schema::create('role_permissions', function (Blueprint $t) {
                $t->id();
                $t->foreignId('role_id');
                $t->foreignId('permission_id');
                $t->timestamps();
            });
        }
    }

    /** A user whose role holds dashboard.view, so route middleware lets it through. */
    protected function userWithDashboardAccess(int $id): User
    {
        DB::table('roles')->insert(['id' => 1, 'name' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('permissions')->insert(['id' => 1, 'permission_name' => 'dashboard.view', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('role_permissions')->insert(['role_id' => 1, 'permission_id' => 1, 'created_at' => now(), 'updated_at' => now()]);

        return (new User())->forceFill(['id' => $id, 'role_id' => 1, 'must_change_password' => false]);
    }

    public function test_exports_require_authentication(): void
    {
        $this->postJson('/api/exports/csv')->assertUnauthorized();
        $this->postJson('/api/exports/pdf')->assertUnauthorized();
        $this->postJson('/api/dashboard/export')->assertUnauthorized();
    }

    public function test_dashboard_export_requires_the_dashboard_permission(): void
    {
        // No role at all -> 403 from the permission gate, before any PDF work.
        $this->actingAs((new User())->forceFill(['id' => 9, 'must_change_password' => false]), 'sanctum')
            ->postJson('/api/dashboard/export', ['export_password' => 'Test-export-password-2026'])
            ->assertForbidden();
    }

    public function test_exports_reject_missing_and_short_passwords(): void
    {
        $this->actingAs($this->userWithDashboardAccess(1), 'sanctum');
        foreach (['/api/exports/csv', '/api/exports/pdf', '/api/dashboard/export'] as $url) {
            $this->postJson($url, ['contents' => 'Reference,Amount'])->assertUnprocessable()->assertJsonValidationErrors('export_password');
            $this->postJson($url, ['contents' => 'Reference,Amount', 'export_password' => 'short'])->assertUnprocessable()->assertJsonValidationErrors('export_password');
        }
    }

    public function test_authenticated_csv_download_is_an_archive_and_not_cacheable(): void
    {
        $this->actingAs((new User())->forceFill(['id' => 2, 'must_change_password' => false]), 'sanctum');
        $response = $this->postJson('/api/exports/csv', ['contents' => 'Reference,Amount', 'export_password' => 'Test-export-password-2026']);
        $response->assertOk()->assertHeader('Content-Type', 'application/zip');
        self::assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        self::assertStringStartsWith('PK', $response->getContent());
    }

    public function test_authenticated_pdf_download_is_encrypted_and_not_cacheable(): void
    {
        $this->actingAs((new User())->forceFill(['id' => 3, 'must_change_password' => false]), 'sanctum');
        $response = $this->postJson('/api/exports/pdf', [
            'html' => '<html><body><h1>Financial Statement</h1><p>Prepared by: Test User</p><script type="text/php">throw new Exception("Must never execute");</script></body></html>',
            'export_password' => 'Test-export-password-2026',
        ]);
        $response->assertOk()->assertHeader('Content-Type', 'application/pdf');
        self::assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        self::assertStringStartsWith('%PDF-', $response->getContent());
        self::assertStringContainsString('/Encrypt', $response->getContent());
        self::assertStringNotContainsString('Financial Statement', $response->getContent());
    }
}
