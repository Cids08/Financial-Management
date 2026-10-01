<?php

namespace App\Services;

use Com\Tecnick\Pdf\Encrypt\Encrypt;
use Com\Tecnick\Pdf\Tcpdf;
use RuntimeException;
use ZipArchive;

class ProtectedExportService
{
    public function pdf(string $source, #[\SensitiveParameter] string $password): string
    {
        $encryption = new Encrypt(true, bin2hex(random_bytes(16)), 3, ['print', 'print-high'], $password, bin2hex(random_bytes(32)));
        $pdf = new Tcpdf(objEncrypt: $encryption);
        $sourceId = $pdf->setImportSourceData($source);
        $pdf->appendDocument($sourceId);
        return $pdf->getOutPDFString();
    }

    public function csvArchive(string $contents, #[\SensitiveParameter] string $password): string
    {
        if (!class_exists(ZipArchive::class) || !ZipArchive::isEncryptionMethodSupported(ZipArchive::EM_AES_256)) {
            throw new RuntimeException('This server does not support encrypted ZIP exports.');
        }
        $path = tempnam(sys_get_temp_dir(), 'fms-export-');
        if ($path === false) throw new RuntimeException('Could not create export.');
        try {
            $zip = new ZipArchive();
            if ($zip->open($path, ZipArchive::OVERWRITE) !== true) throw new RuntimeException('Could not create archive.');
            if (!$zip->addFromString('report.csv', $contents) || !$zip->setEncryptionName('report.csv', ZipArchive::EM_AES_256, $password)) {
                $zip->close();
                throw new RuntimeException('Could not protect archive.');
            }
            if (!$zip->close()) throw new RuntimeException('Could not finish archive.');
            $bytes = file_get_contents($path);
            if ($bytes === false) throw new RuntimeException('Could not read archive.');
            return $bytes;
        } finally { if (is_file($path)) unlink($path); }
    }
}
