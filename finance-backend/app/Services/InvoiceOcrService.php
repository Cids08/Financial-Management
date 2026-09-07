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
        'invoice', 'receipt', 'bill', 'total', 'amount', 'due', 'date',
        'qty', 'quantity', 'subtotal', 'vat', 'tax', 'payment', 'balance',
        'php', '₱', 'reference', 'po no', 'purchase order',
    ];

    protected const MIN_KEYWORD_MATCHES = 2;

    /**
     * Phrases strongly associated with bank/e-wallet transfer confirmation
     * screens rather than vendor invoices or receipts. These share a lot
     * of vocabulary with real invoices (total, amount, reference number),
     * so a keyword-only check can't tell them apart — this list catches
     * the transfer-specific wording those screens almost always carry.
     */
    protected const TRANSFER_EXCLUSION_KEYWORDS = [
        'transfer successful', 'transfer result', 'transfer fee',
        'transfer amount', 'sent to', 'send money', 'you sent',
        'gcash', 'maya', 'mariBank', 'bpi', 'bdo', 'unionbank', 'grabpay',
        'account no', 'acct. no', 'acct no',
    ];

    /**
     * Technical diagrams, database schemas, ERDs, code screenshots, etc.
     * Often contain column names like "invoice_number", "amount", "date",
     * which fools naive keyword matching.
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
     * Returns:
     *   [
     *     'is_receipt' => bool,
     *     'message' => ?string,
     *     'raw_text' => string,
     *     'invoice_number' => ?string,
     *     'date' => ?string,        // Y-m-d if found
     *     'due_date' => ?string,    // Y-m-d if found
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
            || str_contains($normalized, 'total');

        $isReceipt = false;
        $message = null;

        if ($looksLikeDiagram) {
            $message = "This image appears to be a database schema or technical diagram, not a valid invoice or receipt.";
        } elseif ($looksLikeTransfer) {
            $message = "This image appears to be an e-wallet or bank transfer confirmation, not an official vendor invoice.";
        } elseif ($matches < self::MIN_KEYWORD_MATCHES || ! $hasCoreKeyword) {
            $message = "This doesn't look like an invoice or receipt — please upload a clearer photo or bill.";
        } elseif ($invoiceNumber === null) {
            $message = "No valid invoice or receipt number could be detected on this document.";
        } elseif ($amount === null && $date === null) {
            $message = "Could not detect billing amount or transaction date. Please fill in the details manually.";
        } else {
            $isReceipt = true;
        }

        return [
            'is_receipt' => $isReceipt,
            'message' => $message,
            'raw_text' => $text,
            'invoice_number' => $isReceipt ? $invoiceNumber : null,
            'date' => $isReceipt ? $date : null,
            'due_date' => null, // rarely distinguishable from issue date via OCR alone
            'amount' => $isReceipt ? $amount : null,
            'reference_no' => $isReceipt ? $this->extractReferenceNumber($text) : null,
        ];
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