import { useEffect, useState, useMemo } from 'react'
import {
  Printer,
  X,
  FileText,
  CreditCard,
  Building2,
  Receipt,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { apiFetch } from '../utils/api'
import { currencySymbol } from '../utils/formatters'
import {
  escapeHtml,
  money,
  buildHeader,
  buildFooter,
  buildSignatureBlock,
  buildDocument,
  printDocument,
  printTimestamp,
} from '../utils/print'
import { useCompany } from '../context/CompanyContext'
import { useProfile } from '../hooks/useProfile'

// ---------------------------------------------------------------------------
// Helpers: Number to Words (Currency)
// ---------------------------------------------------------------------------
function numberToWords(num) {
  const n = Math.floor(Math.abs(num))
  if (n === 0) return 'ZERO'

  const ones = [
    '', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
    'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
    'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
  ]
  const tens = [
    '', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY',
  ]

  function convertHundreds(val) {
    let str = ''
    if (val >= 100) {
      str += ones[Math.floor(val / 100)] + ' HUNDRED '
      val %= 100
    }
    if (val >= 20) {
      str += tens[Math.floor(val / 10)] + ' '
      val %= 10
    }
    if (val > 0) {
      str += ones[val] + ' '
    }
    return str.trim()
  }

  const scales = ['', 'THOUSAND', 'MILLION', 'BILLION']
  let current = n
  let scaleIndex = 0
  let words = ''

  while (current > 0) {
    const chunk = current % 1000
    if (chunk > 0) {
      const chunkWords = convertHundreds(chunk)
      const scale = scales[scaleIndex] ? ' ' + scales[scaleIndex] : ''
      words = chunkWords + scale + (words ? ' ' + words : '')
    }
    current = Math.floor(current / 1000)
    scaleIndex++
  }

  return words.trim()
}

function formatAmountInWords(amount) {
  const val = Number(amount) || 0
  const whole = Math.floor(val)
  const cents = Math.round((val - whole) * 100)
  const wholeWords = numberToWords(whole)
  const centsStr = String(cents).padStart(2, '0') + '/100'

  return `${wholeWords} PESOS AND ${centsStr} ONLY`
}

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function DisbursementPrintModal({
  open,
  onClose,
  disbursementId,
}) {
  const company = useCompany()
  const { profile } = useProfile()
  const [activeTab, setActiveTab] = useState('voucher') // 'voucher' | 'bir2307'
  const [voucherSubView, setVoucherSubView] = useState('voucher') // 'voucher' | 'check'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [voucherData, setVoucherData] = useState(null)
  const [birData, setBirData] = useState(null)

  // Interactive BIR 2307 state
  const [selectedAtc, setSelectedAtc] = useState('WC157')
  const [overrideRate, setOverrideRate] = useState(2.0)
  const [payeeTin, setPayeeTin] = useState('')
  const [payeeAddress, setPayeeAddress] = useState('')

  useEffect(() => {
    if (!open || !disbursementId) return

    setLoading(true)
    setError(null)

    Promise.all([
      apiFetch(`/api/disbursements/${disbursementId}/printable-voucher`).then((r) => r.json()),
      apiFetch(`/api/disbursements/${disbursementId}/bir-2307`).then((r) => r.json()),
    ])
      .then(([vRes, bRes]) => {
        if (vRes.success) setVoucherData(vRes.data)
        if (bRes.success) {
          setBirData(bRes.data)
          setSelectedAtc(bRes.data.default_atc || 'WC157')
          const matchedAtc = (bRes.data.atc_codes || []).find(
            (a) => a.code === (bRes.data.default_atc || 'WC157')
          )
          setOverrideRate(matchedAtc ? matchedAtc.rate : 2.0)
          setPayeeTin(bRes.data.payee?.tin || '')
          setPayeeAddress(bRes.data.payee?.address || 'Philippines')
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load printable disbursement records.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, disbursementId])

  const handleAtcChange = (code) => {
    setSelectedAtc(code)
    const matched = (birData?.atc_codes || []).find((a) => a.code === code)
    if (matched) {
      setOverrideRate(matched.rate)
    }
  }

  // Computed BIR values
  const grossIncome = voucherData?.voucher?.amount_paid || birData?.computation?.gross_amount || 0
  const taxWithheld = Number(((grossIncome * overrideRate) / 100).toFixed(2))
  const netAmount = Number((grossIncome - taxWithheld).toFixed(2))

  // -------------------------------------------------------------------------
  // Print Handlers
  // -------------------------------------------------------------------------
  const printVoucher = () => {
    const v = voucherData?.voucher || {}
    const s = voucherData?.supplier || {}
    const bill = voucherData?.bill || {}
    const cash = voucherData?.cash_account || {}
    const sig = voucherData?.signatories || {}
    const entries = voucherData?.accounting_entries || []
    const isCheck = v.payment_method === 'Check' || v.payment_method === "Manager's Check"

    const title = isCheck ? 'Check Disbursement Voucher' : 'Disbursement Voucher'
    const status = v.status || 'Released'

    // Header meta
    const headerMeta = [
      ['Voucher Number', v.voucher_number || '-'],
      ['Payment Date', v.payment_date || '-'],
      ['Payment Method', v.payment_method || '-'],
      ['Reference No.', v.reference_number || '-'],
      ['Status', status],
    ]

    const headerHtml = buildHeader({
      company,
      title,
      subtitle: `Voucher #${v.voucher_number || '-'} · Disbursed To: ${v.payee || '-'}`,
      status,
      meta: headerMeta,
      preparedBy: sig.prepared_by || profile?.name || 'Accounting Staff',
      preparedRole: sig.prepared_by_position || 'Accounting Staff',
    })

    // Check visualization if Check
    const checkCardHtml = isCheck ? `
      <div style="border: 2px dashed #0f2744; border-radius: 6px; padding: 12px 16px; margin: 4mm 0 6mm; background: #f8fafc;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1.5px solid #0f2744; padding-bottom: 6px; margin-bottom: 10px;">
          <div>
            <div style="font-weight: 800; font-size: 11pt; color: #0f2744;">${escapeHtml(cash.bank_name || 'BANK CHECK')}</div>
            <div style="font-size: 8pt; color: #64748b;">Acct: ${escapeHtml(cash.account_number || '-')} &middot; ${escapeHtml(cash.account_name || '')}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 7.5pt; color: #64748b; font-weight: 700; text-transform: uppercase;">CHECK DATE</div>
            <div style="font-weight: 700; font-size: 10pt;">${escapeHtml(v.payment_date || '-')}</div>
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <tr>
            <td style="width: 110px; font-weight: 700; font-size: 8.5pt; color: #475569;">PAY TO THE ORDER OF:</td>
            <td style="border-bottom: 1.5px solid #0f2744; font-weight: 800; font-size: 11pt; color: #0f2744; padding-left: 8px;">
              ${escapeHtml(v.payee || '-')}
            </td>
            <td style="width: 140px; text-align: right; font-family: monospace; font-size: 11pt; font-weight: 800; border: 1.5px solid #0f2744; padding: 4px 8px; background: #fff; color: #0f2744;">
              ${money(v.amount_paid)}
            </td>
          </tr>
        </table>
        <div style="margin-top: 6px;">
          <span style="font-size: 7.5pt; color: #64748b; font-weight: 700; text-transform: uppercase;">AMOUNT IN WORDS:</span>
          <div style="font-weight: 700; text-transform: uppercase; font-size: 8.5pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; color: #1e293b;">
            ${escapeHtml(formatAmountInWords(v.amount_paid))}
          </div>
        </div>
      </div>
    ` : ''

    // Details table using .pf-kv
    const detailsHtml = `
      <table class="pf-kv">
        <tr class="pf-section"><td colspan="2">Disbursement &amp; Recipient Details</td></tr>
        <tr>
          <td class="pf-k">Disbursed To</td>
          <td class="pf-v" style="color: #0f2744; font-size: 10pt;">${escapeHtml(v.payee || '-')}</td>
        </tr>
        <tr>
          <td class="pf-k">Payment Method</td>
          <td class="pf-v">${escapeHtml(v.payment_method || '-')}</td>
        </tr>
        <tr>
          <td class="pf-k">Cash Account</td>
          <td class="pf-v">${escapeHtml(cash.account_name || '-')} ${cash.bank_name ? `(${escapeHtml(cash.bank_name)})` : ''}</td>
        </tr>
        <tr>
          <td class="pf-k">Supplier TIN / Address</td>
          <td class="pf-v">${escapeHtml(s.tin || '—')} &nbsp;·&nbsp; ${escapeHtml(s.address || '—')}</td>
        </tr>
        <tr>
          <td class="pf-k">Reference / Check No.</td>
          <td class="pf-v font-mono">${escapeHtml(v.reference_number || '—')}</td>
        </tr>
        <tr>
          <td class="pf-k">Related AP Bill</td>
          <td class="pf-v">${bill.invoice_number ? `${escapeHtml(bill.invoice_number)} (Due: ${escapeHtml(bill.due_date || '-')})` : 'Direct / Payroll Settlement'}</td>
        </tr>
        <tr>
          <td class="pf-k">Remarks / Particulars</td>
          <td class="pf-v pf-span">${escapeHtml(v.remarks || bill.description || 'Settlement of approved disbursement voucher')}</td>
        </tr>
        <tr class="pf-total">
          <td class="pf-k">Total Disbursed Amount</td>
          <td class="pf-v">${money(v.amount_paid)}</td>
        </tr>
      </table>
    `

    // General Ledger table using .pf-grid
    const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0)
    const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0)
    const ledgerHtml = `
      <div style="margin-top: 5mm;">
        <div style="font-size: 8.5pt; font-weight: 700; color: #0f2744; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2mm;">
          Double-Entry Accounting Distribution (General Ledger)
        </div>
        <table class="pf-grid">
          <thead>
            <tr>
              <th style="width: 18%;">Account Code</th>
              <th style="width: 46%;">Account Title</th>
              <th style="width: 18%; text-align: right;">Debit (${currencySymbol()})</th>
              <th style="width: 18%; text-align: right;">Credit (${currencySymbol()})</th>
            </tr>
          </thead>
          <tbody>
            ${entries.length > 0 ? entries.map((e) => `
              <tr>
                <td style="font-family: monospace; font-weight: 600;">${escapeHtml(e.account_code)}</td>
                <td>${escapeHtml(e.account_name)} ${e.remarks ? `<span style="font-size: 7.5pt; color: #64748b;">(${escapeHtml(e.remarks)})</span>` : ''}</td>
                <td class="pf-num">${e.debit > 0 ? money(e.debit) : '—'}</td>
                <td class="pf-num">${e.credit > 0 ? money(e.credit) : '—'}</td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="4" class="pf-empty">No accounting entries recorded.</td>
              </tr>
            `}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="text-align: right; text-transform: uppercase;">Total Balanced Distribution</td>
              <td class="pf-num">${money(totalDebit)}</td>
              <td class="pf-num">${money(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `

    // Signature Block using buildSignatureBlock
    const sigHtml = buildSignatureBlock({
      title: 'Disbursement Signatories & Acknowledgement',
      blocks: [
        {
          label: 'Prepared By',
          name: sig.prepared_by || profile?.name || 'Accounting Staff',
          role: sig.prepared_by_position || 'Accounting Staff',
          date: `Date: ${sig.prepared_at || v.payment_date || printTimestamp().split(',')[0]}`,
        },
        {
          label: 'Checked / Verified By',
          name: sig.verified_by_position || 'Finance Manager',
          role: 'Internal Audit & Clearance',
          date: 'Date: ____________________',
        },
        {
          label: 'Approved By',
          name: sig.approved_by || 'Finance Officer',
          role: sig.approved_by_position || 'Finance Officer',
          date: `Date: ${sig.approved_at || printTimestamp().split(',')[0]}`,
        },
        {
          label: 'Disbursed To',
          name: v.payee || 'Authorized Payee / Beneficiary',
          role: 'Signature Over Printed Name',
          line: 'OR# / Date: ____________________',
        },
      ],
      disclaimer: 'This document certifies the official release of enterprise funds and subsequent posting to the General Ledger. The beneficiary signature confirms receipt of the net disbursement amount.'
    })

    const footerHtml = buildFooter({
      company,
      note: 'OFFICIAL DISBURSEMENT VOUCHER',
      detail: `Voucher #${v.voucher_number || '-'} · ${v.payment_method || 'Disbursement'}`
    })

    const bodyHtml = `
      ${headerHtml}
      ${checkCardHtml}
      ${detailsHtml}
      ${ledgerHtml}
      ${sigHtml}
      ${footerHtml}
    `

    const docHtml = buildDocument({
      title,
      body: bodyHtml,
      company,
      spec: 'voucher',
    })

    printDocument({ html: docHtml, logoUrl: company?.logoUrl })
  }

  const printBir2307 = () => {
    const win = window.open('', '_blank', 'width=950,height=1050')
    if (!win) return

    const period = birData?.period || {}
    const payor = birData?.payor || {}
    const payeeName = voucherData?.voucher?.payee || birData?.payee?.registered_name || '-'
    const matchedAtc = (birData?.atc_codes || []).find((a) => a.code === selectedAtc)

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>BIR Form 2307 - ${escapeHtml(payeeName)}</title>
          <style>
            /* 'statutory' PAGE_SPEC: filed on government paper  -  tight on purpose. */
            @page { size: A4 portrait; margin: 10mm 10mm 12mm 10mm; }
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #000; margin: 0; padding: 8px; font-size: 11px; line-height: 1.3; }
            .bir-header { border: 2px solid #000; padding: 6px; margin-bottom: 8px; text-align: center; background: #fafafa; }
            .bir-title { font-size: 13px; font-weight: 900; text-transform: uppercase; }
            .bir-subtitle { font-size: 10px; font-weight: 700; color: #374151; }
            .part-header { background: #000; color: #fff; font-weight: 800; padding: 3px 6px; text-transform: uppercase; font-size: 10px; margin-top: 6px; }
            .box-table { width: 100%; border-collapse: collapse; }
            .box-table td { border: 1px solid #000; padding: 4px 6px; font-size: 10.5px; }
            .field-lbl { font-size: 9px; text-transform: uppercase; color: #4b5563; font-weight: 700; }
            .field-val { font-weight: 700; color: #000; }
            /* BIR 2307 is a single statutory sheet: keep every box whole. */
            tr, .bir-header, .part-header, .box-table, .certification, .signatures {
              break-inside: avoid; page-break-inside: avoid;
            }
            @media print {
              * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none; }
            }
            .tax-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            .tax-table th { border: 1px solid #000; background: #e5e7eb; font-size: 9.5px; font-weight: 800; padding: 4px; text-align: center; text-transform: uppercase; }
            .tax-table td { border: 1px solid #000; padding: 4px 6px; font-size: 10px; }
            .tax-table td.num { text-align: right; font-family: monospace; font-weight: 700; }
            .declaration-box { border: 1px solid #000; padding: 8px; font-size: 9.5px; margin-top: 8px; text-align: justify; line-height: 1.3; }
            .sig-row { display: flex; justify-content: space-between; margin-top: 16px; }
            .sig-col { width: 45%; border-top: 1px solid #000; text-align: center; padding-top: 4px; font-size: 10px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="bir-header">
            <div style="font-size: 9px; font-weight: 700; text-transform: uppercase;">Republic of the Philippines &middot; Department of Finance</div>
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase;">Bureau of Internal Revenue</div>
            <div class="bir-title">Certificate of Creditable Tax Withheld at Source</div>
            <div class="bir-subtitle">BIR Form No. 2307 &middot; Republic Act No. 8424 / Tax Reform Act of 1997</div>
            <div style="font-size: 9.5px; font-weight: 700; margin-top: 4px;">
              For the Period: From <u>${escapeHtml(period.from || '-')}</u> To <u>${escapeHtml(period.to || '-')}</u> &middot; Applicable Quarter: <u>${escapeHtml(period.quarter || '-')} ${escapeHtml(period.year || '')}</u>
            </div>
          </div>

          <div class="part-header">Part I  -  Payee Information (Recipient of Income / Supplier)</div>
          <table class="box-table">
            <tr>
              <td style="width: 35%;">
                <div class="field-lbl">1. Taxpayer Identification No. (TIN)</div>
                <div class="field-val" style="font-family: monospace; letter-spacing: 1px;">${escapeHtml(payeeTin || '________________________')}</div>
              </td>
              <td style="width: 65%;">
                <div class="field-lbl">2. Payee's Registered Name (Last Name, First Name for Individuals / Corporate Name)</div>
                <div class="field-val">${escapeHtml(payeeName)}</div>
              </td>
            </tr>
            <tr>
              <td colspan="2">
                <div class="field-lbl">3. Registered Address</div>
                <div class="field-val">${escapeHtml(payeeAddress)}</div>
              </td>
            </tr>
          </table>

          <div class="part-header">Part II  -  Payor Information (Withholding Agent)</div>
          <table class="box-table">
            <tr>
              <td style="width: 35%;">
                <div class="field-lbl">4. Taxpayer Identification No. (TIN)</div>
                <div class="field-val" style="font-family: monospace; letter-spacing: 1px;">${escapeHtml(payor.tin || '________________________')}</div>
              </td>
              <td style="width: 65%;">
                <div class="field-lbl">5. Payor's Registered Name</div>
                <div class="field-val">${escapeHtml(company?.name || payor.registered_name || 'FINANCIAL MANAGEMENT SYSTEM INC.')}</div>
              </td>
            </tr>
            <tr>
              <td colspan="2">
                <div class="field-lbl">6. Registered Address</div>
                <div class="field-val">${escapeHtml(company?.address || payor.address || '100 Ayala Avenue, Makati City, Metro Manila')} &middot; ZIP: ${escapeHtml(payor.zip_code || '1226')}</div>
              </td>
            </tr>
          </table>

          <div class="part-header">Part III  -  Details of Monthly/Quarterly Income Payments & Taxes Withheld</div>
          <table class="tax-table">
            <thead>
              <tr>
                <th rowspan="2" style="width: 35%;">Nature of Income Payment</th>
                <th rowspan="2" style="width: 10%;">ATC</th>
                <th colspan="3" style="width: 25%;">Amount of Income Payments</th>
                <th rowspan="2" style="width: 15%;">Total Income ({currencySymbol()})</th>
                <th rowspan="2" style="width: 8%;">Tax Rate</th>
                <th rowspan="2" style="width: 15%;">Tax Withheld ({currencySymbol()})</th>
              </tr>
              <tr>
                <th style="font-size: 8px;">1st Month</th>
                <th style="font-size: 8px;">2nd Month</th>
                <th style="font-size: 8px;">3rd Month</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>${escapeHtml(matchedAtc?.nature || 'Professional / Supplier Payments')}</strong><br><span style="font-size: 8.5px; color: #4b5563;">${escapeHtml(matchedAtc?.description || '')}</span></td>
                <td style="text-align: center; font-family: monospace; font-weight: 800;">${escapeHtml(selectedAtc)}</td>
                <td class="num">${period.month_index_in_quarter === 1 ? fmt(grossIncome) : '-'}</td>
                <td class="num">${period.month_index_in_quarter === 2 ? fmt(grossIncome) : '-'}</td>
                <td class="num">${period.month_index_in_quarter === 3 ? fmt(grossIncome) : '-'}</td>
                <td class="num" style="font-size: 11px;">${fmt(grossIncome)}</td>
                <td style="text-align: center; font-weight: 700;">${escapeHtml(overrideRate)}%</td>
                <td class="num" style="font-size: 11px; color: #991b1b;">${fmt(taxWithheld)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="background: #f9fafb; font-weight: 800;">
                <td colspan="5" style="text-align: right; text-transform: uppercase;">Total Taxes Withheld for the Period</td>
                <td class="num">${fmt(grossIncome)}</td>
                <td style="text-align: center;">-</td>
                <td class="num" style="color: #991b1b; border-bottom: 3px double #000;">${fmt(taxWithheld)}</td>
              </tr>
            </tfoot>
          </table>

          <div class="declaration-box">
            <strong>Declaration & Oath:</strong> We declare under the penalties of perjury that this certificate has been made in good faith, verified by us, and to the best of our knowledge and belief, is true and correct pursuant to the provisions of the National Internal Revenue Code, as amended, and the regulations issued under authority thereof.
          </div>

          <div class="sig-row">
            <div class="sig-col">
              <div>Authorized Representative / Withholding Agent</div>
              <div style="font-weight: 800; margin-top: 18px;">${escapeHtml(company?.name || 'FINANCIAL MANAGEMENT SYSTEM INC.')}</div>
              <div style="font-size: 9px; color: #4b5563;">Date Signed: ${new Date().toISOString().slice(0, 10)}</div>
            </div>
            <div class="sig-col">
              <div>Payee / Supplier Conforme Signature</div>
              <div style="font-weight: 800; margin-top: 18px;">${escapeHtml(payeeName)}</div>
              <div style="font-size: 9px; color: #4b5563;">Date Received: ______________</div>
            </div>
          </div>
        </body>
      </html>
    `)

    win.document.close()
    win.focus()
    win.print()
  }

  if (!open) return null

  const v = voucherData?.voucher || {}
  const cash = voucherData?.cash_account || {}
  const isCheck = v.payment_method === 'Check' || v.payment_method === "Manager's Check"
  const hasEwt = v.ewt_amount != null && v.ewt_amount > 0
  const netPaid = hasEwt && v.net_amount != null ? v.net_amount : v.amount_paid

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-border">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-bg/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Printer className="w-5 h-5 text-primary-dark dark:text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">
                Disbursement Documents &amp; Tax Certification
              </h2>
              <p className="text-xs text-muted">
                Voucher {v.voucher_number || '-'} &middot; Disbursed To: {v.payee || '-'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg text-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-bg/40 px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('voucher')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'voucher'
                ? 'border-primary text-primary-dark dark:text-primary bg-surface rounded-t-lg'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <FileText className="w-4 h-4" />
            Check &amp; Disbursement Voucher
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bir2307')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'bir2307'
                ? 'border-primary text-primary-dark dark:text-primary bg-surface rounded-t-lg'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Receipt className="w-4 h-4" />
            BIR Form 2307 (Withholding Tax Certificate)
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-bg/20">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
              <p className="text-sm font-medium">Loading document and accounting entries…</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-status-danger-bg border border-status-danger-border rounded-xl text-status-danger text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          ) : activeTab === 'voucher' ? (
            /* ============================================================= */
            /* TAB 1: Check & Disbursement Voucher Preview                   */
            /* ============================================================= */
            <div className="space-y-5">
              {/* Sub-toggle: Voucher vs Check */}
              {isCheck && (
                <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-xl">
                  <div className="text-xs text-primary-dark dark:text-primary font-medium">
                    This disbursement is paid via <strong>{v.payment_method}</strong>. You can preview both standard voucher and check layout.
                  </div>
                  <div className="flex bg-surface rounded-lg p-1 border border-border text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setVoucherSubView('voucher')}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        voucherSubView === 'voucher' ? 'bg-primary text-black font-semibold' : 'text-muted hover:text-ink'
                      }`}
                    >
                      Voucher View
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoucherSubView('check')}
                      className={`px-3 py-1 rounded-md transition-colors ${
                        voucherSubView === 'check' ? 'bg-primary text-black font-semibold' : 'text-muted hover:text-ink'
                      }`}
                    >
                      Check Layout
                    </button>
                  </div>
                </div>
              )}

              {/* Check Preview Card */}
              {isCheck && voucherSubView === 'check' ? (
                <div className="p-6 bg-surface border-2 border-dashed border-primary/40 rounded-2xl shadow-sm space-y-4">
                  <div className="flex justify-between items-start border-b border-border pb-3">
                    <div>
                      <div className="font-extrabold text-base text-ink tracking-wide">
                        {cash.bank_name || 'COMMERCIAL BANK OF THE PHILIPPINES'}
                      </div>
                      <div className="text-xs text-muted">
                        {cash.account_name} &middot; Acct #{cash.account_number || '0000-0000-00'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted uppercase font-semibold">Date</div>
                      <div className="text-sm font-bold text-ink font-mono">
                        {v.payment_date || '-'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-3">
                    <div className="col-span-3 text-xs font-bold text-muted uppercase">
                      Pay to the Order of
                    </div>
                    <div className="col-span-6 font-extrabold text-base text-primary-dark dark:text-primary border-b border-border pb-1">
                      {v.payee}
                    </div>
                    <div className="col-span-3 text-right font-mono font-bold text-base bg-bg border border-border text-ink rounded px-2 py-1 shadow-inner">
                      {fmt(netPaid)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-semibold text-muted uppercase mb-1">
                      Pesos (in words)
                    </div>
                    <div className="font-bold text-xs uppercase text-ink tracking-wide border-b border-border pb-1">
                      {formatAmountInWords(netPaid)}
                    </div>
                  </div>

                  {hasEwt && (
                    <div className="text-[10px] text-muted">
                      Expanded Withholding Tax of {v.ewt_rate}% ({v.ewt_atc_code ?? 'BIR'}) withheld &middot; Gross {fmt(v.amount_paid)}
                    </div>
                  )}

                  <div className="flex justify-between items-end pt-3 text-xs text-muted">
                    <div className="font-mono text-[10px] tracking-widest text-muted">
                      ⑈ {v.voucher_number?.replace('DV-', '') || '0000'} ⑈ 01002003 ⑈
                    </div>
                    <div className="border-t border-border w-48 text-center pt-1 font-semibold text-muted">
                      Authorized Signature
                    </div>
                  </div>
                </div>
              ) : (
                /* Standard Voucher Information */
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-surface rounded-xl border border-border">
                    <div className="text-xs text-muted font-medium">Voucher Number</div>
                    <div className="text-base font-bold text-primary-dark dark:text-primary font-mono">{v.voucher_number || '-'}</div>
                  </div>
                  <div className="p-3 bg-surface rounded-xl border border-border">
                    <div className="text-xs text-muted font-medium">Payment Date</div>
                    <div className="text-sm font-bold text-ink">{v.payment_date || '-'}</div>
                  </div>
                  <div className="p-3 bg-surface rounded-xl border border-border">
                    <div className="text-xs text-muted font-medium">Payment Method</div>
                    <div className="text-sm font-bold text-ink">{v.payment_method || '-'}</div>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                    <div className="text-xs text-primary-dark dark:text-primary font-medium">Amount Paid</div>
                    <div className="text-base font-bold text-primary-dark dark:text-primary font-mono">{fmt(v.amount_paid)}</div>
                  </div>
</div>
                  {hasEwt && (
                    <div className="mt-2 p-2 bg-bg rounded-lg border border-border text-xs flex flex-wrap gap-x-6 gap-y-1">
                      <span className="text-muted">
                        Expanded Withholding Tax ({v.ewt_rate != null ? `${escapeHtml(v.ewt_rate)}%` : '—'} &middot; {v.ewt_atc_code ?? 'Auto'}) withheld:
                        <span className="font-bold text-ink"> {fmt(v.ewt_amount)}</span>
                      </span>
                      <span className="text-muted">
                        Net Cash Paid Out (actual amount received by recipient):
                        <span className="font-bold text-status-success"> {fmt(netPaid)}</span>
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Accounting Entries */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wide">
                    Double-Entry Accounting Distribution (General Ledger)
                  </h3>
                  <span className="text-xs text-status-success font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Balanced Entry
                  </span>
                </div>
                <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-surface">
                  <table className="w-full text-sm">
                    <thead className="bg-bg/60 border-b border-border">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted text-xs uppercase">Account Code</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted text-xs uppercase">Account Title</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted text-xs uppercase">Debit ({currencySymbol()})</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted text-xs uppercase">Credit ({currencySymbol()})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(voucherData?.accounting_entries || []).map((e, idx) => (
                        <tr key={idx} className="hover:bg-bg/40">
                          <td className="px-4 py-2.5 font-mono text-xs font-bold text-ink">{e.account_code}</td>
                          <td className="px-4 py-2.5 text-ink">
                            {e.account_name}
                            {e.remarks && <span className="text-xs text-muted ml-1">({e.remarks})</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-ink">
                            {e.debit > 0 ? fmt(e.debit) : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-ink">
                            {e.credit > 0 ? fmt(e.credit) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-bg/60 border-t border-border font-bold">
                      <tr>
                        <td colSpan={2} className="px-4 py-2 text-xs text-right uppercase text-muted">Totals</td>
                        <td className="px-4 py-2 text-right font-mono text-primary-dark dark:text-primary">
                          {fmt((voucherData?.accounting_entries || []).reduce((s, e) => s + (e.debit || 0), 0))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-primary-dark dark:text-primary">
                          {fmt((voucherData?.accounting_entries || []).reduce((s, e) => s + (e.credit || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Signatories Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 bg-surface rounded-lg border border-border text-xs">
                  <div className="text-muted font-semibold uppercase text-[10px]">Prepared By</div>
                  <div className="font-bold text-ink mt-1">{voucherData?.signatories?.prepared_by || 'Staff'}</div>
                  <div className="text-muted text-[10px]">{voucherData?.signatories?.prepared_by_position || 'Accounting Staff'}</div>
                  <div className="text-muted text-[10px]">{voucherData?.signatories?.prepared_at || '-'}</div>
                </div>
                <div className="p-3 bg-surface rounded-lg border border-border text-xs">
                  <div className="text-muted font-semibold uppercase text-[10px]">Verified By</div>
                  <div className="font-bold text-ink mt-1">{voucherData?.signatories?.verified_by_position || 'Finance Manager'}</div>
                  <div className="text-muted text-[10px]">Audit Clearance</div>
                </div>
                <div className="p-3 bg-surface rounded-lg border border-border text-xs">
                  <div className="text-muted font-semibold uppercase text-[10px]">Approved By</div>
                  <div className="font-bold text-ink mt-1">{voucherData?.signatories?.approved_by || 'Finance Officer'}</div>
                  <div className="text-muted text-[10px]">{voucherData?.signatories?.approved_by_position || 'Finance Officer'}</div>
                  <div className="text-muted text-[10px]">{voucherData?.signatories?.approved_at || '-'}</div>
                </div>
                <div className="p-3 bg-surface rounded-lg border border-border text-xs">
                  <div className="text-muted font-semibold uppercase text-[10px]">Disbursed To</div>
                  <div className="font-bold text-ink mt-1">{v.payee || 'Recipient'}</div>
                  <div className="text-muted text-[10px]">Acknowledged Beneficiary</div>
                </div>
              </div>
            </div>
          ) : (
            /* ============================================================= */
            /* TAB 2: BIR Form 2307 Preview & Tax Calculator                */
            /* ============================================================= */
            <div className="space-y-5">
              {/* Configuration bar */}
              <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-primary-dark dark:text-primary text-sm font-bold">
                  <Receipt className="w-4 h-4" />
                  Philippine Withholding Tax Classification (EWT / CWT)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      ATC Code & Statutory Nature
                    </label>
                    <select
                      value={selectedAtc}
                      onChange={(e) => handleAtcChange(e.target.value)}
                      className="w-full border border-border bg-bg text-ink rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    >
                      {(birData?.atc_codes || []).map((atc) => (
                        <option key={atc.code} value={atc.code} className="bg-surface text-ink">
                          {atc.code} ({atc.rate}%)  -  {atc.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1">
                      Supplier Tax Identification Number (TIN)
                    </label>
                    <input
                      type="text"
                      value={payeeTin}
                      onChange={(e) => setPayeeTin(e.target.value)}
                      placeholder="000-000-000-000"
                      className="w-full border border-border bg-bg text-ink rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Tax Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-surface rounded-xl border border-border">
                  <div className="text-xs text-muted font-medium">Gross Taxable Base</div>
                  <div className="text-base font-bold text-ink font-mono">{fmt(grossIncome)}</div>
                </div>
                <div className="p-3 bg-surface rounded-xl border border-border">
                  <div className="text-xs text-muted font-medium">Withholding Rate</div>
                  <div className="text-base font-bold text-primary-dark dark:text-primary">{overrideRate}%</div>
                </div>
                <div className="p-3 bg-surface rounded-xl border border-border">
                  <div className="text-xs text-ink font-medium">Tax Withheld (Form 2307)</div>
                  <div className="text-base font-bold text-ink font-mono">{fmt(taxWithheld)}</div>
                </div>
                <div className="p-3 bg-surface rounded-xl border border-border">
                  <div className="text-xs text-ink font-medium">Net Disbursed Amount</div>
                  <div className="text-base font-bold text-ink font-mono">{fmt(netAmount)}</div>
                </div>
              </div>

              {/* Certificate Preview Card */}
              <div className="border border-border rounded-xl p-5 bg-surface text-ink shadow-sm space-y-4">
                <div className="border-b border-border pb-3 text-center">
                  <div className="text-[10px] uppercase font-bold text-muted">Republic of the Philippines &middot; Bureau of Internal Revenue</div>
                  <div className="text-sm font-extrabold text-ink tracking-wide">BIR Form 2307 &middot; Certificate of Creditable Tax Withheld at Source</div>
                  <div className="text-xs text-primary-dark dark:text-primary font-semibold mt-1">
                    Quarter: {birData?.period?.quarter} {birData?.period?.year} &middot; ({birData?.period?.from} to {birData?.period?.to})
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-bg/50 rounded-lg border border-border">
                    <div className="font-bold text-muted uppercase text-[10px] mb-1">Part I  -  Payee (Supplier)</div>
                    <div className="font-bold text-ink">{v.payee}</div>
                    <div className="font-mono text-muted text-[11px]">TIN: {payeeTin}</div>
                    <div className="text-muted text-[11px] mt-0.5">{payeeAddress}</div>
                  </div>
                  <div className="p-3 bg-bg/50 rounded-lg border border-border">
                    <div className="font-bold text-muted uppercase text-[10px] mb-1">Part II  -  Payor (Withholding Agent)</div>
                    <div className="font-bold text-ink">{company?.name || birData?.payor?.registered_name}</div>
                    <div className="font-mono text-muted text-[11px]">TIN: {birData?.payor?.tin}</div>
                    <div className="text-muted text-[11px] mt-0.5">{company?.address || birData?.payor?.address}</div>
                  </div>
                </div>

                <div className="border border-border rounded-lg overflow-hidden text-xs">
                  <table className="w-full">
                    <thead className="bg-bg/60 border-b border-border font-semibold text-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">Nature of Payment</th>
                        <th className="px-3 py-2 text-center">ATC</th>
                        <th className="px-3 py-2 text-right">Taxable Base</th>
                        <th className="px-3 py-2 text-center">Rate</th>
                        <th className="px-3 py-2 text-right">Tax Withheld</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="px-3 py-2 font-medium text-ink">
                          {((birData?.atc_codes || []).find((a) => a.code === selectedAtc))?.nature || 'Professional / Services Payment'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-primary-dark dark:text-primary">{selectedAtc}</td>
                        <td className="px-3 py-2 text-right font-mono text-ink">{fmt(grossIncome)}</td>
                        <td className="px-3 py-2 text-center font-bold text-ink">{overrideRate}%</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-ink">{fmt(taxWithheld)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-[11px] text-muted italic text-center">
                  Official Philippine BIR Form 2307 declaration will be certified upon printing.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-bg/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted bg-surface border border-border rounded-lg hover:bg-bg hover:text-ink font-medium transition-colors"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            {activeTab === 'voucher' ? (
              <button
                type="button"
                disabled={loading || !voucherData}
                onClick={printVoucher}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary hover:bg-primary-dark disabled:opacity-50 text-black rounded-lg transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Print Voucher
              </button>
            ) : (
              <button
                type="button"
                disabled={loading || !birData}
                onClick={printBir2307}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary hover:bg-primary-dark disabled:opacity-50 text-black rounded-lg transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Print BIR Form 2307
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

