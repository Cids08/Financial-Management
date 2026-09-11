import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Paperclip,
  Sparkles,
  X,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (n) =>
  Number(n).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

const URGENCY_COLOR = {
  Overdue: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30',
  'Due Today': 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30',
}
const urgencyClass = (u) =>
  URGENCY_COLOR[u] ?? 'bg-primary/15 text-primary-dark border-primary/30 dark:bg-primary/20 dark:text-primary dark:border-primary/40'

const HORIZON_OPTIONS = [
  { label: 'Overdue only', value: 0, description: 'Past due date' },
  { label: 'Next 7 days', value: 7, description: 'Due within a week' },
  { label: 'Next 15 days', value: 15, description: 'Due in 2 weeks' },
  { label: 'Next 30 days', value: 30, description: 'Due within a month' },
  { label: 'All unpaid', value: '', description: 'Every approved bill' },
]

const PAYMENT_METHODS = ['Check', 'Bank Transfer', 'Online Banking', 'Cash', "Manager's Check"]

const STEPS = ['Configure Run', 'Review & Select', 'Confirmation']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PaymentWizardModal({
  open,
  onClose,
  suppliers = [],
  cashAccounts = [],
  fetchPaymentProposals,
  executePaymentRun,
}) {
  const [step, setStep] = useState(0)

  // Step 1 state
  const [horizon, setHorizon] = useState(7)
  const [supplierId, setSupplierId] = useState('')
  const [cashAccountId, setCashAccountId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0])
  const [revealBalance, setRevealBalance] = useState(false)

  // Step 2 state
  const [proposals, setProposals] = useState([])
  const [selected, setSelected] = useState({}) // { [ap_id]: amount_to_pay }
  const [loadingProposals, setLoadingProposals] = useState(false)
  const [proposalError, setProposalError] = useState(null)
  const [totals, setTotals] = useState({ count: 0, total_available: 0, total_overdue: 0 })

  // Step 3 state
  const [executing, setExecuting] = useState(false)
  const [execError, setExecError] = useState(null)
  const [result, setResult] = useState(null)

  const firstInputRef = useRef(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(0)
      setHorizon(7)
      setSupplierId('')
      setCashAccountId(cashAccounts[0]?.id ?? '')
      setPaymentMethod('Bank Transfer')
      setPaymentDate(new Date().toISOString().split('T')[0])
      setProposals([])
      setSelected({})
      setProposalError(null)
      setExecError(null)
      setResult(null)
      setTimeout(() => firstInputRef.current?.focus(), 80)
    }
  }, [open, cashAccounts])

  // -------------------------------------------------------------------------
  // Step 1 -> Step 2: load proposals
  // -------------------------------------------------------------------------
  const loadProposals = useCallback(async () => {
    setLoadingProposals(true)
    setProposalError(null)
    const filters = {}
    if (horizon !== '') filters.horizon = horizon
    if (supplierId) filters.supplier_id = supplierId

    const res = await fetchPaymentProposals(filters)
    setLoadingProposals(false)

    if (!res.success) {
      setProposalError(res.message)
      return
    }

    const list = res.data.proposals ?? []
    setProposals(list)
    setTotals(res.data.totals ?? {})

    // Pre-select all proposals by default
    const sel = {}
    list.forEach((p) => { sel[p.ap_id] = p.available_to_pay })
    setSelected(sel)

    setStep(1)
  }, [fetchPaymentProposals, horizon, supplierId])

  // -------------------------------------------------------------------------
  // Step 2 -> Step 3: execute payment run
  // -------------------------------------------------------------------------
  const handleExecute = useCallback(async () => {
    setExecuting(true)
    setExecError(null)

    const selectedProposals = Object.entries(selected)
      .filter(([, amt]) => amt > 0)
      .map(([ap_id, amount_to_pay]) => ({
        ap_id: Number(ap_id),
        amount_to_pay: Number(amount_to_pay),
      }))

    if (selectedProposals.length === 0) {
      setExecError('No bills selected or all amounts are zero.')
      setExecuting(false)
      return
    }

    const res = await executePaymentRun({
      cash_account_id: Number(cashAccountId),
      payment_method: paymentMethod,
      payment_date: paymentDate,
      proposals: selectedProposals,
    })

    setExecuting(false)

    if (!res.success) {
      setExecError(res.message)
      return
    }

    setResult(res.data)
    setStep(2)
  }, [cashAccountId, executePaymentRun, paymentDate, paymentMethod, selected])

  // -------------------------------------------------------------------------
  // Derived values (Step 2)
  // -------------------------------------------------------------------------
  const selectedTotal = Object.values(selected).reduce((s, v) => s + Number(v), 0)
  const selectedCount = Object.keys(selected).filter((k) => selected[k] > 0).length

  const cashAccount = cashAccounts.find((c) => String(c.id) === String(cashAccountId))
  const isOverdraft = selectedTotal > (cashAccount?.current_balance ?? Infinity)

  const toggleAll = () => {
    if (selectedCount === proposals.length) {
      setSelected({})
    } else {
      const sel = {}
      proposals.forEach((p) => { sel[p.ap_id] = p.available_to_pay })
      setSelected(sel)
    }
  }

  const toggleRow = (apId, availableToPay) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[apId] !== undefined) {
        delete next[apId]
      } else {
        next[apId] = availableToPay
      }
      return next
    })
  }

  const updateAmount = (apId, val, max) => {
    const clamped = Math.min(Math.max(0, Number(val)), max)
    setSelected((prev) => ({ ...prev, [apId]: clamped }))
  }

  // -------------------------------------------------------------------------
  // Guard
  // -------------------------------------------------------------------------
  if (!open) return null

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-surface border border-border text-ink rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-linear-to-r from-primary/15 via-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 text-primary-dark dark:text-primary rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-ink">AP Payment Wizard</h2>
              <p className="text-xs text-muted">Automated batch accounts payable settlement run</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg text-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-border bg-bg/50">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center gap-2 ${i <= step ? 'text-primary-dark dark:text-primary' : 'text-muted'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                  ${i < step
                    ? 'bg-primary border-primary text-black'
                    : i === step
                    ? 'border-primary text-primary-dark dark:text-primary bg-surface'
                    : 'border-border text-muted bg-surface'
                  }`}>
                  {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-xs font-semibold hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 ${i < step ? 'bg-primary/50' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface">

          {/* ================================================================
              STEP 0 - Configure Run
          ================================================================ */}
          {step === 0 && (
            <div className="space-y-6 max-w-xl mx-auto">
              <div>
                <h3 className="text-base font-semibold text-ink mb-1">Payment Run Settings</h3>
                <p className="text-xs sm:text-sm text-muted">Configure which bills to include and how they will be paid.</p>
              </div>

              {/* Horizon */}
              <div>
                <label className="block text-xs font-medium text-muted mb-2">Bill Horizon</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {HORIZON_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setHorizon(opt.value)}
                      className={`p-3 rounded-xl border text-left transition-all ${horizon === opt.value
                        ? 'border-primary bg-primary/10 text-primary-dark dark:text-primary font-semibold'
                        : 'border-border bg-surface hover:border-muted text-ink'}`}
                    >
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs mt-0.5 text-muted">{opt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Supplier filter */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Filter by Supplier <span className="opacity-70 font-normal">(optional)</span></label>
                <select
                  ref={firstInputRef}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full border border-border bg-surface text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">All Suppliers</option>
                  {suppliers.map((s) => (
                    <option key={s.id ?? s.supplier_id} value={s.id ?? s.supplier_id}>
                      {s.supplier_name ?? s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cash Account */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Cash Account <span className="text-rose-500">*</span></label>
                <select
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                  className="w-full border border-border bg-surface text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">— Select cash account —</option>
                  {cashAccounts.map((ca) => (
                    <option key={ca.id} value={ca.id}>
                      {ca.account_name ?? ca.name}{ca.bank_name ? ` — ${ca.bank_name}` : ''}
                    </option>
                  ))}
                </select>
                {/* Masked balance row — balance hidden by default, revealed via Eye toggle */}
                {cashAccountId && (() => {
                  const ca = cashAccounts.find(c => String(c.id) === String(cashAccountId))
                  return ca ? (
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span>Available Balance:</span>
                      <span className="font-mono font-semibold text-ink">
                        {revealBalance ? fmt(ca.current_balance) : '₱ ••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRevealBalance(r => !r)}
                        className="text-muted hover:text-ink transition-colors"
                        title={revealBalance ? 'Hide balance' : 'Show balance'}
                      >
                        {revealBalance ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  ) : null
                })()}
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Payment Method <span className="text-rose-500">*</span></label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full border border-border bg-surface text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Payment Date <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full border border-border bg-surface text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 scheme-light dark:scheme-dark"
                />
              </div>

              {proposalError && (
                <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-700 dark:text-rose-400 text-xs sm:text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {proposalError}
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              STEP 1 - Review & Select
          ================================================================ */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-35 p-3 bg-primary/10 rounded-xl border border-primary/20">
                  <div className="text-xs text-primary-dark dark:text-primary font-medium">Total Eligible</div>
                  <div className="text-lg font-bold text-ink">{proposals.length} bills</div>
                  <div className="text-xs text-muted">{fmt(totals.total_available)} available</div>
                </div>
                {totals.total_overdue > 0 && (
                  <div className="flex-1 min-w-35 p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                    <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">Overdue</div>
                    <div className="text-lg font-bold text-rose-700 dark:text-rose-400">{totals.total_overdue} bills</div>
                    <div className="text-xs text-muted">Requires immediate payment</div>
                  </div>
                )}
                <div className={`flex-1 min-w-35 p-3 rounded-xl border ${isOverdraft ? 'bg-rose-500/10 border-rose-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
                  <div className={`text-xs font-medium ${isOverdraft ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>Selected Total</div>
                  <div className={`text-lg font-bold ${isOverdraft ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{fmt(selectedTotal)}</div>
                  <div className={`text-xs text-muted`}>
                    {selectedCount} of {proposals.length} selected
                  </div>
                </div>
                {cashAccount && (
                  <div className={`flex-1 min-w-35 p-3 rounded-xl border ${isOverdraft ? 'bg-rose-500/10 border-rose-500/20' : 'bg-bg/40 border-border'}`}>
                    <div className={`text-xs font-medium ${isOverdraft ? 'text-rose-600 dark:text-rose-400' : 'text-muted'}`}>Cash Balance</div>
                    <div className={`text-lg font-bold ${isOverdraft ? 'text-rose-700 dark:text-rose-400' : 'text-ink'} flex items-center gap-1.5`}>
                      {revealBalance ? fmt(cashAccount.current_balance) : '₱ ••••••'}
                      <button
                        type="button"
                        onClick={() => setRevealBalance(r => !r)}
                        className="text-muted hover:text-ink transition-colors"
                        title={revealBalance ? 'Hide balance' : 'Show balance'}
                      >
                        {revealBalance ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    <div className={`text-xs text-muted truncate`}>{cashAccount.account_name ?? cashAccount.name}</div>
                  </div>
                )}
              </div>

              {isOverdraft && (
                <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-700 dark:text-rose-400 text-xs sm:text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>Selected total exceeds the cash account balance. Reduce amounts or deselect bills before proceeding.</span>
                </div>
              )}

              {/* Withheld bills notice — "No Document, No Payment" policy */}
              {(totals.attachment_missing_count ?? 0) > 0 && (
                <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-800 dark:text-amber-300">
                  <Paperclip className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                      {totals.attachment_missing_count} bill{totals.attachment_missing_count === 1 ? '' : 's'} withheld — missing supporting document{totals.attachment_missing_count === 1 ? '' : 's'}
                    </p>
                    <p className="text-amber-700 dark:text-amber-400/90 mt-0.5 text-xs">
                      Company policy requires an attached invoice or delivery receipt before a bill can be included in a payment run.
                      Attach the document in <strong>Accounts Payable</strong>, then re-run the wizard.
                    </p>
                    {(totals.withheld_invoices ?? []).length > 0 && (
                      <p className="text-amber-600 dark:text-amber-400 mt-1 text-xs font-mono">
                        Withheld: {totals.withheld_invoices.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {proposals.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No eligible bills found for this horizon.</p>
                  <p className="text-xs mt-1">Try a wider horizon or clear the supplier filter.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  <table className="w-full text-sm">
                    <thead className="bg-bg/60 border-b border-border">
                      <tr>
                        <th className="px-3 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedCount === proposals.length && proposals.length > 0}
                            onChange={toggleAll}
                            className="rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                          />
                        </th>
                        <th className="px-3 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Supplier</th>
                        <th className="px-3 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Invoice</th>
                        <th className="px-3 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Due Date</th>
                        <th className="px-3 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Status</th>
                        <th className="px-3 py-3 text-right font-semibold text-muted text-xs uppercase tracking-wider">Balance</th>
                        <th className="px-3 py-3 text-right font-semibold text-muted text-xs uppercase tracking-wider">Amount to Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {proposals.map((p) => {
                        const isChecked = selected[p.ap_id] !== undefined
                        return (
                          <tr
                            key={p.ap_id}
                            className={`hover:bg-bg/60 transition-colors ${isChecked ? 'bg-primary/10 dark:bg-primary/15' : ''}`}
                          >
                            <td className="px-3 py-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleRow(p.ap_id, p.available_to_pay)}
                                className="rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-3 font-medium text-ink max-w-35 truncate">{p.supplier_name}</td>
                            <td className="px-3 py-3 text-muted font-mono text-xs">{p.invoice_number}</td>
                            <td className="px-3 py-3 text-muted text-xs">{p.due_date}</td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full border ${urgencyClass(p.urgency)}`}>
                                {p.urgency}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right text-ink font-mono">{fmt(p.available_to_pay)}</td>
                            <td className="px-3 py-3 text-right">
                              {isChecked ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={p.available_to_pay}
                                  step="0.01"
                                  value={selected[p.ap_id] ?? ''}
                                  onChange={(e) => updateAmount(p.ap_id, e.target.value, p.available_to_pay)}
                                  className="w-28 border border-border bg-surface text-ink rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                              ) : (
                                <span className="text-muted text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-bg/40 border-t border-border">
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-xs font-semibold text-muted">
                          {selectedCount} of {proposals.length} bills selected
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-muted font-mono">{fmt(proposals.reduce((s, p) => s + p.available_to_pay, 0))}</td>
                        <td className="px-3 py-3 text-right font-bold text-primary-dark dark:text-primary font-mono">{fmt(selectedTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {execError && (
                <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-700 dark:text-rose-400 text-xs sm:text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {execError}
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              STEP 2 - Confirmation / Success
          ================================================================ */}
          {step === 2 && result && (
            <div className="max-w-xl mx-auto space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-9 h-9" />
                </div>
                <h3 className="text-xl font-bold text-ink">Payment Run Complete!</h3>
                <p className="text-sm text-muted mt-1">
                  {result.count} disbursement{result.count !== 1 ? 's' : ''} created · {fmt(result.total_amount)} total
                </p>
                <p className="text-xs text-muted mt-2">Disbursements are <span className="font-semibold text-amber-600 dark:text-amber-400">Pending</span> and require release through the Disbursements module.</p>
              </div>

              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-bg/60 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Voucher #</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Payee</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Invoice</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted text-xs uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-center font-semibold text-muted text-xs uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.disbursements.map((d) => (
                      <tr key={d.disbursement_id} className="hover:bg-bg/60">
                        <td className="px-4 py-3 font-mono text-xs text-primary-dark dark:text-primary font-bold">{d.voucher_number}</td>
                        <td className="px-4 py-3 text-ink max-w-35 truncate">{d.payee}</td>
                        <td className="px-4 py-3 text-muted font-mono text-xs">{d.invoice_number}</td>
                        <td className="px-4 py-3 text-right font-mono text-ink">{fmt(d.amount_paid)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-bg/40 border-t border-border">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-xs font-semibold text-muted">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-primary-dark dark:text-primary font-mono">{fmt(result.total_amount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-xs text-muted text-center">
                Go to <span className="font-semibold text-ink">Disbursements</span> to approve and release these vouchers.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-bg/60">
          <button
            type="button"
            onClick={() => {
              if (step === 0 || step === 2) {
                onClose()
              } else {
                setStep((s) => s - 1)
                setExecError(null)
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-muted hover:text-ink bg-surface border border-border rounded-lg hover:bg-bg transition-colors"
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
              disabled={!cashAccountId || !paymentDate || loadingProposals}
              onClick={loadProposals}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary hover:bg-primary-dark disabled:opacity-50 text-black rounded-lg transition-colors"
            >
              {loadingProposals ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loadingProposals ? 'Loading…' : 'Load Proposals'}
            </button>
          )}

          {step === 1 && (
            <button
              type="button"
              disabled={selectedCount === 0 || isOverdraft || executing}
              onClick={handleExecute}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary hover:bg-primary-dark disabled:opacity-50 text-black rounded-lg transition-colors"
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {executing ? 'Processing…' : `Execute Run · ${fmt(selectedTotal)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

