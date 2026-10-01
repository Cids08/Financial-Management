<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ProtectedExportService;
use Illuminate\Http\Request;

class ProtectedExportController extends Controller
{
    public function pdf(Request $request, ProtectedExportService $exports)
    {
        $data = $request->validate([
            'export_password' => ['required', 'string', 'min:12', 'max:64'],
            'html' => ['required', 'string', 'max:2000000'],
        ]);
        // Client report markup is untrusted: never execute code or load network/local resources.
        $options = new \Dompdf\Options();
        $options->setIsPhpEnabled(false);
        $options->setIsJavascriptEnabled(false);
        $options->setIsRemoteEnabled(false);
        $options->setAllowedProtocols([]);
        $options->setDefaultFont('DejaVu Sans');
        $pdf = new \Dompdf\Dompdf($options);
        $pdf->setPaper('A4', 'landscape');
        $pdf->loadHtml($data['html'], 'UTF-8');
        $pdf->render();
        return response($exports->pdf($pdf->output(), $data['export_password']), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="report.pdf"',
            'Cache-Control' => 'no-store, private',
        ]);
    }

    public function csv(Request $request, ProtectedExportService $exports)
    {
        $data = $request->validate([
            'export_password' => ['required', 'string', 'min:12', 'max:64'],
            'contents' => ['required', 'string', 'max:5000000'],
        ]);
        return response($exports->csvArchive($data['contents'], $data['export_password']), 200, [
            'Content-Type' => 'application/zip',
            'Content-Disposition' => 'attachment; filename="report.zip"',
            'Cache-Control' => 'no-store, private',
        ]);
    }
}
