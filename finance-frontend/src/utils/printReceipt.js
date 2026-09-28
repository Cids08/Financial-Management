import { printDocument, escapeHtml, money, printTimestamp } from './print'

/**
 * Converts a numeric currency amount into Philippine Peso words.
 * Example: 15450.50 -> "Fifteen Thousand Four Hundred Fifty Pesos and 50/100 Only"
 */
export function numberToWordsPesos(amount) {
  const num = Math.round(Number(amount) * 100) / 100
  if (isNaN(num) || num <= 0) return 'Zero Pesos Only'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convertGroup(n) {
    let str = ''
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred '
      n %= 100
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    } else if (n > 0) {
      str += ones[n]
    }
    return str.trim()
  }

  const integerPart = Math.floor(num)
  const cents = Math.round((num - integerPart) * 100)

  let words = ''
  const billions  = Math.floor(integerPart / 1_000_000_000)
  const millions  = Math.floor((integerPart % 1_000_000_000) / 1_000_000)
  const thousands = Math.floor((integerPart % 1_000_000) / 1_000)
  const remainder = integerPart % 1_000

  if (billions)  words += convertGroup(billions) + ' Billion '
  if (millions)  words += convertGroup(millions) + ' Million '
  if (thousands) words += convertGroup(thousands) + ' Thousand '
  if (remainder) words += convertGroup(remainder)

  words = words.trim() || 'Zero'
  const centsStr = cents > 0 ? ` and ${cents}/100` : ''
  return `${words} Pesos${centsStr} Only`
}

/**
 * Builds a single receipt half (either Customer Copy or Collector/File Copy)
 */
function renderSlipHalf({
  copyLabel,
  copyClass,
  company,
  collection,
  customer,
  collector,
  invoiceNo,
  accountName,
  dateFormatted,
  amountInWords,
}) {
  const isCustomer = copyLabel.includes('CUSTOMER')

  return `
    <div class="pf-slip-half">
      <!-- Slip Header -->
      <div class="pf-slip-head">
        <div class="pf-slip-company">
          ${company?.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" class="pf-slip-logo" alt="" />` : ''}
          <div>
            <div class="pf-slip-biz-name">${escapeHtml(company?.name || 'Financial Management System')}</div>
            <div class="pf-slip-biz-info">
              ${company?.address ? `${escapeHtml(company.address)}<br/>` : ''}
              ${company?.tin ? `TIN: ${escapeHtml(company.tin)} &middot; ` : ''}VAT Registered
            </div>
          </div>
        </div>
        <div class="pf-slip-title-box">
          <div class="pf-slip-doc-title">COLLECTION RECEIPT</div>
          <div class="pf-slip-badge ${copyClass}">${escapeHtml(copyLabel)}</div>
          <div class="pf-slip-or-no">CR / OR No.: <strong>${escapeHtml(collection.receipt_number || '—')}</strong></div>
          <div class="pf-slip-date">Date: ${escapeHtml(dateFormatted)}</div>
        </div>
      </div>

      <!-- Receipt Data Table -->
      <table class="pf-slip-table">
        <tbody>
          <tr>
            <td class="pf-label" style="width: 20%;">Received From:</td>
            <td class="pf-val" style="width: 45%;"><strong>${escapeHtml(customer)}</strong></td>
            <td class="pf-label" style="width: 15%;">Payment Method:</td>
            <td class="pf-val" style="width: 20%;">${escapeHtml(collection.payment_method || 'Cash')}</td>
          </tr>
          <tr>
            <td class="pf-label">In Payment Of:</td>
            <td class="pf-val">Invoice #${escapeHtml(invoiceNo)}</td>
            <td class="pf-label">Deposited To:</td>
            <td class="pf-val">${escapeHtml(accountName)}</td>
          </tr>
          <tr>
            <td class="pf-label">Ref. Number:</td>
            <td class="pf-val">${escapeHtml(collection.reference_number || '—')}</td>
            <td class="pf-label">Remarks:</td>
            <td class="pf-val">${escapeHtml(collection.remarks || '—')}</td>
          </tr>
          <tr>
            <td class="pf-label">Amount in Words:</td>
            <td class="pf-val" colspan="3"><em>${escapeHtml(amountInWords)}</em></td>
          </tr>
          <tr class="pf-row-amount">
            <td class="pf-label">Amount Received:</td>
            <td class="pf-val-amount" colspan="3">${money(collection.amount_received)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Signatures -->
      <div class="pf-slip-sigs">
        <div class="pf-sig-col">
          <div class="pf-sig-line"></div>
          <div class="pf-sig-person">${escapeHtml(collector || 'Authorized Collector')}</div>
          <div class="pf-sig-role">Received By (Collector)</div>
        </div>
        <div class="pf-sig-col">
          <div class="pf-sig-line"></div>
          <div class="pf-sig-person">${escapeHtml(customer || 'Customer / Payee')}</div>
          <div class="pf-sig-role">Acknowledged / Paid By (Customer)</div>
        </div>
      </div>

      <!-- Compliance Notice -->
      <div class="pf-slip-foot">
        ${isCustomer
          ? 'OFFICIAL RECEIPT / CUSTOMER COPY &middot; This receipt is your official proof of payment. Please keep for your records.'
          : 'COLLECTOR / AUDIT COPY &middot; Retained by collector for cashier remittance, accounting ledger entry, and BIR compliance.'}
      </div>
    </div>
  `
}

/**
 * Prints a 2-Up duplicate collection receipt on a single A4/Letter sheet:
 * Top: Customer's Copy
 * Bottom: Collector / File Copy
 * Separated by a clean cut line.
 */
export function printDuplicateReceipt({
  company,
  profile,
  collection,
  customerName = '—',
  collectorName = '—',
  invoiceNumber = '—',
  accountName = '—',
}) {
  const dateFormatted = collection.collection_date
    ? new Date(collection.collection_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

  const amountInWords = numberToWordsPesos(collection.amount_received)

  const customerSlip = renderSlipHalf({
    copyLabel: 'ORIGINAL — CUSTOMER\'S COPY',
    copyClass: 'badge-customer',
    company,
    collection,
    customer: customerName,
    collector: collection.collector_name || collectorName || profile?.name,
    invoiceNo: collection.invoice_number || invoiceNumber,
    accountName: collection.cash_account_name || accountName,
    dateFormatted,
    amountInWords,
  })

  const collectorSlip = renderSlipHalf({
    copyLabel: 'DUPLICATE — COLLECTOR / FILE COPY',
    copyClass: 'badge-collector',
    company,
    collection,
    customer: customerName,
    collector: collection.collector_name || collectorName || profile?.name,
    invoiceNo: collection.invoice_number || invoiceNumber,
    accountName: collection.cash_account_name || accountName,
    dateFormatted,
    amountInWords,
  })

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${escapeHtml(collection.receipt_number)} — ${escapeHtml(company?.name || 'FMS')}</title>
  <style>
    @page {
      size: portrait;
      margin: 8mm 10mm;
    }
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 8.5pt;
      line-height: 1.35;
      color: #0f172a;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .pf-page-wrap {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 270mm;
      justify-content: space-between;
    }

    .pf-slip-half {
      border: 1.5px solid #0f2744;
      border-radius: 4px;
      padding: 4mm 5mm 3mm;
      background: #fff;
    }

    /* Head */
    .pf-slip-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1.5px solid #0f2744;
      padding-bottom: 2.5mm;
      margin-bottom: 2.5mm;
      gap: 4mm;
    }
    .pf-slip-company {
      display: flex;
      align-items: center;
      gap: 3mm;
      max-width: 60%;
    }
    .pf-slip-logo {
      max-height: 12mm;
      max-width: 30mm;
      object-fit: contain;
    }
    .pf-slip-biz-name {
      font-size: 11pt;
      font-weight: 700;
      color: #0f2744;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .pf-slip-biz-info {
      font-size: 7.5pt;
      color: #475569;
      line-height: 1.25;
      margin-top: 0.5mm;
    }
    .pf-slip-title-box {
      text-align: right;
    }
    .pf-slip-doc-title {
      font-size: 12pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #0f2744;
    }
    .pf-slip-badge {
      display: inline-block;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 1px 6px;
      border-radius: 3px;
      margin-top: 1mm;
      text-transform: uppercase;
    }
    .badge-customer {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #10b981;
    }
    .badge-collector {
      background: #f8fafc;
      color: #334155;
      border: 1px solid #64748b;
    }
    .pf-slip-or-no {
      font-size: 8pt;
      color: #1e293b;
      margin-top: 1mm;
    }
    .pf-slip-date {
      font-size: 7.5pt;
      color: #64748b;
    }

    /* Table */
    .pf-slip-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 2.5mm;
      font-size: 8pt;
    }
    .pf-slip-table td {
      padding: 3px 6px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
    }
    .pf-label {
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      white-space: nowrap;
    }
    .pf-val {
      color: #0f172a;
    }
    .pf-row-amount td {
      background: #f1f5f9;
      border-top: 1.5px solid #0f2744;
      border-bottom: 2px solid #0f2744;
    }
    .pf-val-amount {
      font-size: 11pt;
      font-weight: 800;
      color: #0f2744;
      text-align: right;
    }
    /* Signatures */
    .pf-slip-sigs {
      display: flex;
      justify-content: space-between;
      gap: 10mm;
      margin-top: 3mm;
      padding: 0 4mm;
    }
    .pf-sig-col {
      flex: 1;
      text-align: center;
    }
    .pf-sig-line {
      border-bottom: 1px solid #334155;
      margin-bottom: 1.5mm;
      height: 8mm;
    }
    .pf-sig-person {
      font-size: 7.5pt;
      font-weight: 700;
      color: #0f172a;
    }
    .pf-sig-role {
      font-size: 6.8pt;
      color: #64748b;
    }

    /* Footnote */
    .pf-slip-foot {
      font-size: 6.8pt;
      color: #64748b;
      text-align: center;
      margin-top: 2.5mm;
      padding-top: 1.5mm;
      border-top: 0.5px dotted #cbd5e1;
    }

    /* Cut Line */
    .pf-cut-divider {
      text-align: center;
      margin: 3.5mm 0;
      position: relative;
    }
    .pf-cut-dashed {
      border-top: 1.5px dashed #94a3b8;
      position: relative;
      margin-top: 8px;
    }
    .pf-cut-text {
      position: relative;
      top: -9px;
      background: #fff;
      padding: 0 10px;
      font-size: 7pt;
      color: #64748b;
      font-weight: 600;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="pf-page-wrap">
    ${customerSlip}
    <div class="pf-cut-divider">
      <div class="pf-cut-dashed">
        <span class="pf-cut-text">&#9986; &middot; &middot; &middot; CUT OR TEAR ALONG THIS LINE &middot; &middot; &middot; &#9986;</span>
      </div>
    </div>
    ${collectorSlip}
  </div>
</body>
</html>`

  return printDocument({
    html,
    logoUrl: company?.logoUrl || null,
  })
}
