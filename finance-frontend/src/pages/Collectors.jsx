import { useEffect, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, UserCheck, UserX, Phone, Mail, MapPin, Target, Eye, EyeOff, ChevronLeft, ChevronRight, Loader2, BarChart3 } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line, ReferenceLine,
} from 'recharts'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip2 from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { apiFetch } from '../utils/api'
import { useCollectors } from '../hooks/useCollectors'

const EMPTY_FORM = { employee_no: '', first_name: '', last_name: '', email: '', contact_no: '', assigned_area: '', service_area_id: '', monthly_target: '', commission_rate: '', is_active: true }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  true: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  false: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

const PERIODS = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
]

// Chart colors sourced from the app's CSS variables (with hardcoded
// fallbacks) rather than new hex values, so the chart stays in sync with
// whatever the theme's primary/muted/accent colors actually are, light or
// dark mode — same pattern already used for chart-adjacent inline styles
// elsewhere in this codebase (see AIRecommendations.jsx's INPUT_TEXT_STYLE).
const CHART_COLORS = {
  collected: 'var(--color-primary, #f59e0b)',
  target: 'var(--color-muted, #94a3b8)',
  efficiency: 'var(--color-emerald-400, #34d399)',
  grid: 'var(--color-border, #334155)',
  axisText: 'var(--color-muted, #94a3b8)',
}

function initials(first, last) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase()
}

// Full mask, not partial — keeps dashes/spaces as visual separators but
// replaces every other character, and email is a fixed-length placeholder
// regardless of the real address. A partial mask (last 4 digits visible)
// leaks information on a short list; this doesn't.
function maskValue(value) {
  if (!value) return ''
  return value
    .split('')
    .map((ch) => (ch === '-' || ch === ' ' ? ch : '•'))
    .join('')
}

function maskEmail(value) {
  if (!value) return ''
  return '•'.repeat(10)
}

/**
 * /api/service-areas doesn't have its own hook yet — this is a plain
 * fetch-on-mount, same lightweight pattern used for the budget/category
 * lookups on the Expenses page.
 */
function useServiceAreas() {
  const [areas, setAreas] = useState([])

  useEffect(() => {
    let cancelled = false
    apiFetch('/api/service-areas')
      .then((res) => res.json())
      .then((json) => { if (!cancelled && json.success) setAreas(json.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return areas
}

// Custom tooltip so amounts render through formatCurrency and the
// efficiency line shows a % suffix, instead of recharts' raw numbers.
function EfficiencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-ink mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }} className="flex items-center justify-between gap-3">
          <span>{entry.name}</span>
          <span className="font-medium tabular-nums">
            {entry.dataKey === 'efficiency' ? `${entry.value}%` : formatCurrency(entry.value)}
          </span>
        </p>
      ))}
    </div>
  )
}

function EfficiencyModal({ collector, onClose, getEfficiency }) {
  const [period, setPeriod] = useState('month')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!collector) return
    let cancelled = false
    setLoading(true)
    setError('')
    getEfficiency(collector.collector_id, period).then((result) => {
      if (cancelled) return
      if (result.success) setRows(result.data)
      else setError(result.message)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [collector, period, getEfficiency])

  return (
    <Modal
      open={!!collector}
      onClose={onClose}
      title={collector ? `Efficiency — ${collector.first_name} ${collector.last_name}` : 'Efficiency'}
      maxWidth="max-w-xl"
      footer={<Button variant="secondary" size="md" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150
                ${period === p.key ? 'bg-primary text-white' : 'bg-bg text-muted hover:text-ink'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted py-16 text-center">No confirmed collections in this range yet.</p>
        ) : (
          <>
            {rows.every((r) => r.collected === 0) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                No confirmed collections recorded in this period yet. The dashed line below shows the target for reference.
              </div>
            )}

            <div className="rounded-lg border border-border bg-bg p-2">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axisText }}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="amount"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axisText }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: CHART_COLORS.axisText }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip content={<EfficiencyTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {/* Faint 100%-efficiency reference so the efficiency line
                      has a visible baseline to read against, even when the
                      line itself sits at 0. */}
                  <ReferenceLine yAxisId="pct" y={100} stroke={CHART_COLORS.grid} strokeDasharray="2 4" />
                  <Bar yAxisId="amount" dataKey="collected" name="Collected" fill={CHART_COLORS.collected} radius={[3, 3, 0, 0]} maxBarSize={40} />
                  {/* Target as a dashed goal line, not a second bar — bar-vs-bar
                      makes an empty ("no data yet") period look like two
                      competing values instead of "actual against a goal." */}
                  <Line yAxisId="amount" type="stepAfter" dataKey="target" name="Target" stroke={CHART_COLORS.target} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
                  <Line yAxisId="pct" type="monotone" dataKey="efficiency" name="Efficiency %" stroke={CHART_COLORS.efficiency} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Exact figures below the chart, for anyone who wants the
                precise numbers rather than reading them off the chart. */}
            <div className="rounded-lg border border-border divide-y divide-border max-h-56 overflow-y-auto">
              {rows.map((r) => (
                <div key={r.period} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-ink">{r.period}</p>
                    <p className="text-[11px] text-muted">{formatCurrency(r.collected)} of {formatCurrency(r.target)} target</p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold
                      ${r.efficiency >= 100
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : r.efficiency >= 70
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                          : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}`}
                  >
                    {r.efficiency}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default function Collectors({ title = 'Collectors', crumbs = ['Master Data', 'Collectors'] }) {
  const {
    collectors, meta, loading, saving, error,
    search, setSearch,
    statusFilter, setStatusFilter,
    showArchived, setShowArchived,
    page, setPage,
    createCollector, updateCollector, archiveCollector, restoreCollector,
    getEfficiency,
  } = useCollectors()

  const serviceAreas = useServiceAreas()

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [efficiencyTarget, setEfficiencyTarget] = useState(null)

  // Controls visibility of email + employee no. + contact no. together
  // per row — masked by default, revealed only when the eye icon is
  // clicked, same pattern as Customers/Suppliers/Users.
  const [revealedIds, setRevealedIds] = useState(new Set())
  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Page-scoped, not global — an accurate all-pages breakdown would need
  // a dedicated /api/collectors/stats endpoint (Customers/Suppliers
  // already have one; Collectors doesn't yet). Total below IS global,
  // since meta.total comes straight from the paginator.
  const pageStats = {
    active: collectors.filter((c) => c.is_active).length,
    inactive: collectors.filter((c) => !c.is_active).length,
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (c) => {
    setForm({
      employee_no: c.employee_no,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email || '',
      contact_no: c.contact_no || '',
      assigned_area: c.assigned_area || '',
      service_area_id: c.service_area_id || '',
      monthly_target: c.monthly_target,
      commission_rate: c.commission_rate,
      is_active: c.is_active,
    })
    setFormError('')
    setModalMode(c)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.employee_no.trim() || !form.first_name.trim() || !form.last_name.trim()) {
      setFormError('Employee no., first name, and last name are required.')
      return
    }

    const payload = {
      employee_no: form.employee_no,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email || null,
      phone_number: form.contact_no || null, // frontend "contact_no" -> backend "phone_number"
      assigned_area: form.assigned_area || null,
      service_area_id: form.service_area_id ? Number(form.service_area_id) : null,
      monthly_target: Number(form.monthly_target) || 0,
      commission_rate: Number(form.commission_rate) || 0,
      is_active: form.is_active === true || form.is_active === 'true',
    }

    const result = modalMode === 'add'
      ? await createCollector(payload)
      : await updateCollector(modalMode.collector_id, payload)

    if (!result.success) {
      setFormError(result.message)
      return
    }
    closeModal()
  }

  const statCards = [
    { key: 'total', label: 'Total Collectors', value: meta.total, icon: UserCheck, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'active', label: 'Active (this page)', value: pageStats.active, icon: UserCheck, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'active' && !showArchived, onClick: () => { setStatusFilter('active'); setShowArchived(false) } },
    { key: 'inactive', label: 'Inactive (this page)', value: pageStats.inactive, icon: UserX, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: statusFilter === 'inactive' && !showArchived, onClick: () => { setStatusFilter('inactive'); setShowArchived(false) } },
    { key: 'archived', label: 'Archived', value: showArchived ? meta.total : '—', icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: showArchived, onClick: () => setShowArchived(true) },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Manage field collectors, assigned areas, and monthly targets.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Collector</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, employee no., or area..." className={`${INPUT} pl-9`} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <Button
          variant={showArchived ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => setShowArchived((prev) => !prev)}
          className="shrink-0 whitespace-nowrap"
        >
          Show Archived
        </Button>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Collector</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Assigned Area</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Monthly Target</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Commission</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  <Loader2 size={16} className="inline animate-spin mr-2" /> Loading collectors…
                </td></tr>
              )}
              {!loading && collectors.map((c) => {
                const revealed = revealedIds.has(c.collector_id)
                return (
                  <tr key={c.collector_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-dark overflow-hidden">
                          {c.profile_photo ? (
                            <img src={c.profile_photo} alt={`${c.first_name} ${c.last_name}`} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                          ) : (
                            initials(c.first_name, c.last_name)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate font-medium text-ink">{c.first_name} {c.last_name}</p>
                            <button
                              type="button"
                              onClick={() => toggleReveal(c.collector_id)}
                              aria-label={revealed ? 'Hide contact details' : 'Show contact details'}
                              className="shrink-0 text-muted hover:text-ink transition-colors duration-150"
                            >
                              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          <p className="truncate text-xs text-muted font-mono">{revealed ? c.employee_no : maskValue(c.employee_no)}</p>
                          {c.email && (
                            <p className="truncate text-xs text-muted flex items-center gap-1"><Mail size={11} /> {revealed ? c.email : maskEmail(c.email)}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-xs text-ink"><MapPin size={12} className="text-muted" /> {c.service_area_name || c.assigned_area || '—'}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted font-mono">
                        <Phone size={11} className="shrink-0" /> {revealed ? c.contact_no : maskValue(c.contact_no)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(c.monthly_target)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="flex items-center gap-1 text-xs text-muted"><Target size={12} /> {c.commission_rate}%</span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[c.is_active]}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip2 label="View efficiency" align="start">
                          <button type="button" onClick={() => setEfficiencyTarget(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <BarChart3 size={15} />
                          </button>
                        </Tooltip2>
                        <Tooltip2 label="Edit collector" align="start">
                          <button type="button" onClick={() => openEdit(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip2>
                        <Tooltip2 label={showArchived ? 'Restore collector' : 'Archive collector'} align="end">
                          <button
                            type="button"
                            onClick={() => (showArchived ? restoreCollector(c.collector_id) : archiveCollector(c.collector_id))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                          >
                            {showArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip2>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && collectors.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No collectors match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted">
            <span>Page {meta.current_page} of {meta.last_page} &middot; {meta.total} total</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-bg disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150">
                <ChevronLeft size={14} />
              </button>
              <button type="button" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-bg disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Collector' : 'Add Collector'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Collector'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>First Name</label>
              <input type="text" value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className={INPUT} placeholder="Ramon" />
            </div>
            <div>
              <label className={LABEL}>Last Name</label>
              <input type="text" value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} className={INPUT} placeholder="Torres" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Employee No.</label>
              <input type="text" value={form.employee_no} onChange={(e) => setForm((f) => ({ ...f, employee_no: e.target.value }))} className={INPUT} placeholder="EMP-0231" />
            </div>
            <div>
              <label className={LABEL}>Contact No.</label>
              <input type="text" value={form.contact_no} onChange={(e) => setForm((f) => ({ ...f, contact_no: e.target.value }))} className={INPUT} placeholder="0917 222 1100" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={INPUT} placeholder="ramon.torres@alibaton.test" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Service Area</label>
              <select value={form.service_area_id} onChange={(e) => setForm((f) => ({ ...f, service_area_id: e.target.value }))} className={INPUT}>
                <option value="">Unassigned</option>
                {serviceAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Assigned Area (legacy label)</label>
              <input type="text" value={form.assigned_area} onChange={(e) => setForm((f) => ({ ...f, assigned_area: e.target.value }))} className={INPUT} placeholder="Quezon City" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Monthly Target</label>
              <input type="number" value={form.monthly_target} onChange={(e) => setForm((f) => ({ ...f, monthly_target: e.target.value }))} className={INPUT} placeholder="250000" />
            </div>
            <div>
              <label className={LABEL}>Commission %</label>
              <input type="number" step="0.1" value={form.commission_rate} onChange={(e) => setForm((f) => ({ ...f, commission_rate: e.target.value }))} className={INPUT} placeholder="2.5" />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))} className={INPUT}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <EfficiencyModal collector={efficiencyTarget} onClose={() => setEfficiencyTarget(null)} getEfficiency={getEfficiency} />
    </div>
  )
}