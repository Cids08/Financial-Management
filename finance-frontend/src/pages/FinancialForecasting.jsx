import KpiValue from '../components/KpiValue'
import { TableSkeleton, ContentSkeleton } from '../components/LoadingSkeleton'
import ResponsiveTable from '../components/ResponsiveTable'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Plus, TrendingUp, Target, Percent, Info, Activity, CalendarRange, Archive, ArchiveRestore, AlertTriangle, RotateCcw, X,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
} from 'recharts'
import { DATE_PRESETS, applyDatePresetChange } from '../utils/datePresets'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import Pagination from '../components/Pagination'
import { formatCurrency } from '../utils/formatters'
import { usePrivacy } from '../context/PrivacyContext'
import { useForecasts } from '../hooks/useForecasts'
import { useDataUpdates } from '../hooks/useDataUpdates'
import { useProfile } from '../hooks/useProfile'
import DeletePermanentButton from '../components/DeletePermanentButton'
import RetentionCountdown from '../components/RetentionCountdown'
import { useCompany } from '../context/CompanyContext'

// Exactly 5 categories per spec: Expense, Accounts Receivable,
// Collection, Cash Flow, and Budget Utilization forecasts. 'Revenue'
// removed (not part of the required 5). No standalone 'Invoices'
// category  -  invoices remain transactional data feeding AR
// (Invoice -> AR -> Collection -> Cash Flow). See
// FinancialForecastService::FORECAST_TYPES on the backend for the
// matching list; these two arrays must stay in sync or the dropdown
// will offer a type the API rejects (or omit one it accepts).
const FORECAST_TYPES = [
  'Cash Flow', 'Collections', 'Expenses', 'Accounts Receivable', 'Budget Utilization',
]

const TYPE_STYLES = {
  'Cash Flow': 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Collections: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Expenses: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  'Accounts Receivable': 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  'Budget Utilization': 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400',
}

const HIGH_CONFIDENCE_THRESHOLD = 80
const LOW_ERROR_THRESHOLD = 8

// MAPE severity bands follow the standard Lewis-style accuracy scale
// (lower is better): ≤10% is an excellent fit, 11–25% is acceptable, and
// anything above 25% should be treated seriously — the 25% mark is the
// "trust limit". Whenever the badge is red (Poor) the caution panel is
// shown too, so there's no silent red zone.
//
// MAPE can legitimately spike into the thousands of percent when
// historical actuals include near-zero months (division-by-small-number
// blowup), which is a real, observed case for this dataset, not a
// hypothetical edge case — in that range the forecast is effectively
// unusable and should never drive decisions.
const MAPE_EXCELLENT_THRESHOLD = 10
const MAPE_ACCEPTABLE_THRESHOLD = 25

const PANEL = 'rounded-2xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4 sm:p-5'
const CHART_TICK = { fontSize: 10, fill: 'var(--color-muted)' }
const CHART_TOOLTIP = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  color: 'var(--color-ink)',
  fontSize: 12,
  boxShadow: '0 8px 24px rgb(0 0 0 / 0.1)',
}

// `[color-scheme:light] dark:[color-scheme:dark]` is the part that
// actually fixes dark mode here: <select> popups and the <input
// type="date"> calendar widget are rendered by the browser itself, not
// by our CSS, so Tailwind's dark: classes on the element's box never
// reach them. Without an explicit color-scheme the browser always paints
// those natively as light (white dropdown list, dark calendar glyph),
// which is invisible/mismatched against a dark page. This keys off the
// same `.dark` class toggle already used everywhere else in the app.
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink caret-primary
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  [color-scheme:light] dark:[color-scheme:dark]
  transition-all duration-150`

const SEARCH_INPUT = `w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-surface !text-ink caret-primary
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`

// Native <option> elements ignore most CSS from their parent <select> in
// several browsers, but DO respect an explicit background/text color set
// directly on the <option> itself  -  this is what actually themes the
// dropdown list's rows in dark mode (color-scheme alone gets the popup
// chrome right, but not necessarily our custom surface color).
const OPTION = 'bg-surface text-ink'

const LABEL = 'block text-xs font-medium text-muted mb-1.5'

// Mirrors FinancialForecastService::HORIZON_LABELS on the backend for the
// fixed windows. The 'configured' key has no fixed months here — its
// window length comes from Settings (Forecast Horizon) and is resolved
// server-side by FinancialForecastService::horizonFor(), so the two stay
// in sync automatically when that setting changes.
const CONFIGURED_HORIZON_KEY = 'configured'

const FIXED_HORIZONS = [
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

// Mirrors confidenceColor()'s tiering, but for MAPE (lower is better, and
// the top end is unbounded rather than capped at 100 like confidence is).
function mapeSeverity(mape) {
  if (mape == null) return { label: '—', text: 'text-muted', badge: '' }
  if (mape <= MAPE_EXCELLENT_THRESHOLD) {
    return {
      label: 'Excellent',
      text: 'text-status-success font-semibold',
      badge: 'bg-status-success-bg text-status-success border border-status-success-border',
    }
  }
  if (mape <= MAPE_ACCEPTABLE_THRESHOLD) {
    return {
      label: 'Acceptable',
      text: 'text-status-warning font-semibold',
      badge: 'bg-status-warning-bg text-status-warning border border-status-warning-border',
    }
  }
  return {
    label: 'Poor',
    text: 'text-status-danger font-semibold',
    badge: 'bg-status-danger-bg text-status-danger border border-status-danger-border',
  }
}

function mapeColor(mape) {
  return mapeSeverity(mape).text
}

function MapeBadge({ mape }) {
  if (mape == null) return null
  const severity = mapeSeverity(mape)
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${severity.badge}`}>
      {severity.label}
    </span>
  )
}

function isMapeUnreliable(mape) {
  return mape != null && mape > MAPE_ACCEPTABLE_THRESHOLD
}

// Months with recorded (non-zero) activity in the training series, plus the
// number of projected periods. ARIMA needs >=6 active months to fit, and
// projecting further ahead than the history you have is inherently shaky —
// both are surfaced as a warning after generation.
function historyActivityWarnings(series) {
  const points = series || []
  const active = points.filter((pt) => pt.historical != null && Number(pt.historical) > 0).length
  const periods = points.filter((pt) => pt.historical === null && pt.predicted != null).length
  if (active < 6 || periods > Math.max(active, 2)) {
    return {
      active,
      periods,
      reason: `The training window contains only ${active} month${active === 1 ? '' : 's'} with recorded activity, but this forecast projects ${periods} month${periods === 1 ? '' : 's'} ahead. ARIMA needs at least 6 active months to fit reliably — treat the projection as directional rather than a hard number.`,
    }
  }
  return null
}

const StatCard = memo(function StatCard({ loading, label, value, icon: Icon, iconBg, iconColor, isActive, onClick }) {
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
        <p className="wrap-anywhere text-lg font-bold text-ink"><KpiValue loading={loading}>{value}</KpiValue></p>
      </div>
    </button>
  )
})

const ForecastRow = memo(function ForecastRow({ forecast: f, showArchived, isAdmin, onViewDetail, onArchive, onRestore, onPermanentDeleted }) {
  const unreliable = isMapeUnreliable(f.mape)
  return (
    <tr
      onClick={() => onViewDetail(f)}
      className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 cursor-pointer"
    >
      <td className="px-2.5 py-2.5 whitespace-nowrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[f.forecast_type] || 'bg-gray-100 text-muted'}`}>{f.forecast_type}</span><p className="mt-1 text-[10px] text-muted">{f.arima_model}</p>
      </td>
      <td className="px-2.5 py-2.5 text-ink font-medium">{f.forecast_period}<p className="mt-1 text-[10px] font-normal text-muted">History: {f.historical_period}</p></td>
      <td className="px-2.5 py-2.5 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(f.predicted_amount)}</td>
      <td className={`px-2.5 py-2.5 whitespace-nowrap text-right tabular-nums font-medium ${confidenceColor(f.confidence_level)}`}>{f.confidence_level}%</td>
      <td className={`px-2.5 py-2.5 whitespace-nowrap text-right tabular-nums ${mapeColor(f.mape)}`}>
        <span className="inline-flex items-center gap-1 justify-end">
          {unreliable && (
            <Tooltip label="High error margin  -  treat this forecast with caution" align="end">
              <AlertTriangle size={12} className="shrink-0" />
            </Tooltip>
          )}
          {f.mape != null ? `${f.mape}%` : '—'}
        </span>
      </td>
      <td className="px-2.5 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <Tooltip label="View forecast trend" align="end">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onViewDetail(f) }}
              aria-label={`View forecast trend for ${f.forecast_type}, ${f.forecast_period}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
            >
              <Info size={15} />
            </button>
          </Tooltip>
          {isAdmin && (showArchived ? (
            <>
            <Tooltip label="Restore forecast" align="end">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRestore(f) }}
                aria-label={`Restore forecast for ${f.forecast_type}, ${f.forecast_period}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors duration-150"
              >
                <ArchiveRestore size={15} />
              </button>
            </Tooltip>
            {showArchived && (
              <>
              <RetentionCountdown deletedAt={f.deleted_at} compact />
              <DeletePermanentButton
                endpoint={`/api/forecasts/${f.forecast_id}/permanent`}
                label="forecast"
                name={f.forecast_period || ''}
                onDeleted={onPermanentDeleted}
              />
              </>
            )}
            </>
          ) : (
            <Tooltip label="Archive forecast" align="end">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onArchive(f) }}
                aria-label={`Archive forecast for ${f.forecast_type}, ${f.forecast_period}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150"
              >
                <Archive size={15} />
              </button>
            </Tooltip>
          ))}
        </div>
      </td>
    </tr>
  )
})

/**
 * Backend note: POST /api/forecasts generates AND persists in one call  - 
 * there's no preview-then-save step server-side (unlike the old
 * client-only version). So here: "Run Auto-Forecast" already saves a real
 * record. "Regenerate" calls the API again, creating a genuinely NEW
 * forecast row (not a redo of a draft)  -  the previous attempt stays in
 * the list. There's no "Save Forecast" button anymore since there's
 * nothing left to save; "Done" just closes and the list already reflects
 * it (the hook refetches after a successful generate).
 */
const GenerateForecastModal = memo(function GenerateForecastModal({ open, onClose, generateForecast, generating }) {
  const [phase, setPhase] = useState('setup')
  const [forecastType, setForecastType] = useState(FORECAST_TYPES[0])
  const [horizonKey, setHorizonKey] = useState(CONFIGURED_HORIZON_KEY)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loadingStep, setLoadingStep] = useState(0)
  const timerRef = useRef(null)

  // The configured window is offered first (and is the default) so the
  // company's Forecast Horizon setting is what actually drives the run.
  const { forecastMonths } = useCompany()
  const horizons = useMemo(() => {
    const months = Number(forecastMonths) || 12
    return [
      { key: CONFIGURED_HORIZON_KEY, label: `Company Default (${months} months)` },
      ...FIXED_HORIZONS,
    ]
  }, [forecastMonths])

  useEffect(() => {
    if (open) {
      setPhase('setup')
      setForecastType(FORECAST_TYPES[0])
      setHorizonKey(CONFIGURED_HORIZON_KEY)
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
    // Cycles the same three steps while the request is in flight  -  this is
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
          <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{error}</div>
        )}

        {phase !== 'result' && (
          <>
            <p className="text-xs text-muted">
              Pick what to forecast and how far ahead. The model selects its own training window, fits an ARIMA model, and reports its own confidence and error margin  -  no numbers to type in.
            </p>
            <div>
              <label className={LABEL}>Forecast Type</label>
              <select value={forecastType} onChange={(e) => setForecastType(e.target.value)} disabled={phase === 'running'} className={INPUT}>
                {FORECAST_TYPES.map((t) => <option key={t} value={t} className={OPTION}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Forecast Horizon</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {horizons.map((h) => (
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
                <p className="text-sm font-semibold text-ink">{result.forecast_type}  -  {result.forecast_period}</p>
                <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><CalendarRange size={12} /> Trained on {result.historical_period}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[result.forecast_type] || 'bg-gray-100 text-muted'}`}>{result.arima_model}</span>
            </div>

            {historyActivityWarnings(result.series) && (
              <div className="rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2 text-xs text-status-warning flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{historyActivityWarnings(result.series).reason}</span>
              </div>
            )}

            <div className="h-52 w-full rounded-lg border border-border bg-bg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={CHART_TICK} />
                  <YAxis tick={CHART_TICK} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                  <RechartsTooltip contentStyle={CHART_TOOLTIP} formatter={(value) => formatCurrency(value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="historical" name="Historical" stroke="var(--color-ink)" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#f4b400" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
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
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <p className={`text-sm font-semibold ${mapeColor(result.mape)}`}>{result.mape != null ? `${result.mape}%` : '—'}</p>
                  <MapeBadge mape={result.mape} />
                </div>
              </div>
            </div>

            {isMapeUnreliable(result.mape) && (
              <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  This forecast's error margin is unusually high, likely due to a sharp jump or near-zero
                  months in the historical data it trained on. Treat this prediction with caution rather
                  than as a reliable projection.
                </span>
              </div>
            )}

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
    <Modal open={!!forecastId} onClose={onClose} title="Forecast Trend" size="xl" footer={<Button variant="secondary" size="md" onClick={onClose}>Close</Button>}>
      {loading && <ContentSkeleton />}
      {error && (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{error}</div>
      )}
      {!loading && forecast && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{forecast.forecast_type}  -  {forecast.forecast_period}</p>
              <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><CalendarRange size={12} /> Trained on {forecast.historical_period}</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[forecast.forecast_type] || 'bg-gray-100 text-muted'}`}>{forecast.arima_model}</span>
          </div>

          <div className="h-56 w-full rounded-lg border border-border bg-bg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast.series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="label" tick={CHART_TICK} />
                <YAxis tick={CHART_TICK} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                <RechartsTooltip contentStyle={CHART_TOOLTIP} formatter={(value) => formatCurrency(value)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="historical" name="Historical" stroke="var(--color-ink)" strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#f4b400" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <p className={`text-sm font-semibold whitespace-nowrap ${mapeColor(forecast.mape)}`}>{forecast.mape != null ? `${forecast.mape}%` : '—'}</p>
                <MapeBadge mape={forecast.mape} />
              </div>
            </div>
          </div>

          {isMapeUnreliable(forecast.mape) && (
            <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                This forecast's error margin is unusually high, likely due to a sharp jump or near-zero
                months in the historical data it trained on. Treat this prediction with caution rather
                than as a reliable projection.
              </span>
            </div>
          )}

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
    showArchived,
    setShowArchived,
    generating,
    generateForecast,
    fetchForecastDetail,
    archiving,
    archiveForecast,
    restoreForecast,
    refetch,
  } = useForecasts()

  // Live updates: forecasts refresh when new data (expenses, disbursements,
  // AR) arrives, so projections stay current without a manual reload.
  useDataUpdates(['forecasts', 'ai-recommendations', 'expenses', 'disbursements', 'accounts-receivable'], () => refetch())

  const { privacyOn } = usePrivacy()

  const { profile } = useProfile()
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin'

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Date-range presets, shared across modules via utils/datePresets.js.
  const [datePreset, setDatePreset] = useState('all')

  const applyDatePreset = (key) => {
    const next = applyDatePresetChange(key)
    setDatePreset(next.datePreset)
    setDateFrom(next.dateFrom)
    setDateTo(next.dateTo)
  }

  const PER_PAGE = 10
  const [page, setPage] = useState(1)

  const [activeStat, setActiveStat] = useState('all')
  const quickFilter = activeStat === 'confidence' ? 'highConfidence' : activeStat === 'mape' ? 'lowError' : 'all'
  const sortBy = activeStat === 'predicted' ? 'predicted' : 'recent'

  const toggleStat = (key) => setActiveStat((prev) => (prev === key ? 'all' : key))

  const [modalOpen, setModalOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [archiveTarget, setArchiveTarget] = useState(null)

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

  // Reset to page 1 whenever search/type/date/archived filters change.
  useEffect(() => { setPage(1) }, [search, typeFilter, dateFrom, dateTo, showArchived])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const rangeStart = (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, filtered.length)

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
  }, [forecasts, activeStat, privacyOn])

  const openGenerate = useCallback(() => setModalOpen(true), [])
  const closeGenerateModal = useCallback(() => setModalOpen(false), [])
  const closeDetail = useCallback(() => setDetailId(null), [])
  const handleViewDetail = useCallback((f) => setDetailId(f.forecast_id), [])

  const closeArchiveConfirm = useCallback(() => setArchiveTarget(null), [])
  const confirmArchive = useCallback(async () => {
    if (!archiveTarget) return
    const outcome = await archiveForecast(archiveTarget.forecast_id)
    if (outcome.success) setArchiveTarget(null)
  }, [archiveTarget, archiveForecast])
  const handleRestore = useCallback((f) => { restoreForecast(f.forecast_id) }, [restoreForecast])

  return (
    <div className="space-y-6 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-dark">Plan with perspective</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            ARIMA-based projections trained on posted Collections, Disbursements, and Expenses. Lower MAPE means the model tracked historical actuals more closely. MAPE bands: ≤10% excellent · 11–25% acceptable · above 25% treat with caution.
          </p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openGenerate}>Generate Forecast</Button>
      </div>

      {forecastsError && (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">
          {forecastsError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ key, ...card }) => <StatCard key={key} {...card} loading={forecastsLoading} />)}
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

      <div className={`${PANEL} ${PANEL_PAD}`}>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Search</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by period, type, or model..."
                className={`${INPUT} pl-9 pr-9`}
                style={{ minWidth: 0 }}
                autoComplete="off"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-border hover:text-ink transition-colors duration-150">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          {/* Forecast Type */}
          <div className="w-full sm:w-52 shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Forecast Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={INPUT}>
              <option value="all" className={OPTION}>All Forecast Types</option>
              {FORECAST_TYPES.map((t) => <option key={t} value={t} className={OPTION}>{t}</option>)}
            </select>
          </div>
          {/* Period Preset */}
          <div className="w-full sm:w-40 shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Period</label>
            <select
              value={datePreset}
              onChange={(e) => applyDatePreset(e.target.value)}
              className={`${INPUT} scheme-light dark:scheme-dark ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5' : ''}`}
            >
              {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          {/* Date From */}
          <div className="shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Generated From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value) }}
              className={`${INPUT} scheme-light dark:scheme-dark ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5' : ''}`}
              style={{ width: '9.5rem' }}
            />
          </div>
          {/* Date To */}
          <div className="shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value) }}
              className={`${INPUT} scheme-light dark:scheme-dark ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5' : ''}`}
              style={{ width: '9.5rem' }}
            />
          </div>
          {/* Reset */}
          {(search || typeFilter !== 'all' || dateFrom || dateTo) && (
            <div className="shrink-0">
              <Button variant="secondary" size="sm" icon={RotateCcw} iconPosition="left" onClick={() => { setSearch(''); setTypeFilter('all'); applyDatePreset('all') }}>Reset</Button>
            </div>
          )}
          {/* Show Archived toggle */}
          <div className="shrink-0 sm:ml-auto">
            <Button
              variant={showArchived ? 'primary' : 'secondary'}
              size="sm"
              icon={showArchived ? ArchiveRestore : Archive}
              onClick={() => setShowArchived((prev) => !prev)}
            >
              {showArchived ? 'Showing Archived' : 'Show Archived'}
            </Button>
          </div>
        </div>
      </div>

      <div className={PANEL}>
        <div className="overflow-hidden rounded-t-xl">
          <ResponsiveTable minTableWidth={640} className="w-full text-xs table-fixed">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-2.5 py-2.5 whitespace-nowrap">Type</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-2.5 py-2.5 whitespace-nowrap">Forecast Period</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-2.5 py-2.5 whitespace-nowrap">Predicted Amount</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-2.5 py-2.5 whitespace-nowrap">Confidence</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-2.5 py-2.5 whitespace-nowrap">MAPE</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-2.5 py-2.5 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {forecastsLoading && (
                <TableSkeleton columns={6} />
              )}
              {!forecastsLoading && filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((f) => (
                <ForecastRow
                  key={f.forecast_id}
                  forecast={f}
                  showArchived={showArchived}
                  isAdmin={isAdmin}
                  privacyOn={privacyOn}
                  onViewDetail={handleViewDetail}
                  onArchive={setArchiveTarget}
                  onRestore={handleRestore}
                  onPermanentDeleted={refetch}
                />
              ))}
              {!forecastsLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                    {showArchived ? 'No archived forecasts.' : 'No forecasts match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </ResponsiveTable>
        </div>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={filtered.length}
        label="forecasts"
        showRange
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        bordered
      />

      <GenerateForecastModal
        open={modalOpen}
        onClose={closeGenerateModal}
        generateForecast={generateForecast}
        generating={generating}
        privacyOn={privacyOn}
      />
      <ForecastDetailModal forecastId={detailId} onClose={closeDetail} fetchForecastDetail={fetchForecastDetail} privacyOn={privacyOn} />

      <Modal
        open={!!archiveTarget}
        onClose={closeArchiveConfirm}
        title="Archive Forecast?"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeArchiveConfirm}>Cancel</Button>
            <Button variant="primary" size="md" onClick={confirmArchive} loading={archiving}>Archive</Button>
          </>
        }
      >
        {archiveTarget && (
          <p className="text-sm text-ink">
            This will archive the <span className="font-semibold">{archiveTarget.forecast_type}</span> forecast
            for <span className="font-semibold">{archiveTarget.forecast_period}</span>. It's removed from the
            active list but not deleted. You can restore it later from "Show Archived".
          </p>
        )}
      </Modal>
    </div>
  )
}
