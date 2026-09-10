import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Printer,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  X,
} from 'lucide-react'

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const METHODS = [
  { value: '', label: 'Asset Default Method' },
  { value: 'Straight Line', label: 'Straight Line (SL)' },
  { value: 'Double Declining', label: 'Double Declining Balance (DDB)' },
  { value: 'Sum of Years Digits', label: 'Sum-of-the-Years\'-Digits (SYD)' },
]

const STEPS = ['Configure Run', 'Review Schedule & GL Impact', 'Confirmation']

export default function DepreciationRunModal({
  open,
  onClose,
  categories = [],
  fetchDepreciationPreview,
  executeDepreciationRun,
}) {
  const [step, setStep] = useState(0)

  // Step 0 config
  const [fiscalYear, setFiscalYear] = useState(() => new Date().getFullYear())
  const [period, setPeriod] = useState('monthly')
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [category, setCategory] = useState('all')
  const [methodOverride, setMethodOverride] = useState('')
  const [postingDate, setPostingDate] = useState(() => new Date().toISOString().split('T')[0])
  const [remarks, setRemarks] = useState('')

  // Step 1 preview data
  const [previewData, setPreviewData] = useState(null)
  const [selectedAssetIds, setSelectedAssetIds] = useState(new Set())
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  // Step 2 execution state
  const [executing, setExecuting] = useState(false)
  const [execError, setExecError] = useState(null)
  const [runResult, setRunResult] = useState(null)

  useEffect(() => {
    if (open) {
      setStep(0)
      setFiscalYear(new Date().getFullYear())
      setPeriod('monthly')
      setMonth(new Date().getMonth() + 1)
      setCategory('all')
      setMethodOverride('')
      setPostingDate(new Date().toISOString().split('T')[0])
      setRemarks('')
      setPreviewData(null)
      setSelectedAssetIds(new Set())
      setPreviewError(null)
      setExecError(null)
      setRunResult(null)
    }
  }, [open])

  // -------------------------------------------------------------------------
  // Load Preview
  // -------------------------------------------------------------------------
  const loadPreview = useCallback(async () => {
    setLoadingPreview(true)
    setPreviewError(null)

    const params = {
      fiscal_year: fiscalYear,
      period,
      month: period === 'monthly' ? month : '',
      category,
      depreciation_method: methodOverride,
    }

    const res = await fetchDepreciationPreview(params)
    setLoadingPreview(false)

    if (!res.success) {
      setPreviewError(res.message)
      return
    }

    setPreviewData(res.data)
    const allIds = new Set((res.data.proposals || []).map((p) => p.asset_id))
    setSelectedAssetIds(allIds)
    setStep(1)
  }, [fetchDepreciationPreview, fiscalYear, period, month, category, methodOverride])

  // -------------------------------------------------------------------------
  // Execute Run
  // -------------------------------------------------------------------------
  const handleExecuteRun = useCallback(async () => {
    if (selectedAssetIds.size === 0) {
      setExecError('Please select at least one asset to include in the depreciation run.')
      return
    }

    setExecuting(true)
    setExecError(null)

    const payload = {
      fiscal_year: Number(fiscalYear),
      period,
      month: period === 'monthly' ? Number(month) : null,
      posting_date: postingDate,
      remarks: remarks.trim() || undefined,
      asset_ids: Array.from(selectedAssetIds),
    }

    const res = await executeDepreciationRun(payload)
    setExecuting(false)

    if (!res.success) {
      setExecError(res.message)
      return
    }

    setRunResult(res.data)
    setStep(2)
  }, [executeDepreciationRun, fiscalYear, period, month, postingDate, remarks, selectedAssetIds])

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------
  const toggleSelectAll = () => {
    const proposals = previewData?.proposals || []
    if (selectedAssetIds.size === proposals.length) {
      setSelectedAssetIds(new Set())
    } else {
      setSelectedAssetIds(new Set(proposals.map((p) => p.asset_id)))
    }
  }

  const toggleAsset = (id) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedProposals = (previewData?.proposals || []).filter((p) => selectedAssetIds.has(p.asset_id))
  const selectedDepreciationTotal = selectedProposals.reduce((sum, p) => sum + p.period_depreciation, 0)
  const selectedCurrentBookTotal = selectedProposals.reduce((sum, p) => sum + p.current_book_value, 0)
  const selectedProjectedBookTotal = selectedProposals.reduce((sum, p) => sum + p.projected_book_value, 0)

  // -------------------------------------------------------------------------
  // Print Schedule
  // -------------------------------------------------------------------------
  const printSchedule = () => {
    const win = window.open('', '_blank', 'width=950,height=1000')
    if (!win) return

    const periodLabel = period === 'monthly'
      ? `${MONTHS.find((m) => m.value === Number(month))?.label} ${fiscalYear}`
      : `Full Year ${fiscalYear}`

    const items = runResult?.updated_assets || selectedProposals

    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Depreciation Schedule ${runResult?.voucher_number || previewData?.voucher_number || ''}</title>
          <style>
            @page { size: landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; margin: 0; padding: 12px; font-size: 11px; }
            .hdr { border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 16px; font-weight: 800; text-transform: uppercase; color: #1e3a8a; }
            .subtitle { font-size: 11px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th { background: #f3f4f6; border: 1px solid #d1d5db; padding: 5px 6px; font-size: 10px; font-weight: 700; text-align: left; text-transform: uppercase; }
            td { border: 1px solid #e5e7eb; padding: 5px 6px; }
            td.num { text-align: right; font-family: monospace; }
            .gl-box { border: 1px solid #111827; background: #f9fafb; padding: 8px; margin-top: 16px; font-size: 11px; }
            .sig-row { display: flex; justify-content: space-between; margin-top: 24px; }
            .sig-col { width: 30%; border-top: 1px solid #111827; text-align: center; padding-top: 4px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="hdr">
            <div>
              <div class="title">Fixed Assets Periodic Depreciation Schedule</div>
              <div class="subtitle">Period: ${periodLabel} &middot; Voucher: ${runResult?.voucher_number || previewData?.voucher_number || '—'} &middot; Posting Date: ${postingDate}</div>
            </div>
            <div style="text-align: right; font-size: 10px; color: #6b7280;">
              Printed on ${new Date().toLocaleString('en-PH')}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Asset Code</th>
                <th>Asset Description</th>
                <th>Category</th>
                <th style="text-align: right;">Acquisition Cost</th>
                <th style="text-align: right;">Current Book Value</th>
                <th style="text-align: right;">Depreciation This Period</th>
                <th style="text-align: right;">Projected Book Value</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((p) => `
                <tr>
                  <td style="font-family: monospace; font-weight: 700;">${p.asset_code}</td>
                  <td>${p.asset_name}</td>
                  <td>${p.asset_category || '—'}</td>
                  <td class="num">${fmt(p.purchase_cost || 0)}</td>
                  <td class="num">${fmt(p.current_book_value || 0)}</td>
                  <td class="num" style="font-weight: 700; color: #b91c1c;">${fmt(p.period_depreciation || p.depreciation_amount || 0)}</td>
                  <td class="num" style="font-weight: 700; color: #15803d;">${fmt(p.projected_book_value || p.new_book_value || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="background: #f9fafb; font-weight: 800;">
                <td colspan="5" style="text-align: right; text-transform: uppercase;">Total Period Depreciation Expense</td>
                <td class="num" style="border-top: 2px solid #111827; border-bottom: 3px double #111827; color: #b91c1c;">
                  ${fmt(selectedDepreciationTotal || runResult?.total_depreciation || 0)}
                </td>
                <td class="num" style="border-top: 2px solid #111827; border-bottom: 3px double #111827;">
                  ${fmt(selectedProjectedBookTotal || 0)}
                </td>
              </tr>
            </tfoot>
          </table>

          <div class="gl-box">
            <strong>General Ledger Journal Entry Summary:</strong><br>
            &bull; <strong>Debit 5500 &middot; Depreciation Expense</strong>: ${fmt(selectedDepreciationTotal || runResult?.total_depreciation || 0)}<br>
            &bull; <strong>Credit 1590 &middot; Accumulated Depreciation</strong>: ${fmt(selectedDepreciationTotal || runResult?.total_depreciation || 0)}
          </div>

          <div class="sig-row">
            <div class="sig-col">Prepared By: Asset Accountant</div>
            <div class="sig-col">Reviewed By: Financial Controller</div>
            <div class="sig-col">Approved By: Chief Financial Officer</div>
          </div>
        </body>
      </html>
    `)

    win.document.close()
    win.focus()
    win.print()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <TrendingDown className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Fixed Assets Depreciation Run</h2>
              <p className="text-xs text-gray-500">Automated periodic asset depreciation & GL journal entry posting</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-gray-100 bg-gray-50">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-amber-600' : 'text-gray-400'}`}>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                    i < step
                      ? 'bg-amber-600 border-amber-600 text-white'
                      : i === step
                      ? 'border-amber-600 text-amber-600'
                      : 'border-gray-300 text-gray-400'
                  }`}
                >
                  {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-xs font-semibold hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 ${i < step ? 'bg-amber-400' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP 0: Configure Run */}
          {step === 0 && (
            <div className="space-y-6 max-w-xl mx-auto">
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-1">Depreciation Run Configuration</h3>
                <p className="text-sm text-gray-500">Configure the fiscal period and calculation rules for this run.</p>
              </div>

              {/* Fiscal Year & Cadence */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Fiscal Year</label>
                  <select
                    value={fiscalYear}
                    onChange={(e) => setFiscalYear(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
                  >
                    {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                      <option key={y} value={y}>FY {y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Period Cadence</label>
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                    <button
                      type="button"
                      onClick={() => setPeriod('monthly')}
                      className={`flex-1 py-2 font-medium transition-colors ${
                        period === 'monthly' ? 'bg-amber-600 text-white font-semibold' : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriod('annual')}
                      className={`flex-1 py-2 font-medium transition-colors ${
                        period === 'annual' ? 'bg-amber-600 text-white font-semibold' : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Annual
                    </button>
                  </div>
                </div>
              </div>

              {/* Month Selector if Monthly */}
              {period === 'monthly' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Fiscal Month</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        Month {m.value} &middot; {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Category Filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Asset Category Filter</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
                >
                  <option value="all">All Asset Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Method Override */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Depreciation Method</label>
                <select
                  value={methodOverride}
                  onChange={(e) => setMethodOverride(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
                >
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Posting Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">GL Posting Date</label>
                <input
                  type="date"
                  value={postingDate}
                  onChange={(e) => setPostingDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Journal Entry Remarks (Optional)</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Monthly asset depreciation run"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
                />
              </div>

              {previewError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {previewError}
                </div>
              )}
            </div>
          )}

          {/* STEP 1: Review Schedule & GL Impact */}
          {step === 1 && previewData && (
            <div className="space-y-4">
              {/* Idempotency Warning if already posted */}
              {previewData.already_posted && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-sm">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Period Already Posted:</strong> A depreciation journal entry for{' '}
                    <strong>{previewData.period_key}</strong> has already been posted under transaction voucher{' '}
                    <span className="font-mono font-bold text-amber-900">{previewData.voucher_number}</span>.
                    Duplicate execution is strictly prevented by system controls.
                  </div>
                </div>
              )}

              {/* Executive Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-xs text-gray-500 font-medium">Eligible Assets</div>
                  <div className="text-lg font-bold text-gray-900">{selectedProposals.length} of {previewData.proposals?.length || 0}</div>
                  <div className="text-xs text-gray-400">Selected for run</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-xs text-gray-500 font-medium">Pre-Run Book Value</div>
                  <div className="text-lg font-bold text-gray-800 font-mono">{fmt(selectedCurrentBookTotal)}</div>
                  <div className="text-xs text-gray-400">Current carrying value</div>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <div className="text-xs text-rose-600 font-medium">Depreciation Expense</div>
                  <div className="text-lg font-bold text-rose-700 font-mono">{fmt(selectedDepreciationTotal)}</div>
                  <div className="text-xs text-rose-500">Period P&L impact</div>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <div className="text-xs text-emerald-600 font-medium">Post-Run Book Value</div>
                  <div className="text-lg font-bold text-emerald-700 font-mono">{fmt(selectedProjectedBookTotal)}</div>
                  <div className="text-xs text-emerald-600">Ending carrying value</div>
                </div>
              </div>

              {/* GL Double-Entry Preview Box */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="font-bold text-blue-900 uppercase">General Ledger Journal Entry:</span>{' '}
                  <span className="font-mono text-blue-700 font-semibold">{previewData.voucher_number}</span> &middot;{' '}
                  <span className="text-blue-800">Posting Date: {postingDate}</span>
                </div>
                <div className="font-mono font-semibold text-blue-900 flex items-center gap-3">
                  <span>Dr. 5500 Depreciation Expense: {fmt(selectedDepreciationTotal)}</span>
                  <span>|</span>
                  <span>Cr. 1590 Accumulated Depreciation: {fmt(selectedDepreciationTotal)}</span>
                </div>
              </div>

              {/* Asset Schedule Table */}
              {previewData.proposals?.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No eligible depreciable assets found for this criteria.</p>
                  <p className="text-xs mt-1">Check category filters or confirm assets have not reached salvage value.</p>
                </div>
              ) : (
                <div className="overflow-x-hidden overflow-y-auto rounded-xl border border-gray-200 max-h-[42vh]">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2.5 text-left">
                          <input
                            type="checkbox"
                            checked={selectedAssetIds.size === previewData.proposals.length && previewData.proposals.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded"
                          />
                        </th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Asset Code</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Asset Name</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Category</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Acquisition Cost</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Current Book</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Depreciation</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Projected Book</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewData.proposals.map((p) => {
                        const isChecked = selectedAssetIds.has(p.asset_id)
                        return (
                          <tr
                            key={p.asset_id}
                            className={`hover:bg-gray-50 transition-colors ${isChecked ? 'bg-amber-50/40' : 'opacity-60'}`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleAsset(p.asset_id)}
                                className="rounded"
                              />
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-gray-800">{p.asset_code}</td>
                            <td className="px-3 py-2 font-medium text-gray-900 max-w-[150px] truncate">{p.asset_name}</td>
                            <td className="px-3 py-2 text-gray-500">{p.asset_category}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(p.purchase_cost)}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(p.current_book_value)}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-rose-700">{fmt(p.period_depreciation)}</td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{fmt(p.projected_book_value)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200 sticky bottom-0 z-10 font-bold">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-gray-700">
                          {selectedAssetIds.size} of {previewData.proposals.length} assets selected
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(selectedProposals.reduce((s, p) => s + p.purchase_cost, 0))}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(selectedCurrentBookTotal)}</td>
                        <td className="px-3 py-2 text-right font-mono text-rose-700">{fmt(selectedDepreciationTotal)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700">{fmt(selectedProjectedBookTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {execError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {execError}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Confirmation / Success */}
          {step === 2 && runResult && (
            <div className="max-w-xl mx-auto space-y-6 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-9 h-9 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Depreciation Run Complete!</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Successfully processed {runResult.assets_count} asset(s) for {runResult.period_key}
                </p>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-sm text-left">
                <div className="flex justify-between">
                  <span className="text-gray-500">Journal Voucher No:</span>
                  <span className="font-mono font-bold text-blue-700">{runResult.voucher_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Depreciation Posted:</span>
                  <span className="font-mono font-bold text-rose-700">{fmt(runResult.total_depreciation)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">GL Accounts Updated:</span>
                  <span className="font-medium text-gray-800">5500 (Dr) / 1590 (Cr)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Execution Status:</span>
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700">
                    Posted & Reconciled
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={printSchedule}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg transition-colors shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  Print Depreciation Schedule
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => {
              if (step === 0 || step === 2) onClose()
              else {
                setStep((s) => s - 1)
                setExecError(null)
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            {step === 0 || step === 2 ? (
              <>
                <X className="w-4 h-4" />
                {step === 2 ? 'Close' : 'Cancel'}
              </>
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                Back
              </>
            )}
          </button>

          {step === 0 && (
            <button
              type="button"
              disabled={loadingPreview}
              onClick={loadPreview}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm"
            >
              {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loadingPreview ? 'Calculating…' : 'Calculate Preview'}
            </button>
          )}

          {step === 1 && (
            <button
              type="button"
              disabled={previewData?.already_posted || selectedAssetIds.size === 0 || executing}
              onClick={handleExecuteRun}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg transition-colors shadow-sm"
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {executing ? 'Posting to GL…' : `Post Depreciation · ${fmt(selectedDepreciationTotal)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

