<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use thiagoalessio\TesseractOCR\TesseractOCR;

/**
 * Free, self-hosted OCR — no external API key or per-call cost, per the
 * project's requirement to avoid recurring third-party bills.
 *
 * Honest limitation: Tesseract only reads text, it doesn't understand
 * images the way a vision model would. "Is this actually a receipt?" is
 * decided by keyword/pattern heuristics on the extracted text below, not
 * true image understanding. It reliably rejects images with no relevant
 * text (random photos, blank images), and this version also rejects most
 * bank/e-wallet transfer confirmations (GCash, bank apps, etc.) — those
 * share vocabulary with real invoices ("total", "amount", "reference
 * number"), so they used to slip through as false positives. It is still
 * not as robust as a real vision API would be at telling document TYPES
 * apart. If accuracy needs to improve further, swapping this service for
 * a Claude/Google Vision call is the upgrade path — at a per-call cost.
 */
class InvoiceOcrService
{
    /**
     * Keywords that suggest the image is actually some kind of invoice,
     * bill, or receipt. Only need to match a couple of these for the text
     * to be considered plausible — real documents are noisy/OCR is imperfect.
     */
    protected const RECEIPT_KEYWORDS = [
        'invoice', 'receipt', 'bill', 'billing', 'total', 'amount', 'due', 'date',
        'qty', 'quantity', 'subtotal', 'vat', 'tax', 'payment', 'balance',
        'php', '₱', 'reference', 'po no', 'purchase order', 'statement of account',
        'soa', 'sales invoice', 'official receipt', 'delivery receipt', 'remittance',
        'description', 'unit price', 'amount due', 'vendor', 'supplier', 'customer',
    ];

    protected const MIN_KEYWORD_MATCHES = 2;

    /**
     * Phrases strongly associated with bank/e-wallet transfer confirmation
     * screens rather than vendor invoices or receipts.
     */
    protected const TRANSFER_EXCLUSION_KEYWORDS = [
        'transfer successful', 'transfer result', 'transfer fee',
        'transfer amount', 'sent to', 'send money', 'you sent',
        'gcash', 'maya', 'mariBank', 'bpi', 'bdo', 'unionbank', 'grabpay',
        'account no', 'acct. no', 'acct no',
    ];

    /**
     * Technical diagrams, database schemas, ERDs, code screenshots, etc.
     */
    protected const DIAGRAM_EXCLUSION_KEYWORDS = [
        'varchar', 'primary key', 'foreign key', 'database', 'schema',
        'diagram', 'erd', 'entity relationship', 'table ', 'tables',
        'auto_increment', 'decimal(', 'int(', 'bigint', 'tinyint', 'references ',
        'boolean', 'nullable', 'char(', 'timestamp', 'datatype', 'data type',
        'one-to-many', 'many-to-many', 'one to many', 'many to many', 'crow\'s foot',
        'class diagram', 'flowchart', 'foreign_key', 'primary_key', 'create table',
        'drop table', 'alter table', 'foreign keys', 'primary keys', 'erd diagram',
        'drawsql', 'dbdiagram', 'lucidchart', 'dbeaver', 'phpmyadmin', 'navicat',
        'workbench', 'cardinality', 'attributes', 'identifying relationship',
        'mysql', 'postgresql', 'sqlite', 'sql server', 'mariadb', 'migration',
    ];

    /**
     * Academic papers, resumes, essays, homework, or general documents
     * that are clearly not invoices, bills, or official receipts.
     */
    protected const ACADEMIC_EXCLUSION_KEYWORDS = [
        'curriculum vitae', 'resume', 'abstract', 'introduction', 'methodology',
        'dissertation', 'thesis', 'literature review', 'bibliography', 'syllabus',
        'homework', 'assignment 1', 'assignment 2', 'term paper', 'student id',
        'course code', 'course title', 'instructor', 'professor', 'final exam',
        'midterm exam', 'lecture notes', 'table of contents',
    ];

    /**
     * Returns:
     *   [
     *     'is_receipt' => bool,
     *     'message' => ?string,
     *     'raw_text' => string,
     *     'invoice_number' => ?string,
     *     'date' => ?string,
     *     'due_date' => ?string,
     *     'amount' => ?float,
     *     'reference_no' => ?string,
     *   ]
     */
    public function scan(UploadedFile $image): array
    {
        $ocr = new TesseractOCR($image->getRealPath());

        if ($executable = config('services.tesseract.executable')) {
            $ocr->executable($executable);
        }

        $ocr->timeout(20);

        try {
            $text = $ocr->lang('eng')->run();
        } catch (\Exception $e) {
            $text = '';
        }

        return $this->evaluateExtractedText($text, 'image');
    }

    /**
     * Inspect and extract text from a PDF document to determine if it's
     * a genuine invoice, bill, or receipt.
     */
    public function scanPdf(UploadedFile $pdf): array
    {
        $text = $this->extractTextFromPdf($pdf->getRealPath());

        if (empty(trim($text))) {
            return [
                'is_receipt' => false,
                'message' => 'The PDF appears to be empty, encrypted, or contains no readable text or invoice image.',
                'raw_text' => '',
                'invoice_number' => null,
                'date' => null,
                'due_date' => null,
                'amount' => null,
                'reference_no' => null,
            ];
        }

        return $this->evaluateExtractedText($text, 'PDF document');
    }

    /**
     * Shared evaluation logic to verify whether extracted text represents
     * a valid invoice, bill, or receipt, rather than unrelated content.
     */
    protected function evaluateExtractedText(string $text, string $docType = 'document'): array
    {
        $normalized = strtolower($text);

        $looksLikeDiagram = false;
        foreach (self::DIAGRAM_EXCLUSION_KEYWORDS as $keyword) {
            if (str_contains($normalized, strtolower($keyword))) {
                $looksLikeDiagram = true;
                break;
            }
        }

        $looksLikeTransfer = false;
        foreach (self::TRANSFER_EXCLUSION_KEYWORDS as $keyword) {
            if (str_contains($normalized, strtolower($keyword))) {
                $looksLikeTransfer = true;
                break;
            }
        }

        $looksLikeAcademic = false;
        foreach (self::ACADEMIC_EXCLUSION_KEYWORDS as $keyword) {
            if (str_contains($normalized, strtolower($keyword))) {
                $looksLikeAcademic = true;
                break;
            }
        }

        $matches = 0;
        foreach (self::RECEIPT_KEYWORDS as $keyword) {
            if (str_contains($normalized, $keyword)) {
                $matches++;
            }
        }

        $invoiceNumber = $this->extractInvoiceNumber($text);
        $date = $this->extractDate($text);
        $amount = $this->extractAmount($text);

        $hasCoreKeyword = str_contains($normalized, 'invoice')
            || str_contains($normalized, 'receipt')
            || str_contains($normalized, 'bill')
            || str_contains($normalized, 'billing')
            || str_contains($normalized, 'total')
            || str_contains($normalized, 'statement')
            || str_contains($normalized, 'soa')
            || str_contains($normalized, 'amount due')
            || str_contains($normalized, 'delivery receipt');

        $isReceipt = false;
        $message = null;

        if ($looksLikeDiagram) {
            $message = "This {$docType} appears to be a database schema or technical diagram, not a valid invoice or receipt.";
        } elseif ($looksLikeTransfer) {
            $message = "This {$docType} appears to be an e-wallet or bank transfer confirmation, not an official vendor invoice.";
        } elseif ($looksLikeAcademic) {
            $message = "This {$docType} appears to be an academic paper, resume, or unrelated document, not a valid invoice or receipt.";
        } elseif ($matches < self::MIN_KEYWORD_MATCHES || ! $hasCoreKeyword) {
            $message = "This {$docType} does not contain invoice or receipt information (no billing keywords found). Please attach a valid supporting document.";
        } else {
            $isReceipt = true;
        }

        return [
            'is_receipt' => $isReceipt,
            'message' => $message,
            'raw_text' => $text,
            'invoice_number' => $isReceipt ? $invoiceNumber : null,
            'date' => $isReceipt ? $date : null,
            'due_date' => null,
            'amount' => $isReceipt ? $amount : null,
            'reference_no' => $isReceipt ? $this->extractReferenceNumber($text) : null,
        ];
    }

    /**
     * Extracts text from digital and scanned PDF files in pure PHP.
     */
    public function extractTextFromPdf(string $pdfPath): string
    {
        if (! file_exists($pdfPath) || filesize($pdfPath) === 0) {
            return '';
        }

        $content = @file_get_contents($pdfPath);
        if ($content === false) {
            return '';
        }

        $text = '';

        // 1. Decompress and parse /FlateDecode and raw text streams
        if (preg_match_all('/stream[\r\n]+(.*?)[\r\n]+endstream/s', $content, $streamMatches)) {
            foreach ($streamMatches[1] as $streamData) {
                $decompressed = @gzuncompress($streamData);
                if ($decompressed === false) {
                    $decompressed = $streamData;
                }

                // Extract text operators: (string) Tj, [(str)(ing)] TJ, etc.
                if (preg_match_all('/(?:\((?:\\\\.|[^\\\\\)])*\)|\[(?:[^\]]*)\])\s*(?:Tj|TJ|\'|\")/s', $decompressed, $textMatches)) {
                    foreach ($textMatches[0] as $match) {
                        if (preg_match_all('/\((.*?)\)/s', $match, $strMatches)) {
                            foreach ($strMatches[1] as $str) {
                                $text .= ' ' . stripcslashes($str);
                            }
                        }
                    }
                }

                // Also inspect text inside BT ... ET blocks
                if (preg_match_all('/BT[\r\n]+(.*?)[\r\n]+ET/s', $decompressed, $btMatches)) {
                    foreach ($btMatches[1] as $bt) {
                        if (preg_match_all('/\((.*?)\)/s', $bt, $strMatches)) {
                            foreach ($strMatches[1] as $str) {
                                $text .= ' ' . stripcslashes($str);
                            }
                        }
                    }
                }
            }
        }

        // 2. Fallback for raw text strings in the PDF container
        if (trim($text) === '') {
            if (preg_match_all('/\(([A-Za-z0-9\s,.\-:\/₱]{3,100})\)/', $content, $rawMatches)) {
                $text = implode(' ', $rawMatches[1]);
            }
        }

        // 3. Fallback for scanned PDFs (embedded JPEG images)
        if (trim($text) === '' && class_exists(TesseractOCR::class)) {
            $extractedImage = $this->extractFirstJpegFromPdf($content);
            if ($extractedImage) {
                $tempPath = tempnam(sys_get_temp_dir(), 'pdf_ocr_') . '.jpg';
                file_put_contents($tempPath, $extractedImage);
                try {
                    $ocr = new TesseractOCR($tempPath);
                    if ($executable = config('services.tesseract.executable')) {
                        $ocr->executable($executable);
                    }
                    $ocr->timeout(20);
                    $text = $ocr->lang('eng')->run();
                } catch (\Throwable $e) {
                    // Ignore OCR errors on fallback
                } finally {
                    @unlink($tempPath);
                }
            }
        }

        return trim($text);
    }

    /**
     * Extracts an embedded JPEG from a scanned PDF stream.
     */
    protected function extractFirstJpegFromPdf(string $content): ?string
    {
        if (preg_match('/\/Filter\s*\/DCTDecode.*?stream[\r\n]+(.*?)[\r\n]+endstream/s', $content, $m)) {
            $data = $m[1];
            $soi = strpos($data, "\xFF\xD8\xFF");
            if ($soi !== false) {
                $eoi = strrpos($data, "\xFF\xD9");
                if ($eoi !== false && $eoi > $soi) {
                    return substr($data, $soi, $eoi - $soi + 2);
                }
                return substr($data, $soi);
            }
        }
        return null;
    }

    protected function extractInvoiceNumber(string $text): ?string
    {
        $candidate = null;

        // Matches structured invoice codes like "INV-2026-0001", "SUP-INV-4471", "OR-12345"
        if (preg_match('/\b([A-Z]{2,6}-?\d{2,4}-?\d{3,6})\b/', $text, $m)) {
            $candidate = $m[1];
        } elseif (preg_match('/invoice\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Za-z0-9\-]{3,25})/i', $text, $m)) {
            $candidate = trim($m[1]);
        }

        if ($candidate) {
            $lower = strtolower($candidate);
            $invalidTokens = [
                'varchar', 'string', 'text', 'integer', 'number', 'boolean', 'table',
                'select', 'update', 'delete', 'insert', 'create', 'column', 'primary',
                'foreign', 'schema', 'entity', 'model', 'class', 'float', 'double',
                'nullable', 'char', 'date', 'timestamp', 'bigint', 'tinyint', 'int',
            ];
            // An invoice number MUST contain at least one digit, must not match SQL types (even with lengths like varchar255 or int11), and not be a keyword
            $isSqlType = (bool) preg_match('/^(?:varchar|string|text|integer|int|tinyint|bigint|boolean|table|column|primary|foreign|schema|entity|nullable|char|timestamp|datetime)\d*$/i', $candidate);
            if (preg_match('/\d/', $candidate) && ! in_array($lower, $invalidTokens, true) && ! $isSqlType) {
                return $candidate;
            }
        }

        return null;
    }

    protected function extractReferenceNumber(string $text): ?string
    {
        if (preg_match('/re(?:f|ference)\.?\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Za-z0-9\-]{4,20})/i', $text, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    protected function extractDate(string $text): ?string
    {
        // Common formats: 2026-08-09, 08/09/2026, Aug 9, 2026
        $patterns = [
            '/\b(\d{4}-\d{2}-\d{2})\b/',
            '/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/',
            '/\b([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\b/',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $text, $m)) {
                $ts = strtotime($m[1]);
                if ($ts !== false) {
                    return date('Y-m-d', $ts);
                }
            }
        }
        return null;
    }

    protected function extractAmount(string $text): ?float
    {
        // Prefer a line containing "total" with a following currency amount.
        if (preg_match('/total[^0-9]{0,10}([\d,]+\.\d{2})/i', $text, $m)) {
            return (float) str_replace(',', '', $m[1]);
        }
        // Fallback: largest currency-looking number in the whole text.
        if (preg_match_all('/(?:₱|php)?\s*([\d,]{1,3}(?:,\d{3})*\.\d{2})/i', $text, $matches)) {
            $amounts = array_map(fn ($v) => (float) str_replace(',', '', $v), $matches[1]);
            if (! empty($amounts)) {
                return max($amounts);
            }
        }
        return null;
    }
}