import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Plus, TrendingUp, Target, Percent, Info, Activity, CalendarRange,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
} from 'recharts'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useForecasts } from '../hooks/useForecasts'

const FORECAST_TYPES = ['Cash Flow', 'Revenue', 'Collections', 'Expenses', 'Accounts Receivable']

const TYPE_STYLES = {
  'Cash Flow': 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Revenue: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Collections: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Expenses: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  'Accounts Receivable': 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
}

const HIGH_CONFIDENCE_THRESHOLD = 80
const LOW_ERROR_THRESHOLD = 8

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }

const SEARCH_INPUT = `w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`

const LABEL = 'block text-xs font-medium text-muted mb-1.5'

// Matches FinancialForecastService::HORIZON_LABELS on the backend — the
// integer `months` per key must line up exactly, since the server derives
// forecast_period from it.
const HORIZONS = [
  { key: 'next_month', label: 'Next Month' },
  { key: 'next_quarter', label: 'Next Quarter' },
  { key: 'next_fiscal_year', label: 'Next Fiscal Year' },
]

const LOADING_STEPS = ['Pulling historical actuals...', 'Fitting ARIMA model...', 'Computing confidence & error margin...']

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function confidenceColor(pct) {
  if (pct >= 85) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

const StatCard = memo(function StatCard({ label, value, icon: Icon, iconBg, iconColor, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left cursor-pointer
        transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
        ${isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-bold text-ink">{value}</p>
      </div>
    </button>
  )
})

const ForecastRow = memo(function ForecastRow({ forecast: f, onViewDetail }) {
  return (
    <tr
      onClick={() => onViewDetail(f)}
      className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
    >
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[f.forecast_type] || 'bg-gray-100 text-muted'}`}>{f.forecast_type}</span>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-ink font-medium">{f.forecast_period}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-muted">{f.historical_period}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(f.predicted_amount)}</td>
      <td className={`px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-medium ${confidenceColor(f.confidence_level)}`}>{f.confidence_level}%</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-muted">{f.mape != null ? `${f.mape}%` : '—'}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-muted">{f.arima_model}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-right">
        <Tooltip label="View forecast trend" align="end">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewDetail(f) }}
            aria-label={`View forecast trend for ${f.forecast_type}, ${f.forecast_period}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 ml-auto"
          >
            <Info size={15} />
          </button>
        </Tooltip>
      </td>
    </tr>
  )
})

/**
 * Backend note: POST /api/forecasts generates AND persists in one call —
 * there's no preview-then-save step server-side (unlike the old
 * client-only version). So here: "Run Auto-Forecast" already saves a real
 * record. "Regenerate" calls the API again, creating a genuinely NEW
 * forecast row (not a redo of a draft) — the previous attempt stays in
 * the list. There's no "Save Forecast" button anymore since there's
 * nothing left to save; "Done" just closes and the list already reflects
 * it (the hook refetches after a successful generate).
 */
const GenerateForecastModal = memo(function GenerateForecastModal({ open, onClose, generateForecast, generating }) {
  const [phase, setPhase] = useState('setup')
  const [forecastType, setForecastType] = useState(FORECAST_TYPES[0])
  const [horizonKey, setHorizonKey] = useState(HORIZONS[0].key)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loadingStep, setLoadingStep] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (open) {
      setPhase('setup')
      setForecastType(FORECAST_TYPES[0])
      setHorizonKey(HORIZONS[0].key)
      setResult(null)
      setError('')
      setLoadingStep(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [open])

  const runEngine = useCallback(async () => {
    setPhase('running')
    setError('')
    setLoadingStep(0)
    // Cycles the same three steps while the request is in flight — this is
    // cosmetic pacing, not tied to real backend progress (the mock engine
    // responds near-instantly; keeping this makes room for when the real
    // ARIMA service is slower and genuinely takes a few seconds).
    timerRef.current = setInterval(() => {
      setLoadingStep((s) => (s + 1) % LOADING_STEPS.length)
    }, 550)

    const outcome = await generateForecast(forecastType, horizonKey)

    clearInterval(timerRef.current)
    if (outcome.success) {
      setResult(outcome.forecast)
      setPhase('result')
    } else {
      setError(outcome.message || 'Failed to generate forecast.')
      setPhase('setup')
    }
  }, [forecastType, horizonKey, generateForecast])

  const handleEditInputs = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setResult(null)
    setPhase('setup')
  }, [])

  const footer = phase === 'result' ? (
    <>
      <Button variant="secondary" size="md" onClick={handleEditInputs}>Edit Inputs</Button>
      <Button variant="secondary" size="md" onClick={runEngine} loading={generating}>Regenerate</Button>
      <Button variant="primary" size="md" onClick={onClose}>Done</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
      <Button variant="primary" size="md" onClick={runEngine} disabled={phase === 'running'} loading={phase === 'running'}>
        {phase === 'running' ? 'Running…' : 'Run Auto-Forecast'}
      </Button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title="Generate New Forecast" footer={footer}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
        )}

        {phase !== 'result' && (
          <>
            <p className="text-xs text-muted">
              Pick what to forecast and how far ahead. The model selects its own training window, fits an ARIMA model, and reports its own confidence and error margin — no numbers to type in.
            </p>
            <div>
              <label className={LABEL}>Forecast Type</label>
              <select value={forecastType} onChange={(e) => setForecastType(e.target.value)} disabled={phase === 'running'} className={INPUT} style={INPUT_TEXT_STYLE}>
                {FORECAST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Forecast Horizon</label>
              <div className="grid grid-cols-3 gap-2">
                {HORIZONS.map((h) => (
                  <button
                    key={h.key}
                    type="button"
                    disabled={phase === 'running'}
                    onClick={() => setHorizonKey(h.key)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors duration-150
                      ${horizonKey === h.key ? 'border-primary bg-primary/10 text-primary-dark' : 'border-border text-muted hover:border-primary/40'}`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            {phase === 'running' && (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-ink">
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                  </span>
                  {LOADING_STEPS[loadingStep]}
                </p>
              </div>
            )}
          </>
        )}

        {phase === 'result' && result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{result.forecast_type} — {result.forecast_period}</p>
                <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><CalendarRange size={12} /> Trained on {result.historical_period}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[result.forecast_type] || 'bg-gray-100 text-muted'}`}>{result.arima_model}</span>
            </div>

            <div className="h-52 w-full rounded-lg border border-border bg-bg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                  <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="historical" name="Historical" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#d97706" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted">Predicted Amount</p>
                <p className="text-sm font-semibold text-ink mt-0.5">{formatCurrency(result.predicted_amount)}</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted">Confidence</p>
                <p className={`text-sm font-semibold mt-0.5 ${confidenceColor(result.confidence_level)}`}>{result.confidence_level}%</p>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-muted">MAPE</p>
                <p className="text-sm font-semibold text-ink mt-0.5">{result.mape != null ? `${result.mape}%` : '—'}</p>
              </div>
            </div>

            <p className="text-xs text-muted">This forecast has been saved. Regenerate runs a fresh forecast (saved separately), or Edit Inputs to change the type/horizon.</p>
          </div>
        )}
      </div>
    </Modal>
  )
})

/**
 * Receives just the forecast_id from the row click and fetches the full
 * detail (including `series`, which the list endpoint omits) on open.
 */
const ForecastDetailModal = memo(function ForecastDetailModal({ forecastId, onClose, fetchForecastDetail }) {
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!forecastId) {
      setForecast(null)
      return
    }
    setLoading(true)
    setError('')
    fetchForecastDetail(forecastId).then((result) => {
      if (result.success) setForecast(result.forecast)
      else setError(result.message)
      setLoading(false)
    })
  }, [forecastId, fetchForecastDetail])

  return (
    <Modal open={!!forecastId} onClose={onClose} title="Forecast Trend" footer={<Button variant="secondary" size="md" onClick={onClose}>Close</Button>}>
      {loading && <p className="text-sm text-muted py-6 text-center">Loading forecast…</p>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}
      {!loading && forecast && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">{forecast.forecast_type} — {forecast.forecast_period}</p>
              <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><CalendarRange size={12} /> Trained on {forecast.historical_period}</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[forecast.forecast_type] || 'bg-gray-100 text-muted'}`}>{forecast.arima_model}</span>
          </div>

          <div className="h-56 w-full rounded-lg border border-border bg-bg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast.series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="historical" name="Historical" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#d97706" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted">Predicted Amount</p>
              <p className="text-sm font-semibold text-ink mt-0.5">{formatCurrency(forecast.predicted_amount)}</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted">Confidence</p>
              <p className={`text-sm font-semibold mt-0.5 ${confidenceColor(forecast.confidence_level)}`}>{forecast.confidence_level}%</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-muted">MAPE</p>
              <p className="text-sm font-semibold text-ink mt-0.5">{forecast.mape != null ? `${forecast.mape}%` : '—'}</p>
            </div>
          </div>

          <p className="text-xs text-muted">Generated by {forecast.generated_by_name || `User #${forecast.generated_by}`} on {formatDateTime(forecast.generated_at)}</p>
        </div>
      )}
    </Modal>
  )
})

export default function FinancialForecasting({ title = 'Financial Forecasting', crumbs = ['Analytics', 'Financial Forecasting'] }) {
  const {
    forecasts,
    forecastsLoading,
    forecastsError,
    generating,
    generateForecast,
    fetchForecastDetail,
  } = useForecasts()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [activeStat, setActiveStat] = useState('all')
  const quickFilter = activeStat === 'confidence' ? 'highConfidence' : activeStat === 'mape' ? 'lowError' : 'all'
  const sortBy = activeStat === 'predicted' ? 'predicted' : 'recent'

  const toggleStat = (key) => setActiveStat((prev) => (prev === key ? 'all' : key))

  const [modalOpen, setModalOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const filtered = useMemo(() => {
    const rows = forecasts.filter((f) => {
      if (typeFilter !== 'all' && f.forecast_type !== typeFilter) return false
      if (quickFilter === 'highConfidence' && f.confidence_level < HIGH_CONFIDENCE_THRESHOLD) return false
      if (quickFilter === 'lowError' && (f.mape ?? Infinity) > LOW_ERROR_THRESHOLD) return false
      const day = (f.generated_at || '').slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      const q = search.toLowerCase()
      if (search && !f.forecast_period.toLowerCase().includes(q) && !f.forecast_type.toLowerCase().includes(q) && !(f.arima_model || '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })
    return sortBy === 'predicted'
      ? [...rows].sort((a, b) => b.predicted_amount - a.predicted_amount)
      : [...rows].sort((a, b) => (b.generated_at || '').localeCompare(a.generated_at || ''))
  }, [forecasts, search, typeFilter, dateFrom, dateTo, quickFilter, sortBy])

  const statCards = useMemo(() => {
    const count = forecasts.length || 1
    const avgConfidence = forecasts.reduce((s, f) => s + f.confidence_level, 0) / count
    const avgMape = forecasts.reduce((s, f) => s + (f.mape ?? 0), 0) / count
    const totalPredicted = forecasts.reduce((s, f) => s + f.predicted_amount, 0)
    return [
      {
        key: 'count', label: 'Active Forecasts', value: forecasts.length, icon: Activity,
        iconBg: 'bg-primary/15', iconColor: 'text-primary-dark',
        isActive: activeStat === 'all',
        onClick: () => setActiveStat('all'),
      },
      {
        key: 'predicted', label: 'Total Predicted Value', value: formatCurrency(totalPredicted), icon: TrendingUp,
        iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400',
        isActive: activeStat === 'predicted',
        onClick: () => toggleStat('predicted'),
      },
      {
        key: 'confidence', label: 'Avg. Confidence Level', value: `${avgConfidence.toFixed(1)}%`, icon: Target,
        iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400',
        isActive: activeStat === 'confidence',
        onClick: () => toggleStat('confidence'),
      },
      {
        key: 'mape', label: 'Avg. MAPE', value: `${avgMape.toFixed(1)}%`, icon: Percent,
        iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400',
        isActive: activeStat === 'mape',
        onClick: () => toggleStat('mape'),
      },
    ]
  }, [forecasts, activeStat])

  const openGenerate = useCallback(() => setModalOpen(true), [])
  const closeGenerateModal = useCallback(() => setModalOpen(false), [])
  const closeDetail = useCallback(() => setDetailId(null), [])
  const handleViewDetail = useCallback((f) => setDetailId(f.forecast_id), [])

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">
            ARIMA-based projections trained on posted Collections, Disbursements, and Expenses. Lower MAPE means the model tracked historical actuals more closely.
          </p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openGenerate}>Generate Forecast</Button>
      </div>

      {forecastsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {forecastsError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ key, ...card }) => <StatCard key={key} {...card} />)}
      </div>

      {activeStat !== 'all' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Showing:</span>
          {quickFilter === 'highConfidence' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              Confidence ≥ {HIGH_CONFIDENCE_THRESHOLD}%
            </span>
          )}
          {quickFilter === 'lowError' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              MAPE ≤ {LOW_ERROR_THRESHOLD}%
            </span>
          )}
          {sortBy === 'predicted' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
              Sorted by predicted amount
            </span>
          )}
        </div>
      )}

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1 min-w-0 basis-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by period, type, or model..."
              className={SEARCH_INPUT}
              style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0 }}
              autoComplete="off"
            />
          </div>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE}>
            <option value="all">All Forecast Types</option>
            {FORECAST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted whitespace-nowrap">Generated From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted whitespace-nowrap">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE} />
          </div>
        </div>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Type</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Forecast Period</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Historical Period</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Predicted Amount</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Confidence</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">MAPE</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Model</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Details</th>
              </tr>
            </thead>
            <tbody>
              {forecastsLoading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">Loading forecasts…</td></tr>
              )}
              {!forecastsLoading && filtered.map((f) => (
                <ForecastRow key={f.forecast_id} forecast={f} onViewDetail={handleViewDetail} />
              ))}
              {!forecastsLoading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">No forecasts match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <GenerateForecastModal
        open={modalOpen}
        onClose={closeGenerateModal}
        generateForecast={generateForecast}
        generating={generating}
      />
      <ForecastDetailModal forecastId={detailId} onClose={closeDetail} fetchForecastDetail={fetchForecastDetail} />
    </div>
  )
}