<?php

namespace Tests\Feature;

use App\Http\Middleware\EnforceRetentionPolicy;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase;

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
    }

    public function test_exports_require_authentication(): void
    {
        $this->postJson('/api/exports/csv')->assertUnauthorized();
        $this->postJson('/api/exports/pdf')->assertUnauthorized();
        $this->postJson('/api/dashboard/export')->assertUnauthorized();
    }

    public function test_exports_reject_missing_and_short_passwords(): void
    {
        $this->actingAs((new User())->forceFill(['id' => 1, 'must_change_password' => false]), 'sanctum');
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
