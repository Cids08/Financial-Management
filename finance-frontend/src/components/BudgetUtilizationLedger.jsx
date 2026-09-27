import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownRight, CheckCircle2, Info, Loader2, Maximize2, Users } from 'lucide-react'
import { formatCurrency, formatDate } from '../utils/formatters'

/**
 * Explains a budget's `used_amount`.
 *
 * The stored total is denormalized, so on its own the utilization bar is an
 * assertion with nothing behind it. This lists the transactions that actually
 * moved it, in date order, with a running balance, and reconciles the sum
 * against the stored total.
 *
 * The variance is reported honestly rather than hidden. A non-zero variance is
 * expected on seeded/demo budgets (BudgetSeeder assigns a random used_amount
 * with no transactions behind it) and is a genuine red flag on real data, so
 * it's framed as "these transactions account for X of Y" rather than as a
 * pass/fail error.
 */
export default function BudgetUtilizationLedger({ budgetId, fetchUtilization, currency, previewLimit = 0, onExpand }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!budgetId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchUtilization(budgetId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [budgetId, fetchUtilization])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
        <Loader2 size={15} className="animate-spin" />
        Loading transactions behind this total…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    )
  }

  if (!data) return null

  const { rows = [], summary = {} } = data
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.kind === filter)

  // In the detail modal the ledger is a preview: enough to prove the total is
  // real, with the full list one click away in the full-screen view. Passing
  // previewLimit = 0 renders everything.
  const capped = previewLimit > 0 && !showAll
  const visible = capped ? filtered.slice(0, previewLimit) : filtered
  const hiddenCount = filtered.length - visible.length

  // Anything the transactions don't explain. This is the whole point of the
  // panel, so it's never suppressed.
  const variance = Number(summary.variance || 0)
  const hasVariance = Math.abs(variance) > 0.01
  const reconciled = !hasVariance

  return (
    <div className="space-y-3">
      {/* Reconciliation header */}
      <div className={`rounded-lg border p-3 ${
        reconciled
          ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'
          : 'border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10'
      }`}>
        <div className="flex items-start gap-2">
          {reconciled
            ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />}
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold ${reconciled ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-900 dark:text-amber-200'}`}>
              {reconciled
                ? 'Fully traced — every peso of this total is listed below'
                : `${formatCurrency(Math.abs(variance), currency)} of this total is not explained by any transaction`}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Transactions account for {formatCurrency(summary.ledger_total, currency)} of the stored{' '}
              {formatCurrency(summary.stored_used_amount, currency)} utilized figure.
            </p>
          </div>
        </div>
      </div>

      {/* Split summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-bg/60 p-2.5">
          <span className="text-[10px] font-medium text-muted">Expenses</span>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">
            {formatCurrency(summary.expense_total, currency)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg/60 p-2.5">
          <span className="text-[10px] font-medium text-muted">Payroll disbursements</span>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-ink">
            {formatCurrency(summary.payroll_total, currency)}
          </p>
        </div>
      </div>

      {/* Filter */}
      {rows.length > 0 && (
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all', label: `All (${rows.length})` },
            { key: 'expense', label: 'Expenses' },
            { key: 'payroll', label: 'Payroll' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-150 ${
                filter === f.key
                  ? 'bg-primary text-white'
                  : 'bg-bg text-muted hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Ledger rows */}
      {visible.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-bg/40 p-3 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            No transactions are linked to this budget. If the utilization bar
            above is not 0%, the figure came from somewhere other than expenses
            or payroll.
          </span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface text-[10px] font-semibold uppercase tracking-wider text-muted">
              <tr>
                <th className="px-2.5 py-2">Date</th>
                <th className="px-2.5 py-2">Reference</th>
                <th className="px-2.5 py-2">Description</th>
                <th className="px-2.5 py-2 text-right">Amount</th>
                <th className="px-2.5 py-2 text-right">Running</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-t border-border/60">
                  <td className="px-2.5 py-2 whitespace-nowrap text-muted tabular-nums">
                    {r.date ? formatDate(r.date) : '—'}
                  </td>
                  <td className="px-2.5 py-2">
                    <span className="inline-flex items-center gap-1">
                      {r.kind === 'payroll'
                        ? <Users size={11} className="shrink-0 text-muted" />
                        : <ArrowDownRight size={11} className="shrink-0 text-muted" />}
                      <span className="font-mono text-[11px] text-ink">
                        {r.reference || `#${r.id}`}
                      </span>
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-ink">
                    <span className="block truncate max-w-[220px]" title={r.description}>
                      {r.description}
                    </span>
                    {(r.counterparty || r.meta) && (
                      <span className="block truncate text-[10px] text-muted">
                        {[r.counterparty, r.meta].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-ink">
                    {formatCurrency(r.amount, currency)}
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-muted">
                    {formatCurrency(r.running_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* More rows are hidden: offer both an inline expand and the
          full-screen view, since the summary modal is too narrow for a long
          ledger. */}
      {hiddenCount > 0 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Show {hiddenCount} more in this view
          </button>
          {onExpand && (
            <>
              <span className="text-border">·</span>
              <button
                type="button"
                onClick={onExpand}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Maximize2 size={12} />
                Open full screen
              </button>
            </>
          )}
        </div>
      )}

      {onExpand && rows.length > 0 && hiddenCount === 0 && previewLimit > 0 && (
        <div className="flex items-center justify-center pt-1">
          <button
            type="button"
            onClick={onExpand}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Maximize2 size={12} />
            Open full screen
          </button>
        </div>
      )}
    </div>
  )
}
