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
     * Returns:
     *   [
     *     'is_receipt' => bool,
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

        // On Windows dev machines, tesseract is often not resolvable from
        // the PATH the web server process actually runs under (Apache/
        // XAMPP loads its env at service start, not from later PATH edits).
        // Setting TESSERACT_PATH in .env sidesteps that entirely. On
        // Linux/prod this env var is typically unset, so the package falls
        // back to plain `tesseract`, resolved via the system PATH as usual.
        if ($executable = config('services.tesseract.executable')) {
            $ocr->executable($executable);
        }

        // Guards against a pathological image (or a stuck/misbehaving
        // Tesseract process) hanging the request indefinitely. 20s is
        // generous for a single receipt/invoice photo at the 6000px cap
        // enforced in InvoiceScanController; real scans finish in a
        // fraction of that.
        $ocr->timeout(20);

        try {
            $text = $ocr->lang('eng')->run();
        } catch (\Exception $e) {
            // The tesseract_ocr package throws rather than returning ""
            // both when it finds no text at all (e.g. a photo with no
            // text in it, like a cat pic) AND when the timeout above is
            // hit. Either way, that's not a real error for our purposes —
            // treat it the same as "not a receipt" rather than a 500.
            $text = '';
        }

        $normalized = strtolower($text);

        $matches = 0;
        foreach (self::RECEIPT_KEYWORDS as $keyword) {
            if (str_contains($normalized, $keyword)) {
                $matches++;
            }
        }

        $looksLikeTransfer = false;
        foreach (self::TRANSFER_EXCLUSION_KEYWORDS as $keyword) {
            if (str_contains($normalized, strtolower($keyword))) {
                $looksLikeTransfer = true;
                break;
            }
        }

        $invoiceNumber = $this->extractInvoiceNumber($text);
        $date = $this->extractDate($text);
        $amount = $this->extractAmount($text);

        // Keyword count alone is too easy to satisfy by accident — bank
        // transfer confirmations and payment receipts use the same
        // "total"/"amount"/"reference number" vocabulary as real invoices.
        // Require an actual invoice number to be extracted (the one field
        // transfer/payment screens essentially never have), AND reject
        // outright if transfer-specific wording is present.
        $isReceipt = $matches >= self::MIN_KEYWORD_MATCHES
            && $invoiceNumber !== null
            && ! $looksLikeTransfer;

        return [
            'is_receipt' => $isReceipt,
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
        // Matches things like "INV-2026-0001", "Invoice No: 12345", "SUP-INV-4471"
        if (preg_match('/\b([A-Z]{2,6}-?\d{2,4}-?\d{3,6})\b/', $text, $m)) {
            return $m[1];
        }
        if (preg_match('/invoice\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Za-z0-9\-]{4,20})/i', $text, $m)) {
            return trim($m[1]);
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