/**
 * CollectionEfficiencyPanel
 *
 * Shows aggregate team efficiency — total collected vs combined target
 * across all collectors — bucketed by day/week/month/year.
 *
 * Per-collector breakdown lives on the Collector page. This panel
 * answers the fleet-level question: is the whole team hitting target?
 *
 * Endpoint: GET /api/collections/efficiency?period=X&limit=12
 * Response shape per bucket: { period, collected, target, efficiency }
 * — same shape as before, collector selector removed.
 */

import { useEffect, useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { formatCurrency } from '../utils/formatters'
import { apiFetch } from '../utils/api'

const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`

const PANEL     = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

const EFFICIENCY_PERIODS = [
  { key: 'day',   label: 'Daily'   },
  { key: 'week',  label: 'Weekly'  },
  { key: 'month', label: 'Monthly' },
  { key: 'year',  label: 'Yearly'  },
]

export default function CollectionEfficiencyPanel() {
  const [period, setPeriod]   = useState('month')
  const [buckets, setBuckets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    apiFetch(`/api/collections/efficiency?period=${period}&limit=12`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (!json.success) throw new Error(json.message || 'Failed to load efficiency data.')
        // Backend returns most-recent-first; reverse for chronological chart.
        setBuckets([...json.data].reverse())
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [period])

  const avgEfficiency = useMemo(() => {
    if (buckets.length === 0) return null
    return Math.round(
      (buckets.reduce((sum, b) => sum + b.efficiency, 0) / buckets.length) * 10
    ) / 10
  }, [buckets])

  return (
    <div className={`${PANEL} ${PANEL_PAD} space-y-3`}>
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
            <TrendingUp size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Team Collection Efficiency</p>
            <p className="text-xs text-muted">
              Total collected vs combined target
              {avgEfficiency !== null && (
                <> · avg <span className="font-medium text-ink">{avgEfficiency}%</span></>
              )}
            </p>
          </div>
        </div>

        {/* Period buttons — no collector selector needed */}
        <div className="flex gap-1">
          {EFFICIENCY_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150
                ${period === p.key
                  ? 'border-primary bg-primary/10 text-primary-dark'
                  : 'border-border text-muted hover:border-primary/40'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600
          dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading efficiency data…</p>
      ) : buckets.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No confirmed collections for this period yet.</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {/*
              ComposedChart lets us overlay the target as a Line on top of
              the collected Bar — cleaner than a grouped bar for a
              collected-vs-target comparison.
            */}
            <ComposedChart data={buckets} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="period" tick={{ fontSize: 10 }} />
              <YAxis
                yAxisId="currency"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                width={48}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                width={40}
                domain={[0, 'dataMax + 10']}
              />
              <RechartsTooltip
                formatter={(value, name) => {
                  if (name === 'Efficiency')  return [`${value}%`, name]
                  if (name === 'Collected')   return [formatCurrency(value), name]
                  if (name === 'Target')      return [formatCurrency(value), name]
                  return [value, name]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="currency"
                dataKey="collected"
                name="Collected"
                fill="#2563eb"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
              <Line
                yAxisId="currency"
                dataKey="target"
                name="Target"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 3"
              />
              <Line
                yAxisId="pct"
                dataKey="efficiency"
                name="Efficiency"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}