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

// Mirrors the `financial_forecasts` table in the schema:
// forecast_id, forecast_type, forecast_period, historical_period, predicted_amount,
// confidence_level, arima_model, mape, generated_by, generated_at
const FORECAST_TYPES = ['Cash Flow', 'Revenue', 'Collections', 'Expenses', 'Accounts Receivable']

const TYPE_STYLES = {
  'Cash Flow': 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Revenue: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Collections: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Expenses: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  'Accounts Receivable': 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
}

const GENERATORS = { 101: 'Maria Santos', 102: 'Ramon Torres', 103: 'System (Scheduled)' }

const HIGH_CONFIDENCE_THRESHOLD = 80
const LOW_ERROR_THRESHOLD = 8

function buildSeries(base, months, growth, volatility, predictedMonths, predictedAmount) {
  const series = []
  let value = base
  for (let i = 0; i < months; i++) {
    value = value * (1 + growth) + (Math.sin(i * 1.3) * volatility)
    series.push({ label: `H${i + 1}`, historical: Math.round(value), predicted: null })
  }
  const lastHistorical = series[series.length - 1].historical
  series[series.length - 1].predicted = lastHistorical
  const step = (predictedAmount - lastHistorical) / predictedMonths
  for (let i = 1; i <= predictedMonths; i++) {
    series.push({ label: `P${i}`, historical: null, predicted: Math.round(lastHistorical + step * i) })
  }
  return series
}

const initialForecasts = [
  {
    forecast_id: 1, forecast_type: 'Cash Flow', forecast_period: 'Q4 2026', historical_period: 'Jan 2025 – Jun 2026',
    predicted_amount: 1850000, confidence_level: 87, arima_model: 'ARIMA(2,1,2)', mape: 6.4,
    generated_by: 101, generated_at: '2026-07-21T08:15:00',
    series: buildSeries(1420000, 8, 0.018, 12000, 3, 1850000),
  },
  {
    forecast_id: 2, forecast_type: 'Revenue', forecast_period: 'Q4 2026', historical_period: 'Jan 2025 – Jun 2026',
    predicted_amount: 2360000, confidence_level: 91, arima_model: 'ARIMA(1,1,1)', mape: 4.9,
    generated_by: 101, generated_at: '2026-07-21T08:20:00',
    series: buildSeries(1980000, 8, 0.021, 15000, 3, 2360000),
  },
  {
    forecast_id: 3, forecast_type: 'Collections', forecast_period: 'August 2026', historical_period: 'Feb 2026 – Jul 2026',
    predicted_amount: 495000, confidence_level: 78, arima_model: 'ARIMA(1,0,1)', mape: 9.2,
    generated_by: 102, generated_at: '2026-07-25T13:05:00',
    series: buildSeries(410000, 6, 0.012, 9000, 1, 495000),
  },
  {
    forecast_id: 4, forecast_type: 'Expenses', forecast_period: 'August 2026', historical_period: 'Feb 2026 – Jul 2026',
    predicted_amount: 612000, confidence_level: 82, arima_model: 'ARIMA(1,1,0)', mape: 7.8,
    generated_by: 103, generated_at: '2026-07-25T13:10:00',
    series: buildSeries(560000, 6, 0.014, 8000, 1, 612000),
  },
  {
    forecast_id: 5, forecast_type: 'Accounts Receivable', forecast_period: 'Q4 2026', historical_period: 'Jan 2025 – Jun 2026',
    predicted_amount: 980000, confidence_level: 73, arima_model: 'ARIMA(2,1,0)', mape: 11.3,
    generated_by: 102, generated_at: '2026-07-28T09:40:00',
    series: buildSeries(860000, 8, 0.009, 14000, 3, 980000),
  },
  {
    forecast_id: 6, forecast_type: 'Cash Flow', forecast_period: 'FY 2027', historical_period: 'Jan 2024 – Jun 2026',
    predicted_amount: 8400000, confidence_level: 69, arima_model: 'ARIMA(3,1,2)', mape: 13.5,
    generated_by: 103, generated_at: '2026-07-29T17:00:00',
    series: buildSeries(6200000, 10, 0.02, 60000, 4, 8400000),
  },
]

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

// bg-surface + !text-ink (Tailwind important) instead of bg-bg/text-ink, so this
// can't lose a specificity fight against a parent panel's own background/text
// tinting. INPUT_TEXT_STYLE + outline:'none' are the belt-and-suspenders layer.
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }

// Search field — same rounded-lg box/height as the filter dropdowns (not a pill),
// just with left padding for the icon.
const SEARCH_INPUT = `w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`

const LABEL = 'block text-xs font-medium text-muted mb-1.5'

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function confidenceColor(pct) {
  if (pct >= 85) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

const AUTO_ENGINE_PARAMS = {
  'Cash Flow': { base: 1650000, growth: 0.019, volatility: 14000 },
  Revenue: { base: 2150000, growth: 0.021, volatility: 15000 },
  Collections: { base: 460000, growth: 0.013, volatility: 9000 },
  Expenses: { base: 590000, growth: 0.014, volatility: 8000 },
  'Accounts Receivable': { base: 900000, growth: 0.010, volatility: 13000 },
}

function nextMonthLabel(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
function nextQuarterLabel(today = new Date()) {
  const currentQ = Math.floor(today.getMonth() / 3) + 1
  let nextQ = currentQ + 1
  let year = today.getFullYear()
  if (nextQ > 4) { nextQ = 1; year += 1 }
  return `Q${nextQ} ${year}`
}
function nextFiscalYearLabel(today = new Date()) {
  return `FY ${today.getFullYear() + 1}`
}
function historicalRangeLabel(monthsBack, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth() - monthsBack + 1, 1)
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(today)}`
}

const HORIZONS = [
  { key: 'next_month', label: 'Next Month', months: 1, lookbackMonths: 6, predictedPoints: 1, periodLabel: nextMonthLabel },
  { key: 'next_quarter', label: 'Next Quarter', months: 3, lookbackMonths: 8, predictedPoints: 3, periodLabel: nextQuarterLabel },
  { key: 'next_fiscal_year', label: 'Next Fiscal Year', months: 12, lookbackMonths: 24, predictedPoints: 4, periodLabel: nextFiscalYearLabel },
]

const LOADING_STEPS = ['Pulling historical actuals...', 'Fitting ARIMA model...', 'Computing confidence & error margin...']

function pickArimaOrder() {
  const p = Math.floor(Math.random() * 3)
  const d = Math.floor(Math.random() * 2) + 1
  const q = Math.floor(Math.random() * 3)
  return `ARIMA(${p},${d},${q})`
}

function runAutoForecast(type, horizonKey) {
  const params = AUTO_ENGINE_PARAMS[type]
  const horizon = HORIZONS.find((h) => h.key === horizonKey)
  const noise = 1 + (Math.random() - 0.5) * 0.12
  const growthFactor = Math.pow(1 + params.growth, horizon.lookbackMonths)
  const predicted_amount = Math.round(params.base * growthFactor * noise)
  const horizonPenalty = horizon.months <= 1 ? 0 : horizon.months <= 3 ? 6 : 16
  const confidence_level = Math.max(60, Math.min(97, Math.round(92 - horizonPenalty - Math.random() * 6)))
  const mape = Math.max(2, Math.round((3 + horizonPenalty * 0.6 + Math.random() * 3) * 10) / 10)
  return {
    forecast_type: type,
    forecast_period: horizon.periodLabel(),
    historical_period: historicalRangeLabel(horizon.lookbackMonths),
    predicted_amount,
    confidence_level,
    mape,
    arima_model: pickArimaOrder(),
    series: buildSeries(params.base, Math.min(horizon.lookbackMonths, 10), params.growth, params.volatility, horizon.predictedPoints, predicted_amount),
  }
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
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[f.forecast_type]}`}>{f.forecast_type}</span>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-ink font-medium">{f.forecast_period}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-muted">{f.historical_period}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-ink">{formatCurrency(f.predicted_amount)}</td>
      <td className={`px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-medium ${confidenceColor(f.confidence_level)}`}>{f.confidence_level}%</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-muted">{f.mape}%</td>
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

const GenerateForecastModal = memo(function GenerateForecastModal({ open, onClose, onGenerate }) {
  const [phase, setPhase] = useState('setup')
  const [forecastType, setForecastType] = useState(FORECAST_TYPES[0])
  const [horizonKey, setHorizonKey] = useState(HORIZONS[0].key)
  const [result, setResult] = useState(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (open) {
      setPhase('setup')
      setForecastType(FORECAST_TYPES[0])
      setHorizonKey(HORIZONS[0].key)
      setResult(null)
      setLoadingStep(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [open])

  const selectedHorizon = HORIZONS.find((h) => h.key === horizonKey)
  const previewForecastPeriod = useMemo(() => selectedHorizon.periodLabel(), [selectedHorizon])
  const previewHistoricalPeriod = useMemo(() => historicalRangeLabel(selectedHorizon.lookbackMonths), [selectedHorizon])

  const runEngine = useCallback(() => {
    setPhase('running')
    setLoadingStep(0)
    let step = 0
    timerRef.current = setInterval(() => {
      step += 1
      if (step < LOADING_STEPS.length) {
        setLoadingStep(step)
        return
      }
      clearInterval(timerRef.current)
      setResult(runAutoForecast(forecastType, horizonKey))
      setPhase('result')
    }, 550)
  }, [forecastType, horizonKey])

  const handleEditInputs = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('setup')
  }, [])

  const handleSave = useCallback(() => {
    if (!result) return
    onGenerate({ ...result, generated_by: 101, generated_at: new Date().toISOString() })
  }, [result, onGenerate])

  const footer = phase === 'result' ? (
    <>
      <Button variant="secondary" size="md" onClick={handleEditInputs}>Edit Inputs</Button>
      <Button variant="secondary" size="md" onClick={runEngine}>Regenerate</Button>
      <Button variant="primary" size="md" onClick={handleSave}>Save Forecast</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
      <Button variant="primary" size="md" onClick={runEngine} disabled={phase === 'running'}>
        {phase === 'running' ? 'Running…' : 'Run Auto-Forecast'}
      </Button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title="Generate New Forecast" footer={footer}>
      <div className="space-y-4">
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

            <div className="rounded-lg border border-border bg-bg px-3 py-2.5 text-xs text-ink space-y-1">
              <p><span className="text-muted">Forecasting:</span> <span className="font-medium">{previewForecastPeriod}</span></p>
              <p><span className="text-muted">Training window:</span> <span className="font-medium">{previewHistoricalPeriod}</span></p>
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
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[result.forecast_type]}`}>{result.arima_model}</span>
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
                <p className="text-sm font-semibold text-ink mt-0.5">{result.mape}%</p>
              </div>
            </div>

            <p className="text-xs text-muted">Not what you expected? Regenerate re-runs the model, or Edit Inputs to change the type/horizon.</p>
          </div>
        )}
      </div>
    </Modal>
  )
})

const ForecastDetailModal = memo(function ForecastDetailModal({ forecast, onClose }) {
  return (
    <Modal open={!!forecast} onClose={onClose} title="Forecast Trend" footer={<Button variant="secondary" size="md" onClick={onClose}>Close</Button>}>
      {forecast && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">{forecast.forecast_type} — {forecast.forecast_period}</p>
              <p className="text-xs text-muted flex items-center gap-1 mt-0.5"><CalendarRange size={12} /> Trained on {forecast.historical_period}</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[forecast.forecast_type]}`}>{forecast.arima_model}</span>
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
              <p className="text-sm font-semibold text-ink mt-0.5">{forecast.mape}%</p>
            </div>
          </div>

          <p className="text-xs text-muted">Generated by {GENERATORS[forecast.generated_by] || `User #${forecast.generated_by}`} on {formatDateTime(forecast.generated_at)}</p>
        </div>
      )}
    </Modal>
  )
})

export default function FinancialForecasting({ title = 'Financial Forecasting', crumbs = ['Analytics', 'Financial Forecasting'] }) {
  const [forecasts, setForecasts] = useState(initialForecasts)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [activeStat, setActiveStat] = useState('all')
  const quickFilter = activeStat === 'confidence' ? 'highConfidence' : activeStat === 'mape' ? 'lowError' : 'all'
  const sortBy = activeStat === 'predicted' ? 'predicted' : 'recent'

  const toggleStat = (key) => setActiveStat((prev) => (prev === key ? 'all' : key))

  const [modalOpen, setModalOpen] = useState(false)
  const [detail, setDetail] = useState(null)

  const filtered = useMemo(() => {
    const rows = forecasts.filter((f) => {
      if (typeFilter !== 'all' && f.forecast_type !== typeFilter) return false
      if (quickFilter === 'highConfidence' && f.confidence_level < HIGH_CONFIDENCE_THRESHOLD) return false
      if (quickFilter === 'lowError' && f.mape > LOW_ERROR_THRESHOLD) return false
      const day = f.generated_at.slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      const q = search.toLowerCase()
      if (search && !f.forecast_period.toLowerCase().includes(q) && !f.forecast_type.toLowerCase().includes(q) && !f.arima_model.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
    return sortBy === 'predicted'
      ? rows.sort((a, b) => b.predicted_amount - a.predicted_amount)
      : rows.sort((a, b) => b.generated_at.localeCompare(a.generated_at))
  }, [forecasts, search, typeFilter, dateFrom, dateTo, quickFilter, sortBy])

  const statCards = useMemo(() => {
    const avgConfidence = forecasts.reduce((s, f) => s + f.confidence_level, 0) / forecasts.length
    const avgMape = forecasts.reduce((s, f) => s + f.mape, 0) / forecasts.length
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
  const closeDetail = useCallback(() => setDetail(null), [])
  const handleViewDetail = useCallback((f) => setDetail(f), [])

  const handleGenerate = useCallback((entry) => {
    setForecasts((prev) => {
      const nextId = Math.max(0, ...prev.map((f) => f.forecast_id)) + 1
      return [{ forecast_id: nextId, ...entry }, ...prev]
    })
    setModalOpen(false)
  }, [])

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => <StatCard key={card.key} {...card} />)}
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
              {filtered.map((f) => (
                <ForecastRow key={f.forecast_id} forecast={f} onViewDetail={handleViewDetail} />
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">No forecasts match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <GenerateForecastModal open={modalOpen} onClose={closeGenerateModal} onGenerate={handleGenerate} />
      <ForecastDetailModal forecast={detail} onClose={closeDetail} />
    </div>
  )
}