import { useMemo, useState, useEffect } from 'react'
import {
  Search, Sparkles, AlertTriangle, Wallet, TrendingUp, PiggyBank, Info, LineChart,
  Archive, RotateCcw, ChevronLeft, ChevronRight, X,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import AdvisorChatPanel from '../components/AdvisorChatPanel'
import { useAiRecommendations } from '../hooks/useAiRecommendations'

// Real ai_recommendations_category_check values — confirmed against the
// actual DB constraint. NOT the old 5-value taxonomy (Cash Flow Management,
// Cost Reduction, Revenue Optimization, Risk Alert, Budget Adjustment) —
// none of those exist in the schema. Colors match FinancialForecasting's
// TYPE_STYLES where the category overlaps a forecast_type (Cash Flow,
// Revenue, Expense↔Expenses) — Budget has no analog there, given its own
// distinct color (amber) so it doesn't collide with the other three.
const RECOMMENDATION_TYPES = ['Cash Flow', 'Revenue', 'Expense', 'Budget']

const TYPE_META = {
  'Cash Flow': { icon: Wallet, style: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  Revenue: { icon: TrendingUp, style: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  Expense: { icon: PiggyBank, style: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  Budget: { icon: AlertTriangle, style: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
}
const DEFAULT_TYPE_META = { icon: Sparkles, style: 'bg-gray-100 text-muted' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const PAGE_SIZE = 8

const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)' }

const SEARCH_INPUT = `w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function forecastLabel(r) {
  if (!r) return 'Unlinked forecast'
  if (r.forecast_type && r.forecast_period) return `${r.forecast_type} — ${r.forecast_period}`
  return `Forecast #${r.forecast_id}`
}

export default function AIRecommendations({ title = 'AI Financial Recommendations', crumbs = ['Analytics', 'AI Financial Recommendations'] }) {
  const { recommendations, loading, error, fetchRecommendations, archiveRecommendation, restoreRecommendation } = useAiRecommendations()

  useEffect(() => {
    fetchRecommendations()
  }, [fetchRecommendations])

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [forecastFilter, setForecastFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  const [detail, setDetail] = useState(null)
  const [archivingId, setArchivingId] = useState(null)

  const distinctForecasts = useMemo(() => {
    const seen = new Map()
    for (const r of recommendations) {
      if (!seen.has(r.forecast_id)) seen.set(r.forecast_id, r)
    }
    return Array.from(seen.values())
  }, [recommendations])

  const [activeStat, setActiveStat] = useState('all')
  const toggleStat = (key) => setActiveStat((prev) => (prev === key ? 'all' : key))

  useEffect(() => {
    if (activeStat === 'risk') {
      setTypeFilter('Budget')
    } else if (activeStat === 'all' && typeFilter === 'Budget') {
      setTypeFilter('all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStat])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = recommendations.filter((r) => {
      if (showArchived && !r.is_archived) return false
      if (!showArchived && r.is_archived) return false
      if (typeFilter !== 'all' && r.recommendation_type !== typeFilter) return false
      if (forecastFilter !== 'all' && r.forecast_id !== Number(forecastFilter)) return false
      if (q && !r.summary.toLowerCase().includes(q) && !(r.recommendation_type || '').toLowerCase().includes(q) && !forecastLabel(r).toLowerCase().includes(q)) {
        return false
      }
      return true
    })
    return activeStat === 'forecasts'
      ? [...rows].sort((a, b) => forecastLabel(a).localeCompare(forecastLabel(b)))
      : [...rows].sort((a, b) => (b.generated_at || '').localeCompare(a.generated_at || ''))
  }, [recommendations, search, typeFilter, forecastFilter, activeStat, showArchived])

  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, forecastFilter, activeStat, showArchived])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  )
  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length)

  // Covers every control that can narrow the list — used to show/hide the
  // "Clear filters" action, so it only appears when there's actually
  // something to reset.
  const hasActiveFilters = search.trim() !== '' || typeFilter !== 'all' || forecastFilter !== 'all' || activeStat !== 'all' || showArchived

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setForecastFilter('all')
    setActiveStat('all')
    setShowArchived(false)
  }

  const stats = useMemo(() => {
    const active = recommendations.filter((r) => !r.is_archived)
    // "Risk Alerts" no longer maps to a real category (Risk Alert never
    // existed in the DB) — repurposed to count Budget-flagged items instead,
    // since those are the ones actually meant to draw attention (see
    // MockRecommendationEngine/OpenAiRecommendationEngine: Budget is used
    // specifically for below-60%-confidence flags).
    const budgetFlags = active.filter((r) => r.recommendation_type === 'Budget').length
    const distinctForecastCount = new Set(active.map((r) => r.forecast_id)).size
    const archivedCount = recommendations.filter((r) => r.is_archived).length
    return { total: active.length, budgetFlags, distinctForecasts: distinctForecastCount, archived: archivedCount }
  }, [recommendations])

  const statCards = [
    {
      key: 'total', label: 'Total Recommendations', value: loading ? '—' : stats.total, icon: Sparkles,
      iconBg: 'bg-primary/15', iconColor: 'text-primary-dark',
      isActive: activeStat === 'all' && !showArchived,
      onClick: () => { setActiveStat('all'); setShowArchived(false) },
    },
    {
      key: 'risk', label: 'Budget Flags', value: loading ? '—' : stats.budgetFlags, icon: AlertTriangle,
      iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400',
      isActive: activeStat === 'risk' && !showArchived,
      onClick: () => { setShowArchived(false); toggleStat('risk') },
    },
    {
      key: 'forecasts', label: 'Forecasts Covered', value: loading ? '—' : stats.distinctForecasts, icon: LineChart,
      iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400',
      isActive: activeStat === 'forecasts' && !showArchived,
      onClick: () => { setShowArchived(false); toggleStat('forecasts') },
    },
    {
      key: 'archived', label: 'Archived', value: loading ? '—' : stats.archived, icon: Archive,
      iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400',
      isActive: showArchived,
      onClick: () => setShowArchived(true),
    },
  ]

  const handleToggleArchive = async (r) => {
    if (!archiveRecommendation || !restoreRecommendation) return
    setArchivingId(r.recommendation_id)
    try {
      if (r.is_archived) {
        await restoreRecommendation(r.recommendation_id)
      } else {
        await archiveRecommendation(r.recommendation_id)
      }
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">
            Generated automatically from each Financial Forecasting run — ask the advisor below for a plain-language read on any of them.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              aria-pressed={card.isActive}
              className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={18} className={card.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">{card.label}</p>
                <p className="text-lg font-bold text-ink">{card.value}</p>
              </div>
            </button>
          )
        })}
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Showing:</span>
          {showArchived && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              Archived only
            </span>
          )}
          {!showArchived && activeStat === 'risk' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              Budget flags only
            </span>
          )}
          {!showArchived && activeStat === 'forecasts' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
              Grouped by linked forecast
            </span>
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full border border-border text-muted hover:text-ink hover:bg-bg transition-colors duration-150"
          >
            <X size={12} /> Clear filters
          </button>
        </div>
      )}

      <div className="space-y-4">
        <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
            <div className="relative flex-1 min-w-0 basis-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by summary, category, or linked forecast..."
                aria-label="Search recommendations"
                className={SEARCH_INPUT}
                style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0, outline: 'none' }}
                autoComplete="off"
              />
            </div>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setActiveStat('all') }} aria-label="Filter by category" className={`${INPUT} lg:w-56 lg:shrink-0`} style={INPUT_TEXT_STYLE}>
              <option value="all">All Categories</option>
              {RECOMMENDATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={forecastFilter} onChange={(e) => setForecastFilter(e.target.value)} aria-label="Filter by linked forecast" className={`${INPUT} lg:w-56 lg:shrink-0`} style={INPUT_TEXT_STYLE}>
              <option value="all">All Linked Forecasts</option>
              {distinctForecasts.map((r) => <option key={r.forecast_id} value={r.forecast_id}>{forecastLabel(r)}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {loading && (
              <div className={`${PANEL} ${PANEL_PAD} col-span-full text-center text-sm text-muted py-10`}>
                Loading recommendations…
              </div>
            )}
            {!loading && paginated.map((r) => {
              const meta = TYPE_META[r.recommendation_type] || DEFAULT_TYPE_META
              const Icon = meta.icon
              return (
                <div key={r.recommendation_id} className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.style}`}>
                      <Icon size={13} /> {r.recommendation_type || 'Uncategorized'}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Tooltip label="View full recommendation" align="end">
                        <button type="button" onClick={() => setDetail(r)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label={r.is_archived ? 'Restore recommendation' : 'Archive recommendation'} align="end">
                        <button
                          type="button"
                          onClick={() => handleToggleArchive(r)}
                          disabled={archivingId === r.recommendation_id}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50"
                        >
                          {r.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                  <p className="text-sm text-ink leading-relaxed">{r.summary}</p>
                  <div className="mt-auto flex items-center justify-between text-xs text-muted pt-2 border-t border-border">
                    <span>{forecastLabel(r)}</span>
                    <span>{formatDateTime(r.generated_at)}</span>
                  </div>
                </div>
              )
            })}
            {!loading && filtered.length === 0 && (
              <div className={`${PANEL} ${PANEL_PAD} col-span-full text-center text-sm text-muted py-10`}>
                {showArchived ? 'No archived recommendations.' : 'No recommendations match your filters.'}
              </div>
            )}
          </div>

          {!loading && filtered.length > 0 && (
            <div className={`${PANEL} flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}>
              <p className="text-xs text-muted">
                Showing {rangeStart}–{rangeEnd} of {filtered.length} recommendations
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="px-2 text-xs font-medium text-ink whitespace-nowrap">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
      </div>

      <AdvisorChatPanel />

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Recommendation Detail" footer={<Button variant="secondary" size="md" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${(TYPE_META[detail.recommendation_type] || DEFAULT_TYPE_META).style}`}>
                {(() => { const Icon = (TYPE_META[detail.recommendation_type] || DEFAULT_TYPE_META).icon; return <Icon size={13} /> })()}
                {detail.recommendation_type || 'Uncategorized'}
              </span>
              <span className="text-xs text-muted">{forecastLabel(detail)}</span>
            </div>
            <p className="text-sm font-semibold text-ink">{detail.summary}</p>
            <div className="rounded-lg border border-border bg-bg px-4 py-3">
              <p className="text-sm text-ink leading-relaxed">{detail.recommendation}</p>
            </div>
            <p className="text-xs text-muted">Generated by {detail.generated_by_name || `User #${detail.generated_by}`} on {formatDateTime(detail.generated_at)}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}