// src/components/BatchApproveExpensesModal.jsx
// 3-step Expense Batch Approval Wizard — modeled after PaymentWizardModal.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Paperclip,
  Receipt,
  Sparkles,
  X,
} from 'lucide-react'
import { formatCurrency } from '../utils/formatters'
import Button from './Button'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (n) =>
  Number(n).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

const STEPS = ['Configure Run', 'Review & Select', 'Confirmation']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function BatchApproveExpensesModal({
  open,
  onClose,
  allExpenses = [],
  preSelectedIds = [],
  cashAccounts = [],
  budgets = [],
  categories = [],
  fetchApprovalProposals,
  onBatchApprove,
}) {
  const [step, setStep] = useState(0)

  // ── Step 0 (Configure) state ──────────────────────────────────────────────
  const [filterCategory, setFilterCategory] = useState('')
  const [filterBudget, setFilterBudget] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // ── Step 1 (Review & Select) state ───────────────────────────────────────
  const [loadingProposals, setLoadingProposals] = useState(false)
  const [proposals, setProposals] = useState([])
  const [totals, setTotals] = useState({ count: 0, total_amount: 0, attachment_missing_count: 0, withheld_expenses: [] })
  const [selected, setSelected] = useState({})
  const [proposalError, setProposalError] = useState(null)

  // ── Step 2 (Confirmation/Execution) state ────────────────────────────────
  const [executing, setExecuting] = useState(false)
  const [execError, setExecError] = useState(null)
  const [result, setResult] = useState(null)

  const firstInputRef = useRef(null)

  // Fallback eligible base from allExpenses: strictly Pending + has_receipt
  const eligibleFromProps = useMemo(
    () => (allExpenses || []).filter((x) => x.status === 'Pending' && x.has_receipt),
    [allExpenses],
  )

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setFilterCategory('')
      setFilterBudget('')
      setFilterDateFrom('')
      setFilterDateTo('')
      setProposalError(null)
      setExecError(null)
      setResult(null)

      if (preSelectedIds && preSelectedIds.length > 0) {
        // Opened from table selection: pre-populate proposals directly from eligible expenses
        const preSelectedList = eligibleFromProps.filter((x) => preSelectedIds.includes(x.id))
        setProposals(preSelectedList)
        setTotals({
          count: preSelectedList.length,
          total_amount: preSelectedList.reduce((s, x) => s + Number(x.expense_amount || 0), 0),
          attachment_missing_count: 0,
          withheld_expenses: [],
        })
        const sel = {}
        preSelectedIds.forEach((id) => { sel[id] = true })
        setSelected(sel)
        setStep(1)
      } else {
        setStep(0)
        setProposals([])
        setSelected({})
        setTimeout(() => firstInputRef.current?.focus(), 80)
      }
    }
  }, [open, preSelectedIds, eligibleFromProps])

  // ── Step 0 → Step 1: Load Proposals ───────────────────────────────────────
  const handleLoadProposals = useCallback(async () => {
    setLoadingProposals(true)
    setProposalError(null)

    const filters = {}
    if (filterCategory) filters.expense_category_id = filterCategory
    if (filterBudget) filters.budget_id = filterBudget
    if (filterDateFrom) filters.expense_date_from = filterDateFrom
    if (filterDateTo) filters.expense_date_to = filterDateTo

    if (fetchApprovalProposals) {
      const res = await fetchApprovalProposals(filters)
      setLoadingProposals(false)

      if (!res?.success) {
        setProposalError(res?.message || 'Failed to load eligible expenses.')
        return
      }

      const list = res.data?.proposals ?? []
      setProposals(list)
      setTotals(res.data?.totals ?? { count: 0, total_amount: 0, attachment_missing_count: 0, withheld_expenses: [] })

      const sel = {}
      list.forEach((p) => { sel[p.id] = true })
      setSelected(sel)
      setStep(1)
    } else {
      // Local fallback
      setLoadingProposals(false)
      const list = eligibleFromProps.filter((x) => {
        if (filterCategory && String(x.expense_category_id) !== String(filterCategory)) return false
        if (filterBudget && String(x.budget_id) !== String(filterBudget)) return false
        if (filterDateFrom && x.expense_date < filterDateFrom) return false
        if (filterDateTo && x.expense_date > filterDateTo) return false
        return true
      })
      setProposals(list)
      setTotals({
        count: list.length,
        total_amount: list.reduce((s, x) => s + Number(x.expense_amount || 0), 0),
        attachment_missing_count: 0,
        withheld_expenses: [],
      })
      const sel = {}
      list.forEach((p) => { sel[p.id] = true })
      setSelected(sel)
      setStep(1)
    }
  }, [fetchApprovalProposals, filterCategory, filterBudget, filterDateFrom, filterDateTo, eligibleFromProps])

  // ── Selection helpers ─────────────────────────────────────────────────────
  const selectedExpenses = useMemo(
    () => proposals.filter((p) => selected[p.id]),
    [proposals, selected],
  )
  const selectedIds = useMemo(
    () => selectedExpenses.map((p) => p.id),
    [selectedExpenses],
  )
  const selectedTotal = useMemo(
    () => selectedExpenses.reduce((s, p) => s + (Number(p.expense_amount) || 0), 0),
    [selectedExpenses],
  )
  const selectedCount = selectedIds.length
  const allProposalsSelected =
    proposals.length > 0 && proposals.every((p) => selected[p.id])

  const toggleAll = () => {
    if (allProposalsSelected) {
      setSelected({})
    } else {
      const sel = {}
      proposals.forEach((p) => { sel[p.id] = true })
      setSelected(sel)
    }
  }

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[id]) { delete next[id] } else { next[id] = true }
      return next
    })
  }

  // ── Step 1 → Step 2 ───────────────────────────────────────────────────────
  const handleReview = useCallback(() => {
    if (selectedCount === 0) {
      setExecError('Select at least one expense to proceed.')
      return
    }
    setExecError(null)
    setStep(2)
  }, [selectedCount])

  // ── Step 2 → Execute ──────────────────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    setExecuting(true)
    setExecError(null)
    const res = await onBatchApprove(selectedIds)
    setExecuting(false)
    if (!res?.success) {
      setExecError(res?.message ?? 'An unexpected error occurred.')
      return
    }
    setResult(res.data ?? { count: selectedIds.length, total_amount: selectedTotal })
    setStep(3)
  }, [onBatchApprove, selectedIds, selectedTotal])

  // ── Impact summaries (Step 2) ─────────────────────────────────────────────
  const cashImpact = useMemo(() => {
    const map = {}
    selectedExpenses.forEach((x) => {
      const key = x.cash_account_id
      if (!key) return
      if (!map[key]) {
        const acc = cashAccounts.find((c) => c.id === Number(key))
        map[key] = {
          account_name: acc?.account_name ?? x.cash_account_name ?? `Account #${key}`,
          bank_name: acc?.bank_name ?? x.cash_account_bank ?? '',
          current_balance: Number(acc?.current_balance ?? x.cash_account_balance ?? 0),
          total: 0,
        }
      }
      map[key].total += Number(x.expense_amount) || 0
    })
    return Object.values(map).map((item) => ({
      ...item,
      remaining: item.current_balance - item.total,
      isOverdrawn: (item.current_balance - item.total) < 0,
    }))
  }, [selectedExpenses, cashAccounts])

  const budgetImpact = useMemo(() => {
    const map = {}
    selectedExpenses.forEach((x) => {
      const key = x.budget_id
      if (!key) return
      if (!map[key]) {
        const b = budgets.find((b) => Number(b.budget_id) === Number(key))
        map[key] = {
          budget_name: b?.budget_name ?? x.budget_name ?? `Budget #${key}`,
          remaining_amount: Number(b?.remaining_amount ?? x.budget_remaining_amount ?? 0),
          total: 0,
        }
      }
      map[key].total += Number(x.expense_amount) || 0
    })
    return Object.values(map).map((item) => ({
      ...item,
      after: item.remaining_amount - item.total,
      isOverBudget: (item.remaining_amount - item.total) < 0,
    }))
  }, [selectedExpenses, budgets])

  const hasOverdraft = cashImpact.some((c) => c.isOverdrawn)
  const hasOverBudget = budgetImpact.some((b) => b.isOverBudget)

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!open) return null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-surface border border-border text-ink rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-emerald-500/10 via-primary/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-ink">Expense Batch Approval Wizard</h2>
              <p className="text-xs text-muted">Approve pending expenses with verified proof · No Document, No Payment</p>
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
              <div className={`flex items-center gap-2 ${i <= step ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors
                  ${i < step
                    ? 'bg-emerald-600 border-emerald-600 text-white dark:bg-emerald-500 dark:border-emerald-500'
                    : i === step
                    ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400 bg-surface'
                    : 'border-border text-muted bg-surface'
                  }`}>
                  {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-xs font-semibold hidden sm:block">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 ${i < step ? 'bg-emerald-500/50' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface">

          {/* ================================================================
              STEP 0 — Configure Run
          ================================================================ */}
          {step === 0 && (
            <div className="space-y-6 max-w-xl mx-auto">
              <div>
                <h3 className="text-base font-semibold text-ink mb-1">Approval Run Settings</h3>
                <p className="text-xs sm:text-sm text-muted">
                  Configure filters to load pending expense proposals. In accordance with strict documentary policy,
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400"> only expenses with attached proof of receipt</span> will be included in the approval run.
                </p>
              </div>

              {/* Policy badge */}
              <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
                <Receipt className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  <strong>Strict Policy Enforced:</strong> Expenses missing supporting receipts are automatically withheld from batch release.
                </span>
              </div>

              {/* Category filter */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Filter by Category <span className="opacity-70">(optional)</span>
                </label>
                <select
                  ref={firstInputRef}
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full border border-border bg-surface text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.category_name}</option>
                  ))}
                </select>
              </div>

              {/* Budget filter */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Filter by Budget <span className="opacity-70">(optional)</span>
                </label>
                <select
                  value={filterBudget}
                  onChange={(e) => setFilterBudget(e.target.value)}
                  className="w-full border border-border bg-surface text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="">All Budgets</option>
                  {budgets.map((b) => (
                    <option key={b.budget_id} value={b.budget_id}>{b.budget_name}</option>
                  ))}
                </select>
              </div>

              {/* Date range */}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Filter by Expense Date <span className="opacity-70">(optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <CalendarRange size={15} className="text-muted shrink-0" />
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    max={filterDateTo || undefined}
                    className="flex-1 border border-border bg-surface text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 scheme-light dark:scheme-dark"
                  />
                  <span className="text-xs text-muted">to</span>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    min={filterDateFrom || undefined}
                    className="flex-1 border border-border bg-surface text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 scheme-light dark:scheme-dark"
                  />
                </div>
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
              STEP 1 — Review & Select (ONLY expenses with proof)
          ================================================================ */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[140px] p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Total Eligible (With Proof)</div>
                  <div className="text-lg font-bold text-ink">{proposals.length} expenses</div>
                  <div className="text-xs text-muted">{fmt(totals.total_amount ?? 0)} available</div>
                </div>
                <div className={`flex-1 min-w-[140px] p-3 rounded-xl border ${selectedCount > 0 ? 'bg-primary/10 border-primary/20' : 'bg-bg/40 border-border'}`}>
                  <div className={`text-xs font-medium ${selectedCount > 0 ? 'text-primary' : 'text-muted'}`}>Selected</div>
                  <div className={`text-lg font-bold ${selectedCount > 0 ? 'text-ink' : 'text-muted'}`}>{selectedCount} of {proposals.length}</div>
                  <div className={`text-xs ${selectedCount > 0 ? 'text-primary' : 'text-muted'}`}>{fmt(selectedTotal)}</div>
                </div>
              </div>

              {/* Withheld notice — exactly like AP Payment Wizard */}
              {(totals.attachment_missing_count ?? 0) > 0 && (
                <div className="flex items-start gap-2.5 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-800 dark:text-amber-300">
                  <Paperclip className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                      {totals.attachment_missing_count} pending expense{totals.attachment_missing_count === 1 ? '' : 's'} withheld — missing supporting receipt
                    </p>
                    <p className="text-amber-700 dark:text-amber-400/90 mt-0.5 text-xs">
                      Company policy (<em>"No Document, No Payment"</em>) requires an attached receipt document before an expense can be approved.
                      Attach the receipt on the Expenses page, then re-run the wizard.
                    </p>
                    {(totals.withheld_expenses ?? []).length > 0 && (
                      <p className="text-amber-600 dark:text-amber-400 mt-1 text-xs font-mono">
                        Withheld: {totals.withheld_expenses.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {proposals.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <Receipt className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No eligible pending expenses with proof found.</p>
                  <p className="text-xs mt-1">Pending expenses must have an attached receipt document to be included in batch approval.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-surface">
                  <table className="w-full text-sm">
                    <thead className="bg-bg/60 border-b border-border">
                      <tr>
                        <th className="px-3 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={allProposalsSelected}
                            onChange={toggleAll}
                            className="rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                          />
                        </th>
                        <th className="px-3 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Expense</th>
                        <th className="px-3 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Category</th>
                        <th className="px-3 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider">Budget</th>
                        <th className="px-3 py-3 text-left font-semibold text-muted text-xs uppercase tracking-wider whitespace-nowrap">Date</th>
                        <th className="px-3 py-3 text-right font-semibold text-muted text-xs uppercase tracking-wider whitespace-nowrap">Amount</th>
                        <th className="px-3 py-3 text-center font-semibold text-muted text-xs uppercase tracking-wider">Proof Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {proposals.map((x) => {
                        const isChecked = !!selected[x.id]
                        return (
                          <tr
                            key={x.id}
                            onClick={() => toggleRow(x.id)}
                            className={`cursor-pointer hover:bg-bg/60 transition-colors ${isChecked ? 'bg-emerald-500/10 dark:bg-emerald-500/15' : ''}`}
                          >
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleRow(x.id)}
                                className="rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-3 max-w-[180px]">
                              <p className="font-medium text-ink truncate">{x.description}</p>
                              <p className="text-xs text-muted truncate">
                                {x.receipt_number || x.cash_account_name || x.expense_source} {x.supplier_name ? `· ${x.supplier_name}` : ''}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-muted text-xs">
                              {x.expense_category_name}
                            </td>
                            <td className="px-3 py-3 text-muted text-xs max-w-[120px] truncate">
                              {x.budget_name}
                            </td>
                            <td className="px-3 py-3 text-muted text-xs whitespace-nowrap">
                              {x.expense_date}
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-semibold text-ink whitespace-nowrap">
                              {fmt(x.expense_amount)}
                              {x.is_over_budget && (
                                <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400">Over</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle className="w-3 h-3" />
                                Verified
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-bg/40 border-t border-border">
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-xs font-semibold text-muted">
                          {selectedCount} of {proposals.length} selected
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmt(selectedTotal)}
                        </td>
                        <td />
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
              STEP 2 — Confirmation
          ================================================================ */}
          {step === 2 && (
            <div className="max-w-xl mx-auto space-y-6">
              <div>
                <h3 className="text-base font-semibold text-ink mb-1">Confirm Batch Approval</h3>
                <p className="text-xs sm:text-sm text-muted">
                  Review the financial drawdown impact before finalizing. Once approved, journal entries will post to the General Ledger and cash accounts will be deducted.
                </p>
              </div>

              {/* Selected summary */}
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{selectedCount} expense{selectedCount !== 1 ? 's' : ''} to approve</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">All items verified with attached proof</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{fmt(selectedTotal)}</p>
                  <p className="text-xs text-muted">Total payout</p>
                </div>
              </div>

              {/* Cash account impact */}
              {cashImpact.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Cash Account Drawdown</p>
                  <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-bg/60 border-b border-border">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-semibold text-muted text-xs uppercase">Account</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-muted text-xs uppercase">Balance</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-muted text-xs uppercase">Debit</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-muted text-xs uppercase">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {cashImpact.map((c, i) => (
                          <tr key={i} className={c.isOverdrawn ? 'bg-rose-500/10' : ''}>
                            <td className="px-4 py-2.5 font-medium text-ink">
                              {c.account_name}
                              {c.bank_name && <span className="text-muted text-xs ml-1">· {c.bank_name}</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-muted">{fmt(c.current_balance)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold text-rose-600 dark:text-rose-400">{fmt(c.total)}</td>
                            <td className={`px-4 py-2.5 text-right font-mono font-bold ${c.isOverdrawn ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {fmt(c.remaining)}
                              {c.isOverdrawn && <span className="ml-1 text-[9px] bg-rose-500/20 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded font-semibold">OVERDRAFT</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Budget impact */}
              {budgetImpact.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Budget Utilization</p>
                  <div className="rounded-xl border border-border bg-surface overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-bg/60 border-b border-border">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-semibold text-muted text-xs uppercase">Budget</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-muted text-xs uppercase">Remaining</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-muted text-xs uppercase">Charge</th>
                          <th className="px-4 py-2.5 text-right font-semibold text-muted text-xs uppercase">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {budgetImpact.map((b, i) => (
                          <tr key={i} className={b.isOverBudget ? 'bg-rose-500/10' : ''}>
                            <td className="px-4 py-2.5 font-medium text-ink">{b.budget_name}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-muted">{fmt(b.remaining_amount)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold text-rose-600 dark:text-rose-400">{fmt(b.total)}</td>
                            <td className={`px-4 py-2.5 text-right font-mono font-bold ${b.isOverBudget ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {fmt(b.after)}
                              {b.isOverBudget && <span className="ml-1 text-[9px] bg-rose-500/20 text-rose-600 dark:text-rose-400 px-1 py-0.5 rounded font-semibold">OVER</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(hasOverdraft || hasOverBudget) && (
                <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-700 dark:text-rose-400 text-xs sm:text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {hasOverdraft && 'One or more cash accounts will be overdrawn. '}
                    {hasOverBudget && 'One or more budgets will be exceeded. '}
                    Adjust selections before proceeding.
                  </span>
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
              STEP 3 — Success
          ================================================================ */}
          {step === 3 && (
            <div className="max-w-md mx-auto space-y-6 text-center py-4">
              <div className="w-16 h-16 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-9 h-9" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-ink">Batch Approval Complete!</h3>
                <p className="text-sm text-muted mt-1">
                  {result?.count ?? selectedCount} expense{(result?.count ?? selectedCount) !== 1 ? 's' : ''} approved
                  {' · '}
                  {fmt(result?.total_amount ?? selectedTotal)} total
                </p>
                <p className="text-xs text-muted mt-2">
                  Journal entries have been posted to the <span className="font-semibold text-ink">General Ledger</span> and cash accounts have been updated.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-bg/60">
          <Button
            variant="secondary"
            size="md"
            onClick={() => {
              if (step === 0 || step === 3) { onClose() }
              else { setStep((s) => s - 1); setExecError(null) }
            }}
          >
            {step === 0 || step === 3 ? (
              <><X className="w-4 h-4 mr-1.5 inline" />{step === 3 ? 'Close' : 'Cancel'}</>
            ) : (
              <><ChevronLeft className="w-4 h-4 mr-1.5 inline" />Back</>
            )}
          </Button>

          {step === 0 && (
            <Button
              variant="primary"
              size="md"
              disabled={loadingProposals}
              onClick={handleLoadProposals}
            >
              {loadingProposals ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin inline" /> : <ChevronRight className="w-4 h-4 mr-1.5 inline" />}
              {loadingProposals ? 'Loading…' : 'Load Proposals'}
            </Button>
          )}

          {step === 1 && (
            <Button
              variant="primary"
              size="md"
              disabled={selectedCount === 0}
              onClick={handleReview}
            >
              <ChevronRight className="w-4 h-4 mr-1.5 inline" />
              Review ({selectedCount})
            </Button>
          )}

          {step === 2 && (
            <Button
              variant="primary"
              size="md"
              disabled={executing || hasOverdraft || hasOverBudget}
              onClick={handleExecute}
            >
              {executing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin inline" /> : <Sparkles className="w-4 h-4 mr-1.5 inline" />}
              {executing ? 'Processing…' : `Approve ${selectedCount} Expense${selectedCount !== 1 ? 's' : ''} · ${fmt(selectedTotal)}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

