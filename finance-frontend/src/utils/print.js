// Shared printing/export toolkit.
//
// Every printable document in the app used to hand-roll its own HTML string,
// its own inline <style> block and its own window.open/write/print dance.
// That produced 13 slightly different-looking "official" documents  —  and a
// handful of real defects along the way (masked amounts on money documents,
// no company letterhead, no @page, no signature blocks, unescaped values).
//
// Everything printed now goes through this module so the paper output is
// consistent: one stylesheet, one letterhead, one running footer, one
// signature block, one escaping helper.
//
// What this module deliberately does NOT do:
//   - It does not mask amounts. Print/export is an explicit "produce this
//     record" action, so it always uses real values (formatCurrencyRaw).
//     See utils/formatters.js for that rule.
//   - It does not promise per-page numbering. Chrome (the app's target) does
//     not support @page margin boxes / counter(page), so a "Page 2 of 7"
//     counter can't be produced from CSS. The running footer below IS fixed
//     positioned, so it repeats on every physical page. Multi-page packages
//     (Reports.jsx) additionally label each sheet "Part N of M".

import { formatCurrencyRaw, currencySymbol, getActiveCurrency } from './formatters'

/* ------------------------------------------------------------------ *
 * Escaping
 * ------------------------------------------------------------------ */

/**
 * HTML-escapes a value for interpolation into a print document.
 *
 * Print documents are built as HTML strings and injected via
 * document.write(), so any user-supplied text (customer names, remarks,
 * descriptions) is an injection vector without this. Every print call site
 * must pass dynamic values through here.
 */
export const escapeHtml = (value) => {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Money for print. Real value, never privacy-masked. */
export const money = (value) => formatCurrencyRaw(value)

/** Currency label for print, e.g. "PHP (₱)" — honours the Settings currency. */
export const currencyLabel = () => `${getActiveCurrency()} (${currencySymbol()})`

/** Timestamp for print footers — en-PH, matching the rest of the app. */
export const printTimestamp = (date = new Date()) =>
  date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/* ------------------------------------------------------------------ *
 * Stylesheet
 * ------------------------------------------------------------------ */

/**
 * Per-document-type page geometry.
 *
 * Margin is not one-size-fits-all: a statutory BIR form is a fixed box
 * layout that needs the paper it will be filed on, while a 9-column register
 * needs every millimetre of width it can get, and anything carrying a
 * signature block needs vertical room so the rules don't land at the page
 * edge. Naming the intent per document family keeps the numbers in one
 * auditable place instead of scattered magic values at each call site.
 *
 * `margin` accepts a single number (all sides) or an object with
 * { top, right, bottom, left } in millimetres.
 *
 * `footerSpace` reserves room for the fixed running footer, which is
 * positioned at the bottom of the *content* box (not the page margin), so
 * without it the last table row and the signature rules can be overlapped.
 */
export const PAGE_SPECS = {
  // ── Money documents: portrait, room for the counterparty signature ──
  bill:        { orientation: 'portrait',  margin: { top: 14, right: 14, bottom: 20, left: 14 }, density: 'normal', footerSpace: true },
  invoice:     { orientation: 'portrait',  margin: { top: 14, right: 14, bottom: 20, left: 14 }, density: 'normal', footerSpace: true },
  receipt:     { orientation: 'portrait',  margin: { top: 12, right: 12, bottom: 18, left: 12 }, density: 'compact', footerSpace: true },
  expense:     { orientation: 'portrait',  margin: { top: 14, right: 14, bottom: 20, left: 14 }, density: 'normal', footerSpace: true },

  // ── Registers and wide tabular: landscape, tight sides ──
  budget:      { orientation: 'landscape', margin: { top: 12, right: 10, bottom: 16, left: 10 }, density: 'compact', footerSpace: true },
  register:    { orientation: 'landscape', margin: { top: 12, right: 10, bottom: 16, left: 10 }, density: 'compact', footerSpace: true },

  // ── Customer statement: landscape for 8 columns; the batch variant is
  //    portrait with a deliberately smaller type so one statement fits a sheet.
  statement:      { orientation: 'landscape', margin: { top: 12, right: 10, bottom: 16, left: 10 }, density: 'compact', footerSpace: true },
  statementBatch: { orientation: 'portrait',  margin: { top: 10, right: 10, bottom: 14, left: 10 }, density: 'compact', footerSpace: true },

  // ── Fixed-asset schedule: landscape, 7 numeric columns ──
  schedule:   { orientation: 'landscape', margin: { top: 12, right: 10, bottom: 16, left: 10 }, density: 'compact', footerSpace: true },

  // ── Disbursement voucher: pre-printed-style, generous signing room ──
  voucher:    { orientation: 'portrait',  margin: { top: 15, right: 15, bottom: 18, left: 15 }, density: 'normal', footerSpace: false },

  // ── Statutory forms (BIR 2307): filed on government paper, so the tight
  //    margin and small type are deliberate  -  don't "improve" these.
  statutory:  { orientation: 'portrait',  margin: { top: 10, right: 10, bottom: 12, left: 10 }, density: 'compact', footerSpace: false },

  // ── Management/statutory report package: ERP-style 0.75in working margin ──
  report:     { orientation: 'portrait',  margin: { top: 19, right: 19, bottom: 19, left: 19 }, density: 'normal', footerSpace: false },

  // ── Live dashboard snapshot: no signature block, so a tight bottom is fine ──
  snapshot:   { orientation: 'portrait',  margin: { top: 14, right: 12, bottom: 14, left: 12 }, density: 'normal', footerSpace: false },
}

/**
 * Resolves a spec name (or an explicit options object) into full page
 * options. Call sites pass e.g. `spec: 'bill'`.
 */
export const resolvePageSpec = (specOrOptions) => {
  if (typeof specOrOptions === 'string') {
    const spec = PAGE_SPECS[specOrOptions]
    if (!spec) {
      throw new Error(`[print] unknown PAGE_SPEC "${specOrOptions}"`)
    }
    return { paper: 'A4', ...spec }
  }
  return { paper: 'A4', orientation: 'portrait', margin: 14, density: 'normal', footerSpace: true, ...(specOrOptions || {}) }
}

/** Normalises a number-or-object margin into a CSS @page margin value. */
const marginCss = (margin) => {
  if (typeof margin === 'number') return `${margin}mm`
  const { top, right, bottom, left } = margin
  return `${top}mm ${right}mm ${bottom}mm ${left}mm`
}

/**
 * The shared print stylesheet.
 *
 * @param {object} opts
 * @param {'A4'|'Letter'} opts.paper  Paper size (A4 is the PH default here).
 * @param {'portrait'|'landscape'} opts.orientation
 * @param {number|{top,right,bottom,left}} opts.margin  Page margin in mm.
 * @param {string} opts.density  'compact' tightens table padding for the
 *                               7-8 column registers (SOA, BIR, reports).
 * @param {boolean} opts.footerSpace  Pad the content box so the fixed
 *                                    running footer can't overlap it.
 */
export const printStyles = ({
  paper = 'A4',
  orientation = 'portrait',
  margin = 14,
  density = 'normal',
  footerSpace = true,
} = {}) => {
  const cellPad = density === 'compact' ? '5px 7px' : '7px 9px'
  const fontSize = density === 'compact' ? '10pt' : '10.5pt'

  // The running footer is ~6mm tall including its rule and padding.
  const footerPad = footerSpace ? 'padding-bottom: 9mm;' : ''

  return `
@page { size: ${paper} ${orientation}; margin: ${marginCss(margin)}; }

*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

body {
  font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: ${fontSize};
  line-height: 1.45;
  color: #111827;
  background: #fff;
  ${footerPad}
  /* Keeps status pills, shaded table headers, and coloured variance
     figures from being dropped when the browser prints without
     background graphics. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.pf-root { padding: 0 4mm 14mm; }

/* --- letterhead ------------------------------------------------- */
.pf-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12mm;
  border-bottom: 2px solid #0f2744;
  padding-bottom: 4mm;
  margin-bottom: 5mm;
}
.pf-brand { display: flex; align-items: center; gap: 4mm; }
.pf-logo { max-height: 16mm; max-width: 45mm; object-fit: contain; }
.pf-logo-init {
  width: 13mm; height: 13mm; border: 1.5px solid #0f2744; border-radius: 2px;
  display: flex; align-items: center; justify-content: center;
  font-size: 17pt; font-weight: 700; color: #0f2744;
}
.pf-company-name { font-size: 13pt; font-weight: 700; color: #0f2744; text-transform: uppercase; letter-spacing: 0.4px; }
.pf-company-meta { font-size: 8.5pt; color: #475569; margin-top: 1mm; }
.pf-doc-meta { text-align: right; min-width: 62mm; }
.pf-doc-title { font-size: 12pt; font-weight: 700; color: #0f2744; text-transform: uppercase; }
.pf-meta-row { font-size: 8.5pt; color: #334155; margin-top: 1.2mm; }
.pf-meta-label { color: #64748b; }
.pf-meta-val { color: #111827; font-weight: 600; }
.pf-confidential {
  display: inline-block; margin-top: 2mm; padding: 0.8mm 2.5mm;
  border: 1px solid #0f2744; font-size: 7.5pt; font-weight: 700;
  letter-spacing: 0.6px; color: #0f2744; text-transform: uppercase;
}

/* --- document title block --------------------------------------- */
.pf-title { font-size: 15pt; font-weight: 700; color: #0f2744; text-align: center; margin: 2mm 0 1mm; }
.pf-subtitle { font-size: 9.5pt; color: #475569; text-align: center; margin-bottom: 4mm; }

/* --- key/value detail tables ------------------------------------ */
table.pf-kv { width: 100%; border-collapse: collapse; }
table.pf-kv td { padding: ${cellPad} 3mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
table.pf-kv td.pf-k { width: 34%; color: #64748b; }
table.pf-kv td.pf-v { font-weight: 600; text-align: right; }
table.pf-kv tr.pf-section td {
  background: #f1f5f9; font-weight: 700; color: #0f2744; font-size: 8.5pt;
  text-transform: uppercase; letter-spacing: 0.5px; text-align: left;
}
table.pf-kv tr.pf-total td { border-top: 1.5px solid #0f2744; border-bottom: 3px double #0f2744; font-weight: 700; font-size: 11pt; }
table.pf-kv tr.pf-total td.pf-v { color: #0f2744; }

/* --- data tables ------------------------------------------------ */
table.pf-grid { width: 100%; border-collapse: collapse; margin-top: 3mm; }
table.pf-grid th {
  background: #0f2744; color: #fff; font-size: 8.5pt; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.4px;
  padding: ${cellPad}; text-align: left; border: 1px solid #0f2744;
}
table.pf-grid td { padding: ${cellPad}; border: 1px solid #e2e8f0; }
table.pf-grid td.pf-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.pf-grid tfoot td {
  border-top: 1.5px solid #0f2744; border-bottom: 3px double #0f2744;
  font-weight: 700; background: #f8fafc;
}
table.pf-grid tfoot td.pf-num { font-weight: 700; }

/* Repeat column headers on every page and never split a row across a
   page break  —  without these, page 2 of a long register loses its
   header row and mid-row splits look broken. */
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
tr, .pf-avoid { break-inside: avoid; page-break-inside: avoid; }
thead { break-inside: avoid; }

/* --- badges ----------------------------------------------------- */
.pf-badge {
  display: inline-block; padding: 0.6mm 2.2mm; border-radius: 2px;
  font-size: 7.5pt; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.4px; border: 1px solid currentColor;
}
.pf-badge-paid { color: #166534; background: #dcfce7; }
.pf-badge-pending { color: #854d0e; background: #fef9c3; }
.pf-badge-overdue { color: #991b1b; background: #fee2e2; }
.pf-badge-neutral { color: #334155; background: #f1f5f9; }

/* --- signature block -------------------------------------------- */
.pf-signatures { margin-top: 12mm; break-inside: avoid; page-break-inside: avoid; }
.pf-signatures-title {
  font-size: 9pt; font-weight: 700; color: #0f2744; text-transform: uppercase;
  letter-spacing: 0.6px; border-bottom: 1px solid #cbd5e1;
  padding-bottom: 1.5mm; margin-bottom: 6mm;
}
.pf-sig-row { display: flex; gap: 8mm; }
.pf-sig-box { flex: 1 1 0; min-width: 0; }
.pf-sig-label { font-size: 8.5pt; font-weight: 700; color: #334155; }
.pf-sig-rule { border-bottom: 1px solid #111827; height: 13mm; }
.pf-sig-name { font-size: 9.5pt; font-weight: 600; color: #111827; margin-top: 1.5mm; }
.pf-sig-role { font-size: 8pt; color: #64748b; }
.pf-sig-date { font-size: 8pt; color: #334155; margin-top: 1.5mm; }

/* --- certification / oath --------------------------------------- */
.pf-certification {
  margin-top: 10mm; padding: 4mm; border: 1px solid #cbd5e1;
  font-size: 8.5pt; line-height: 1.6; color: #1f2937;
  break-inside: avoid; page-break-inside: avoid;
}
.pf-certification-title { font-weight: 700; color: #0f2744; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 1.5mm; }

/* --- running footer --------------------------------------------- */
/* position:fixed in print repeats this on EVERY physical page, which is
   the only reliable way to get a running footer out of Chrome. */
.pf-footer {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: flex; justify-content: space-between; align-items: center;
  border-top: 1px solid #cbd5e1; padding: 2mm 4mm 0;
  font-size: 7.5pt; color: #64748b; background: #fff;
}
.pf-footer-brand { font-weight: 600; }
.pf-footer-note { text-transform: uppercase; letter-spacing: 0.4px; }

/* --- customer / statement specific ----------------------------- */
.pf-customer {
  display: flex; flex-wrap: wrap; gap: 3mm 8mm;
  padding: 3mm 4mm; margin-bottom: 4mm;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 2px;
}
.pf-customer > div { font-size: 9pt; }
.pf-customer span { display: block; color: #64748b; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.4px; }
.pf-customer strong { color: #111827; }

.pf-aging-row { display: flex; flex-wrap: wrap; gap: 2mm; margin-bottom: 4mm; }
.pf-aging-box {
  flex: 1 1 0; min-width: 28mm; text-align: center; padding: 2.5mm 2mm;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 2px;
}
.pf-aging-label { font-size: 7.5pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
.pf-aging-val { font-size: 11pt; font-weight: 700; color: #0f2744; }

.pf-chip-row { display: flex; flex-wrap: wrap; gap: 2mm; margin-bottom: 4mm; }
.pf-chip {
  padding: 1.2mm 3mm; font-size: 8.5pt; background: #f1f5f9;
  border: 1px solid #e2e8f0; border-radius: 2px;
}

/* --- pagination (multi-sheet documents) ------------------------ */
.pf-sheet { position: relative; }
.pf-sheet + .pf-sheet { margin-top: 0; }
/* Break BETWEEN sheets only; the last sheet deliberately carries no break
   so the document never ends on a blank page. */
.pf-sheet-break { break-after: page; page-break-after: always; }
.pf-batch-head { margin-bottom: 4mm; }

/* --- misc -------------------------------------------------------- */
.pf-note { font-size: 8pt; color: #64748b; margin-top: 3mm; }

/* 'span' row option: value starts in the label column instead of being
   right-aligned  -  used for long free-text fields (addresses, remarks). */
.pf-kv .pf-span { text-align: left; }
/* 'muted' row option: secondary/optional field, printed in grey. */
.pf-kv .pf-muted { color: #64748b; }
.pf-disclaimer {
  margin-top: 6mm; padding-top: 2mm; border-top: 1px solid #e2e8f0;
  font-size: 7.5pt; color: #94a3b8; line-height: 1.5;
}
.pf-empty { padding: 8mm; text-align: center; color: #94a3b8; font-style: italic; }
`
}

/* ------------------------------------------------------------------ *
 * Letterhead / footer / signatures
 * ------------------------------------------------------------------ */

/**
 * The standard document header. Present on every printed document so a
 * loose page is always attributable  —  previously 10 of 13 documents
 * printed no company name at all.
 *
 * @param {object} o
 * @param {object} o.company      useCompany() value
 * @param {string} o.title        Document title, e.g. "Official Receipt"
 * @param {Array<[string,string]>} o.meta  Extra label/value rows
 * @param {string} o.confidential Optional uppercase stamp
 * @param {string} o.preparedBy   Name of the user printing the document
 * @param {string} o.preparedRole Their title/role
 * @param {boolean} o.provenance  Auto-append Run Date / Generated By / Currency
 *                                rows (default true). Any label already present
 *                                in `meta` is not repeated.
 */
export const buildHeader = ({
  company,
  title,
  subtitle = '',
  meta = [],
  confidential = '',
  preparedBy = '',
  preparedRole = '',
  provenance = true,
} = {}) => {
  // Guard: useCompany() spreads the company fields at the TOP level, so
  // `const { company } = useCompany()` silently yields undefined. That used to
  // print a bare "FMS" initial box with no logo, address or contact line.
  // Fail loudly in development instead of shipping a blank letterhead.
  if (import.meta.env?.DEV && !company) {
    console.warn(
      '[print] buildHeader received no company  -  pass the whole useCompany() ' +
      'value, not a destructured `company` key.')
  }

  const logo = company?.logoUrl
    ? `<img class="pf-logo" src="${escapeHtml(company.logoUrl)}" alt="${escapeHtml(company?.name || 'Company')} logo" />`
    : `<div class="pf-logo-init">${escapeHtml((company?.name || 'FMS').charAt(0).toUpperCase())}</div>`

  const contact = [company?.address, company?.phone, company?.email]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' &nbsp;·&nbsp; ')

  const allMeta = [...meta]

  // Standard provenance every official document should carry, matching the
  // Reports.jsx letterhead. Dedupe by label so a caller-supplied "Run Date"
  // or "Currency" row is never printed twice.
  if (provenance) {
    const have = new Set(allMeta.map(([l]) => String(l).toLowerCase()))
    const add = (label, value) => {
      if (!value) return
      if (have.has(label.toLowerCase())) return
      have.add(label.toLowerCase())
      allMeta.push([label, value])
    }
    add('Run Date', printTimestamp())
    add('Generated By', preparedBy ? (preparedRole ? `${preparedBy} (${preparedRole})` : preparedBy) : '')
    add('Currency', currencyLabel())
  }

  const metaRows = allMeta
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([label, value]) =>
      `<div class="pf-meta-row"><span class="pf-meta-label">${escapeHtml(label)}:</span> <span class="pf-meta-val">${escapeHtml(value)}</span></div>`)
    .join('')

  return `
<div class="pf-header">
  <div class="pf-brand">
    ${logo}
    <div>
      <div class="pf-company-name">${escapeHtml(company?.name || 'Financial Management System')}</div>
      ${contact ? `<div class="pf-company-meta">${contact}</div>` : ''}
    </div>
  </div>
  <div class="pf-doc-meta">
    <div class="pf-doc-title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="pf-meta-row">${escapeHtml(subtitle)}</div>` : ''}
    ${metaRows}
    ${confidential ? `<div class="pf-confidential">${escapeHtml(confidential)}</div>` : ''}
  </div>
</div>`
}

/**
 * Running footer. Fixed-positioned so it repeats on every printed page.
 *
 * @param {object} o
 * @param {object} o.company
 * @param {string} o.note   Short right-hand stamp, e.g. "Confidential"
 * @param {string} o.detail Middle provenance line
 */
export const buildFooter = ({ company, note = '', detail = '' } = {}) => `
<div class="pf-footer">
  <span class="pf-footer-brand">${escapeHtml(company?.name || 'Financial Management System')}</span>
  ${detail ? `<span>${escapeHtml(detail)}</span>` : '<span></span>'}
  <span class="pf-footer-note">${escapeHtml(note || `Printed ${printTimestamp()}`)}</span>
</div>`

/**
 * Flexible signature / approval block.
 *
 * Which documents get one is a per-module decision, not a blanket rule  —
 * see SIGNATURE_PRESETS below. Money-moving and statutory documents carry
 * one; a live dashboard snapshot deliberately does not.
 *
 * @param {object} o
 * @param {string} o.title  Section heading
 * @param {Array<{label,name,role,date,line,blank}>} o.blocks
 * @param {number} o.columns  Max boxes per row (wraps automatically)
 */
export const buildSignatureBlock = ({
  title = 'Approval & Signatures',
  blocks = [],
  columns = 0,
} = {}) => {
  if (!blocks.length) return ''

  const max = columns || Math.min(blocks.length, 4)
  const rows = []
  for (let i = 0; i < blocks.length; i += max) rows.push(blocks.slice(i, i + max))

  const renderBox = (b) => `
    <div class="pf-sig-box">
      <div class="pf-sig-label">${escapeHtml(b.label)}</div>
      <div class="pf-sig-rule"></div>
      <div class="pf-sig-name">${escapeHtml(b.name || '\u00a0')}</div>
      ${b.role ? `<div class="pf-sig-role">${escapeHtml(b.role)}</div>` : ''}
      ${b.date ? `<div class="pf-sig-date">${escapeHtml(b.date)}</div>` : ''}
      ${b.line ? `<div class="pf-sig-date">${escapeHtml(b.line)}</div>` : ''}
    </div>`

  return `
<div class="pf-signatures">
  ${title ? `<div class="pf-signatures-title">${escapeHtml(title)}</div>` : ''}
  ${rows.map((row) => `<div class="pf-sig-row">${row.map(renderBox).join('')}</div>`).join('<div style="height:6mm"></div>')}
</div>`
}

/**
 * Default signatory blocks per document family. Roles are the fallback text
 * when the record has no named approver recorded  —  which is the normal
 * case for a document printed straight off a transaction.
 *
 * `blank: true` means "no default name  —  leave the rule empty", used for
 * the third-party side of a document (a customer or supplier has to sign,
 * and we must not pre-fill their name for them).
 */
const blankRule = (label, line = '') => ({ label, name: ' ', blank: true, line })

export const SIGNATURE_PRESETS = {
  // Bills, invoices, receipts: we prepared it, we approved it, and the
  // counterparty acknowledges receipt.
  voucher: ({ preparedName, preparedRole, approvedName, counterpartyLabel = 'Received By' }) => [
    { label: 'Prepared By', name: preparedName || 'Accounting Staff', role: preparedRole || 'Finance Officer', date: `Date: ${printTimestamp().split(',')[0]}` },
    { label: 'Approved By', name: approvedName || 'Finance Manager', role: 'Reviewed & Approved', date: 'Date: ____________________' },
    blankRule(counterpartyLabel, 'Signature over printed name'),
  ],

  // Internal expense/budget documents: no third party signs.
  internal: ({ preparedName, preparedRole, approvedName }) => [
    { label: 'Prepared By', name: preparedName || 'Accounting Staff', role: preparedRole || 'Finance Officer', date: `Date: ${printTimestamp().split(',')[0]}` },
    { label: 'Reviewed By', name: 'Internal Auditor / Controller', role: 'Internal Audit', date: 'Date: ____________________' },
    { label: 'Approved By', name: approvedName || 'Finance Manager / CFO', role: 'Management Approval', date: 'Date: ____________________' },
  ],

  // Management/statutory reports: the three-step audit chain.
  report: ({ preparedName, preparedRole, approvedName }) => [
    { label: 'Prepared By', name: preparedName || 'Accounting Staff / Bookkeeper', role: preparedRole || 'Finance Officer', date: `Date: ${printTimestamp().split(',')[0]}` },
    { label: 'Verified & Reviewed By', name: 'Internal Auditor / Controller', role: 'Internal Audit Department', date: 'Date: ____________________' },
    { label: 'Approved By', name: approvedName || 'Chief Financial Officer / Managing Director', role: 'Executive Management', date: 'Date: ____________________' },
  ],

  // Customer-facing statement: we certify the ledger, the customer receives.
  statement: ({ preparedName, preparedRole, customerName }) => [
    { label: 'Certified Correct By', name: preparedName || 'Accounting Staff / Bookkeeper', role: preparedRole || 'Finance Officer', date: `Date: ${printTimestamp().split(',')[0]}` },
    { label: 'Received By', name: ' ', blank: true, line: `${customerName || 'Customer'}  ·  Date: ____________________` },
  ],
}

/* ------------------------------------------------------------------ *
 * Document assembly + printing
 * ------------------------------------------------------------------ */

/**
 * Warms the HTTP cache for the logo by loading it in the OPENER document.
 *
 * This is only an optimisation — it makes the print window's own <img>
 * request near-instant, but it is NOT the signal we wait on. Two documents
 * can load the same URL and the print window still has to decode and paint
 * its own copy before Chrome snapshots the DOM for printing.
 */
function preloadImage(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (!url) { resolve(); return }
    const img = new Image()
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    img.onload = done
    img.onerror = done
    setTimeout(done, timeoutMs)
    img.src = url
  })
}

/**
 * Resolves once the PRINT WINDOW's own document is ready to be printed:
 * parsed, laid out, and with every <img> settled (loaded OR failed).
 *
 * `img.complete` is true once an image has finished loading, errored, or has
 * no src at all — which is exactly the "nothing more is coming" signal we
 * need, and it means a broken logo can never wedge the print forever.
 *
 * Deliberately polls the child document instead of injecting an inline
 * <script> that calls window.print(): an inline script would be blocked by
 * the app's Content-Security-Policy, and a CSP violation here would look to
 * the user like "print silently does nothing".
 *
 * @param {Window} win
 * @param {number} timeoutMs  Hard ceiling so a hung CDN can't block printing
 * @returns {Promise<boolean>} true if fully ready, false if it timed out
 */
function waitForPrintWindowReady(win, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!win) { resolve(false); return }
    const startedAt = Date.now()

    const check = () => {
      // User closed the window while we were waiting.
      if (win.closed) { resolve(false); return }

      let ready = false
      try {
        const doc = win.document
        const images = Array.from(doc.images || [])
        const parsed = doc.readyState === 'complete'
        const settled = images.every((img) => img.complete)
        ready = parsed && settled
      } catch {
        // Unreachable (e.g. the window navigated cross-origin). We can no
        // longer inspect it, so stop waiting rather than loop forever.
        resolve(false)
        return
      }

      if (ready || Date.now() - startedAt > timeoutMs) { resolve(ready); return }
      setTimeout(check, 50)
    }

    check()
  })
}

/**
 * Assembles a complete printable HTML document from parts.
 *
 * @param {object} o
 * @param {string} o.title    <title> + header title
 * @param {string} o.body     Document body HTML
 * @param {object} o.company
 * @param {'A4'|'Letter'} o.paper
 * @param {'portrait'|'landscape'} o.orientation
 * @param {number} o.margin
 * @param {string} o.density
 * @returns {string} Full HTML document
 */
export const buildDocument = ({
  title,
  body,
  company,
  spec,
  paper,
  orientation,
  margin,
  density,
  footerSpace,
} = {}) => {
  const page = resolvePageSpec(
    // An explicit spec name wins; otherwise build from whatever overrides
    // the caller supplied so existing call sites keep working.
    spec
      ? resolvePageSpec(spec)
      : {
          ...(paper !== undefined && { paper }),
          ...(orientation !== undefined && { orientation }),
          ...(margin !== undefined && { margin }),
          ...(density !== undefined && { density }),
          ...(footerSpace !== undefined && { footerSpace }),
        }
  )

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — ${escapeHtml(company?.name || 'FMS')}</title>
  <style>${printStyles(page)}</style>
</head>
<body>
  <div class="pf-root">
    ${body}
  </div>
</body>
</html>`
}

/**
 * Opens a print window, writes the document, waits until that window has
 * actually finished loading its images, then prints.
 *
 * Waiting on the opener's copy of the logo (the old behaviour) was not
 * enough: Chrome snapshots the print window's DOM the moment print() is
 * called, so a still-decoding remote logo printed as an empty box. We now
 * wait on the print window's own <img> elements, with the opener-side
 * preload kept purely as a cache warm-up.
 *
 * @returns {boolean} false if the popup was blocked (so callers can surface
 *                    that instead of silently doing nothing).
 */
export const printDocument = ({ html, logoUrl = null, onBeforePrint = null } = {}) => {
  const win = window.open('', '_blank', 'width=950,height=1100')
  if (!win) return false

  win.document.write(html)
  win.document.close()
  win.focus()

  // Fire-and-forget: the popup-blocked check above must stay synchronous so
  // callers can report a blocked popup.
  ;(async () => {
    // Step 1: warm the cache so step 2 is usually instant.
    if (logoUrl) await preloadImage(logoUrl)

    // Step 2: the authoritative wait — the print window's own images.
    const ready = await waitForPrintWindowReady(win)

    if (import.meta.env?.DEV && !ready) {
      console.warn('[print] document images did not settle before the print timeout — printing anyway')
    }

    // Step 3: let the final layout pass (fonts, flex rows) settle.
    setTimeout(() => {
      if (win.closed) return
      if (onBeforePrint) onBeforePrint(win)
      win.print()
    }, 50)
  })()

  return true
}

/** Convenience: build + print in one call. */
export const printHtml = ({ title, body, company, spec, paper, orientation, margin, density, footerSpace, onBeforePrint } = {}) =>
  printDocument({
    html: buildDocument({ title, body, company, spec, paper, orientation, margin, density, footerSpace }),
    logoUrl: company?.logoUrl || null,
    onBeforePrint,
  })

/* ------------------------------------------------------------------ *
 * CSV export
 * ------------------------------------------------------------------ */

const csvCell = (value) => {
  if (value === null || value === undefined) return ''
  const s = String(value)
  // Prefix formula characters so a customer named "=cmd|..." can't be
  // executed by Excel/CSheets when the file is opened.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/**
 * Downloads a CSV with a UTF-8 BOM and an optional provenance header.
 *
 * Two things every export here was missing: the BOM (without it Excel
 * mangles the ₱ glyph and any non-ASCII customer name) and provenance
 * (a compliance CSV with no company/period/generated-by header is not
 * defensible as a record).
 *
 * @param {object} o
 * @param {string} o.filename
 * @param {Array<Array>} o.rows      Data rows
 * @param {string[]} o.provenance    Leading label/value pairs
 */
export const downloadCsv = ({ filename, rows = [], provenance = [] }) => {
  const lines = []

  if (provenance.length) {
    lines.push(csvCell(provenance[0][0] || 'Report'))
    provenance.forEach(([k, v]) => {
      if (!k) return
      lines.push(`${csvCell(k)},${csvCell(v)}`)
    })
    lines.push('')
  }

  rows.forEach((row) => lines.push(row.map(csvCell).join(',')))

  // BOM so Excel detects UTF-8 and renders ₱ / accented names correctly.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
