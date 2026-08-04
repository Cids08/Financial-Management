import { useMemo, useRef, useState, useEffect } from 'react'
import {
  Search, Sparkles, AlertTriangle, PiggyBank, Wallet, TrendingUp, ShieldAlert, Info, Bot, Send, User,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'

// Mirrors the `financial_forecasts` table — used here only to resolve the
// forecast_id foreign key on each recommendation to a readable label.
const FORECASTS = [
  { forecast_id: 1, forecast_type: 'Cash Flow', forecast_period: 'Q4 2026', predicted_amount: 1850000 },
  { forecast_id: 2, forecast_type: 'Revenue', forecast_period: 'Q4 2026', predicted_amount: 2360000 },
  { forecast_id: 3, forecast_type: 'Collections', forecast_period: 'August 2026', predicted_amount: 495000 },
  { forecast_id: 4, forecast_type: 'Expenses', forecast_period: 'August 2026', predicted_amount: 612000 },
  { forecast_id: 5, forecast_type: 'Accounts Receivable', forecast_period: 'Q4 2026', predicted_amount: 980000 },
  { forecast_id: 6, forecast_type: 'Cash Flow', forecast_period: 'FY 2027', predicted_amount: 8400000 },
]
const forecastLabel = (id) => {
  const f = FORECASTS.find((f) => f.forecast_id === id)
  return f ? `${f.forecast_type} — ${f.forecast_period}` : `Forecast #${id}`
}

const GENERATORS = { 101: 'Maria Santos', 102: 'Ramon Torres', 103: 'System (Scheduled)' }

// Mirrors the `ai_recommendations` table:
// recommendation_id, forecast_id, recommendation_type, summary, recommendation, generated_by, generated_at
const RECOMMENDATION_TYPES = ['Cash Flow Management', 'Cost Reduction', 'Revenue Optimization', 'Risk Alert', 'Budget Adjustment']

const TYPE_META = {
  'Cash Flow Management': { icon: Wallet, style: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  'Cost Reduction': { icon: PiggyBank, style: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  'Revenue Optimization': { icon: TrendingUp, style: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400' },
  'Risk Alert': { icon: ShieldAlert, style: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  'Budget Adjustment': { icon: AlertTriangle, style: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
}

const initialRecommendations = [
  {
    recommendation_id: 1, forecast_id: 6, recommendation_type: 'Risk Alert',
    summary: 'Projected FY 2027 cash flow shows a 13.5% error margin — treat the upper range with caution.',
    recommendation: 'The FY 2027 cash flow model carries a wider confidence band than usual (MAPE 13.5%). Before committing to large capital outlays next year, re-run the forecast once Q3 2026 actuals are posted so the trailing window includes a full year of collector-level collection data. Consider holding a contingency reserve of at least 10% of the predicted shortfall until the model stabilizes.',
    generated_by: 103, generated_at: '2026-07-29T17:05:00',
  },
  {
    recommendation_id: 2, forecast_id: 4, recommendation_type: 'Cost Reduction',
    summary: 'Expense growth is outpacing revenue growth for August — review discretionary Operating Expenses.',
    recommendation: 'August expenses are forecast at ₱612,000 against a revenue base growing more slowly in the same window. The largest driver is Operating Expenses rather than Tax Expense or commissions. Recommend a line-by-line review of Operating Expenses postings from the last 60 days to identify any recurring charges that could be renegotiated or deferred to Q1 2027.',
    generated_by: 101, generated_at: '2026-07-25T13:12:00',
  },
  {
    recommendation_id: 3, forecast_id: 3, recommendation_type: 'Cash Flow Management',
    summary: 'Collections are trending below the historical average for the third straight month.',
    recommendation: 'Collections for August are projected at ₱495,000, roughly 8% below the trailing six-month average. Two collectors account for most of the shortfall against their monthly targets. Recommend prioritizing follow-up on overdue Accounts Receivable balances tied to those assigned areas before the BDO Operating Account dips below its reserve threshold.',
    generated_by: 102, generated_at: '2026-07-25T13:15:00',
  },
  {
    recommendation_id: 4, forecast_id: 2, recommendation_type: 'Revenue Optimization',
    summary: 'Revenue forecast for Q4 2026 is strong — a good window to renegotiate supplier terms.',
    recommendation: 'Revenue is forecast at ₱2,360,000 for Q4 2026 with a 91% confidence level, the strongest of the current models. With healthier projected inflows, this is a favorable window to renegotiate early-payment discounts with top suppliers, or to accelerate planned Fixed Asset purchases that were deferred earlier in the year.',
    generated_by: 101, generated_at: '2026-07-21T08:25:00',
  },
  {
    recommendation_id: 5, forecast_id: 5, recommendation_type: 'Budget Adjustment',
    summary: 'Accounts Receivable forecast confidence is the lowest among active models at 73%.',
    recommendation: 'The Accounts Receivable forecast for Q4 2026 has the lowest confidence level of the active models (73%), largely due to inconsistent invoice_date to collection_date gaps in the historical window. Recommend tightening payment_terms enforcement on new invoices and flagging any Accounts Receivable balance over 90 days for a targeted collections push.',
    generated_by: 102, generated_at: '2026-07-28T09:45:00',
  },
  {
    recommendation_id: 6, forecast_id: 1, recommendation_type: 'Cash Flow Management',
    summary: 'Cash Flow forecast for Q4 2026 supports maintaining current reserve levels across accounts.',
    recommendation: 'The Q4 2026 cash flow model (87% confidence) suggests current balances across the BDO Operating, BPI Payroll, and Metrobank Reserve accounts are adequate to cover projected Disbursements and Tax Obligations without drawing down the reserve fund. No reallocation is recommended this quarter.',
    generated_by: 101, generated_at: '2026-07-21T08:30:00',
  },
]

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

// NOTE: text color is forced with `!text-ink` (Tailwind important) rather than
// relying on inheritance, and duplicated as an inline style below. The bug this
// fixes: on the AI panel, the tinted/gradient wrapper background was winning
// the CSS specificity fight against the input's own text color, so typed
// characters rendered in a color too close to the input's background to read.
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)' }

// Search field styled to match the filter dropdowns exactly — same height,
// same rounded-lg corners, same border — just with left padding for the icon.
const SEARCH_INPUT = `w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const SUGGESTED_PROMPTS = [
  'Which forecast has the lowest confidence?',
  'How can we reduce expenses?',
  'Summarize the risk alerts',
  'What should we do about collections?',
]

// Lightweight, fully client-side response engine grounded in the recommendations
// already on screen — this stands in for a real assistant backend. Swap this
// function out for an actual API call (e.g. POST /api/ai-advisor) when ready.
function generateAIReply(question, recs) {
  const q = question.toLowerCase()

  const matchType = RECOMMENDATION_TYPES.find((t) => q.includes(t.toLowerCase().split(' ')[0]))
  if (q.includes('risk') || q.includes('alert')) {
    const risk = recs.filter((r) => r.recommendation_type === 'Risk Alert')
    if (risk.length === 0) return "There are no open Risk Alert recommendations right now — nothing flagged."
    return `There ${risk.length === 1 ? 'is' : 'are'} ${risk.length} Risk Alert recommendation${risk.length === 1 ? '' : 's'} right now. The most recent: "${risk[0].summary}" (linked to ${forecastLabel(risk[0].forecast_id)}).`
  }
  if (q.includes('confidence') || q.includes('lowest') || q.includes('uncertain')) {
    const weakest = recs.find((r) => r.recommendation_type === 'Budget Adjustment') || recs[0]
    return `${forecastLabel(weakest.forecast_id)} currently carries the most uncertainty among active models. Related guidance: "${weakest.summary}"`
  }
  if (q.includes('expense') || q.includes('cost') || q.includes('reduce') || q.includes('cut')) {
    const cost = recs.filter((r) => r.recommendation_type === 'Cost Reduction')
    if (cost.length === 0) return "No Cost Reduction recommendations are open at the moment."
    return cost.map((r) => `• ${r.summary}`).join('\n')
  }
  if (q.includes('collect')) {
    const collections = recs.filter((r) => r.forecast_id === 3 || r.recommendation_type === 'Cash Flow Management')
    if (collections.length === 0) return "No collections-related guidance is open right now."
    return collections.map((r) => `• ${r.summary}`).join('\n')
  }
  if (q.includes('revenue')) {
    const rev = recs.filter((r) => r.recommendation_type === 'Revenue Optimization')
    if (rev.length === 0) return "No Revenue Optimization recommendations are open at the moment."
    return rev.map((r) => `• ${r.summary}`).join('\n')
  }
  if (matchType) {
    const matches = recs.filter((r) => r.recommendation_type === matchType)
    if (matches.length === 0) return `There are no open ${matchType} recommendations right now.`
    return matches.map((r) => `• ${r.summary} (${forecastLabel(r.forecast_id)})`).join('\n')
  }
  if (q.includes('summar')) {
    return recs.slice(0, 4).map((r) => `• [${r.recommendation_type}] ${r.summary}`).join('\n')
  }
  return "I can help with cash flow, cost reduction, revenue, collections, budget, or risk questions — try asking about one of those, or pick a suggestion below."
}

export default function AIRecommendations({ title = 'AI Financial Recommendations', crumbs = ['Analytics', 'AI Financial Recommendations'] }) {
  const [recommendations] = useState(initialRecommendations)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [forecastFilter, setForecastFilter] = useState('all')
  const [detail, setDetail] = useState(null)

  // Which stat card is currently engaged — only one at a time, so cards never
  // highlight simultaneously (matches the pattern on Financial Forecasting).
  const [activeStat, setActiveStat] = useState('all')
  const toggleStat = (key) => setActiveStat((prev) => (prev === key ? 'all' : key))

  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi, I'm your AI financial advisor. Ask me about any of the recommendations on this page — cash flow, cost reduction, revenue, collections, or risk.", at: new Date().toISOString() },
  ])
  const [chatInput, setChatInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isThinking])

  // The "Risk Alerts" card filters by type; the "Forecasts Covered" card
  // regroups the feed by linked forecast instead of by recency.
  useEffect(() => {
    if (activeStat === 'risk') {
      setTypeFilter('Risk Alert')
    } else if (activeStat === 'all' && typeFilter === 'Risk Alert') {
      setTypeFilter('all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStat])

  const filtered = useMemo(() => {
    const rows = recommendations.filter((r) => {
      if (typeFilter !== 'all' && r.recommendation_type !== typeFilter) return false
      if (forecastFilter !== 'all' && r.forecast_id !== Number(forecastFilter)) return false
      const q = search.toLowerCase()
      if (search && !r.summary.toLowerCase().includes(q) && !r.recommendation_type.toLowerCase().includes(q) && !forecastLabel(r.forecast_id).toLowerCase().includes(q)) {
        return false
      }
      return true
    })
    return activeStat === 'forecasts'
      ? rows.sort((a, b) => forecastLabel(a.forecast_id).localeCompare(forecastLabel(b.forecast_id)))
      : rows.sort((a, b) => b.generated_at.localeCompare(a.generated_at))
  }, [recommendations, search, typeFilter, forecastFilter, activeStat])

  const stats = useMemo(() => {
    const riskAlerts = recommendations.filter((r) => r.recommendation_type === 'Risk Alert').length
    const distinctForecasts = new Set(recommendations.map((r) => r.forecast_id)).size
    return { total: recommendations.length, riskAlerts, distinctForecasts }
  }, [recommendations])

  const statCards = [
    {
      key: 'total', label: 'Total Recommendations', value: stats.total, icon: Sparkles,
      iconBg: 'bg-primary/15', iconColor: 'text-primary-dark',
      isActive: activeStat === 'all',
      onClick: () => setActiveStat('all'),
    },
    {
      key: 'risk', label: 'Risk Alerts', value: stats.riskAlerts, icon: ShieldAlert,
      iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400',
      isActive: activeStat === 'risk',
      onClick: () => toggleStat('risk'),
    },
    {
      key: 'forecasts', label: 'Forecasts Covered', value: stats.distinctForecasts, icon: Bot,
      iconBg: 'bg-blue-50 dark:bg-blue-500/10', iconColor: 'text-blue-600 dark:text-blue-400',
      isActive: activeStat === 'forecasts',
      onClick: () => toggleStat('forecasts'),
    },
  ]

  const sendMessage = (text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const userMsg = { role: 'user', text: trimmed, at: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setChatInput('')
    setIsThinking(true)
    setTimeout(() => {
      const reply = generateAIReply(trimmed, recommendations)
      setMessages((prev) => [...prev, { role: 'assistant', text: reply, at: new Date().toISOString() }])
      setIsThinking(false)
    }, 550)
  }

  const handleChatSubmit = (e) => {
    e.preventDefault()
    sendMessage(chatInput)
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
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

      {activeStat !== 'all' && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Showing:</span>
          {activeStat === 'risk' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">
              Risk Alerts only
            </span>
          )}
          {activeStat === 'forecasts' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
              Grouped by linked forecast
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recommendations feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
            <div className="relative flex-1 min-w-0 basis-full">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by summary, type, or linked forecast..."
                className={SEARCH_INPUT}
                style={{ ...INPUT_TEXT_STYLE, width: '100%', minWidth: 0, outline: 'none' }}
                autoComplete="off"
              />
            </div>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setActiveStat('all') }} className={INPUT} style={INPUT_TEXT_STYLE}>
              <option value="all">All Recommendation Types</option>
              {RECOMMENDATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={forecastFilter} onChange={(e) => setForecastFilter(e.target.value)} className={INPUT} style={INPUT_TEXT_STYLE}>
              <option value="all">All Linked Forecasts</option>
              {FORECASTS.map((f) => <option key={f.forecast_id} value={f.forecast_id}>{forecastLabel(f.forecast_id)}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((r) => {
              const meta = TYPE_META[r.recommendation_type]
              const Icon = meta.icon
              return (
                <div key={r.recommendation_id} className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.style}`}>
                      <Icon size={13} /> {r.recommendation_type}
                    </span>
                    <Tooltip label="View full recommendation" align="end">
                      <button type="button" onClick={() => setDetail(r)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                        <Info size={15} />
                      </button>
                    </Tooltip>
                  </div>
                  <p className="text-sm text-ink leading-relaxed">{r.summary}</p>
                  <div className="mt-auto flex items-center justify-between text-xs text-muted pt-2 border-t border-border">
                    <span>{forecastLabel(r.forecast_id)}</span>
                    <span>{formatDateTime(r.generated_at)}</span>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className={`${PANEL} ${PANEL_PAD} col-span-full text-center text-sm text-muted py-10`}>
                No recommendations match your filters.
              </div>
            )}
          </div>
        </div>

        {/* AI chat panel — deliberately louder than the surrounding panels so
            it reads as the interactive centerpiece of the page, not just another card. */}
        <div className="rounded-xl border-2 border-primary/40 bg-linear-to-b from-primary/10 via-surface to-surface shadow-lg shadow-primary/10 flex flex-col h-160 lg:sticky lg:top-4 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/10 px-4 py-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-ink shrink-0">
              <Bot size={17} />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500 border-2 border-surface" />
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink flex items-center gap-1.5">
                Ask the AI Advisor
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary text-ink">Live</span>
              </p>
              <p className="text-xs text-muted">Grounded in the recommendations shown here</p>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex items-start gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.role === 'user' ? 'bg-primary/15 text-primary-dark' : 'bg-bg text-muted border border-border'}`}>
                  {m.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                </div>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-line leading-relaxed ${m.role === 'user' ? 'bg-primary text-white rounded-tr-sm' : 'bg-bg text-ink border border-border rounded-tl-sm'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex items-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-muted border border-border">
                  <Bot size={13} />
                </div>
                <div className="rounded-xl rounded-tl-sm border border-border bg-bg px-3 py-2 text-sm text-muted">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendMessage(p)}
                  className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-ink hover:bg-primary/15 hover:border-primary/50 transition-colors duration-150"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleChatSubmit} className="border-t border-primary/20 bg-primary/5 p-3 flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about cash flow, costs, risk..."
              className={INPUT}
              style={INPUT_TEXT_STYLE}
              autoComplete="off"
            />
            <Button type="submit" variant="primary" size="sm" icon={Send} disabled={!chatInput.trim()}>Send</Button>
          </form>
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Recommendation Detail" footer={<Button variant="secondary" size="md" onClick={() => setDetail(null)}>Close</Button>}>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_META[detail.recommendation_type].style}`}>
                {(() => { const Icon = TYPE_META[detail.recommendation_type].icon; return <Icon size={13} /> })()}
                {detail.recommendation_type}
              </span>
              <span className="text-xs text-muted">{forecastLabel(detail.forecast_id)}</span>
            </div>
            <p className="text-sm font-semibold text-ink">{detail.summary}</p>
            <div className="rounded-lg border border-border bg-bg px-4 py-3">
              <p className="text-sm text-ink leading-relaxed">{detail.recommendation}</p>
            </div>
            <p className="text-xs text-muted">Generated by {GENERATORS[detail.generated_by] || `User #${detail.generated_by}`} on {formatDateTime(detail.generated_at)}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}