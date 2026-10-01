<?php

namespace Tests\Unit;

use App\Services\ProtectedExportService;
use Dompdf\Dompdf;
use PHPUnit\Framework\TestCase;
use ZipArchive;

class ProtectedExportServiceTest extends TestCase
{
    public function test_csv_requires_the_correct_password_and_preserves_unicode(): void
    {
        $contents = "\xEF\xBB\xBFReference,Amount\r\nINV-001,PHP 1234.50\r\nCustomer,Peña";
        $bytes = (new ProtectedExportService())->csvArchive($contents, 'Test-export-password-2026');
        $path = tempnam(sys_get_temp_dir(), 'fms-test-');
        try {
            file_put_contents($path, $bytes);
            $zip = new ZipArchive();
            self::assertTrue($zip->open($path));
            self::assertSame(ZipArchive::EM_AES_256, $zip->statName('report.csv')['encryption_method']);
            $zip->setPassword('incorrect');
            self::assertFalse(@$zip->getFromName('report.csv'));
            $zip->setPassword('Test-export-password-2026');
            self::assertSame($contents, $zip->getFromName('report.csv'));
            $zip->close();
        } finally { unlink($path); }
    }

    public function test_pdf_uses_aes_256_and_does_not_expose_report_text(): void
    {
        $source = new Dompdf();
        $source->loadHtml('<h1>Confidential invoice INV-12345</h1>');
        $source->render();
        $output = (new ProtectedExportService())->pdf($source->output(), 'Test-export-password-2026');
        self::assertStringStartsWith('%PDF-', $output);
        self::assertStringContainsString('/Encrypt', $output);
        self::assertStringContainsString('/AESV3', $output);
        self::assertStringNotContainsString('Confidential invoice', $output);
    }
}
