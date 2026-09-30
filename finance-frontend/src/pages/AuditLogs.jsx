import { useEffect, useMemo, useState } from 'react'
import { Search, CalendarRange, X, ChevronDown, ChevronRight, Download, RotateCcw } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Pagination from '../components/Pagination'
import { usePermissions } from '../context/PermissionsContext'
import { useAuditLogs } from '../hooks/useAuditLogs'
import { useDataUpdates } from '../hooks/useDataUpdates'
import { downloadCsv, printTimestamp } from '../utils/print'
import { DATE_PRESETS, applyDatePresetChange } from '../utils/datePresets'
import { useProfileContext } from '../context/ProfileContext'

/* Reuses the same style tokens as Settings.jsx for visual consistency. */
const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const INPUT = `h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
// Native <input type="date"> calendar popups are OS-rendered and ignore
// normal CSS, but they do respect color-scheme  -  without this, the popup
// renders in the OS/browser's default (usually light) palette regardless
// of the app's dark theme, clashing against everything around it. Same
// fix Settings.jsx's date inputs already use.
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }

const ACTION_BADGE = {
  create: 'bg-status-success-bg text-status-success',
  update: 'bg-status-info-bg text-status-info',
  archive: 'bg-status-neutral-bg text-status-neutral',
  restore: 'bg-status-success-bg text-status-success',
  login: 'bg-status-success-bg text-status-success',
  failed_login: 'bg-status-danger-bg text-status-danger',
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}


// Renders a field-by-field before/after diff for one log entry. Both sides
// are optional (archive/restore log null values since they're pure status
// transitions, not field edits)  -  falls back to a plain message rather
// than an empty diff block.
function ValueDiff({ oldValues, newValues }) {
  if (!oldValues && !newValues) {
    return <p className="text-xs text-muted px-4 py-3">No field-level changes recorded for this event.</p>
  }

  const keys = Array.from(new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})]))

  return (
    <div className="px-4 py-3 space-y-1.5 bg-bg/50">
      {keys.map((key) => {
        const before = oldValues?.[key]
        const after = newValues?.[key]
        const changed = JSON.stringify(before) !== JSON.stringify(after)
        return (
          <div key={key} className="flex items-start gap-2 text-xs">
            <span className="w-36 shrink-0 font-medium text-muted">{key}</span>
            {changed ? (
              <span className="text-ink">
                <span className="text-red-500 line-through">{String(before ?? '—')}</span>
                {' → '}
                <span className="text-emerald-600">{String(after ?? '—')}</span>
              </span>
            ) : (
              <span className="text-muted">{String(after ?? before ?? '—')}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AuditLogs({ title = 'Audit Logs', crumbs = ['System', 'Audit Logs'] }) {
  // Gated on a dedicated permission string, same pattern the Settings page
  // already uses for Company Branding (settings.manage)  -  not tied to any
  // single module's own permission, since this view spans all of them.
  const { hasPermission, loading: permissionsLoading } = usePermissions()
  const { profile } = useProfileContext()
  const canView = hasPermission('audit-logs.view')

  const {
    logs, meta, modules, loading, error, fetchLogs, fetchModules,
    exportLogs, exporting, exportError,
  } = useAuditLogs()

  const [search, setSearch] = useState('')
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  // Date-range presets (All Time / Today / This Week / ... ) shared with every
  // other module's date filter. Hand-editing From/To flips the preset to
  // 'custom' so the dropdown never claims a period the inputs no longer match.
  const [datePreset, setDatePreset] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [page, setPage] = useState(1)

  const filters = useMemo(() => ({
    search: search.trim(),
    module,
    action,
    date_from: dateFrom,
    date_to: dateTo,
  }), [search, module, action, dateFrom, dateTo])

  useEffect(() => {
    if (canView) fetchModules()
  }, [canView, fetchModules])

  // Any filter change resets to page 1  -  otherwise narrowing the results
  // could leave the view stranded on a page that no longer exists.
  useEffect(() => {
    setPage(1)
  }, [filters])

  useEffect(() => {
    if (canView) fetchLogs(filters, page)
  }, [canView, filters, page, fetchLogs])

  // Live updates: audit entries are written on almost every data change,
  // so refresh whenever any module is touched  -  no reload needed.
  useDataUpdates(['*'], () => { if (canView) fetchLogs(filters, page) })

  const applyDatePreset = (key) => {
    const next = applyDatePresetChange(key)
    setDatePreset(next.datePreset)
    setDateFrom(next.dateFrom)
    setDateTo(next.dateTo)
  }

  const clearFilters = () => {
    setSearch(''); setModule(''); setAction(''); setDateFrom(''); setDateTo(''); setDatePreset('all')
  }

  const hasFilters = Boolean(search || module || action || dateFrom || dateTo)

  // Exports whatever the current filters match  -  including the date
  // range, if one is set  -  not just the current page. Mirrors
  // Settings.jsx's exportActivity(): fetch the full matching set via the
  // unpaginated endpoint, then build the CSV client-side.
  const handleExport = async () => {
    const result = await exportLogs(filters)
    if (!result.success) return

    const rows = [
      ['Date/Time', 'Module', 'Action', 'Description', 'User', 'Record ID', 'IP Address', 'Old Values', 'New Values'],
      ...result.data.map((log) => [
        formatDateTime(log.created_at),
        log.module,
        log.action,
        log.activity_description,
        log.user_name || '',
        log.record_id ?? '',
        log.ip_address || '',
        log.old_values ? JSON.stringify(log.old_values) : '',
        log.new_values ? JSON.stringify(log.new_values) : '',
      ]),
    ]

    const today = new Date().toISOString().slice(0, 10)
    const rangeSuffix = dateFrom || dateTo ? `_${dateFrom || 'start'}_to_${dateTo || 'now'}` : ''
    downloadCsv({
      filename: `audit-logs-${today}${rangeSuffix}.csv`,
      provenance: [
        ['Report', 'Audit Log Export'],
        ['Generated By', profile?.name || 'System'],
        ['Generated At', printTimestamp()],
        ['Period', dateFrom || 'Beginning' + (dateTo ? ` to ${dateTo}` : '')],
        ['Record Count', String(rows.length - 1)],
      ],
      rows,
    })
  }

  if (permissionsLoading) return null

  if (!canView) {
    return (
      <div className="max-w-3xl mx-auto py-10 text-center text-sm text-muted">
        You don't have permission to view audit logs.
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fadeIn pb-8">
      <Breadcrumb items={crumbs} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">System-wide record of who did what, and when.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Download}
          onClick={handleExport}
          loading={exporting}
          className="shrink-0 whitespace-nowrap"
        >
          Export
        </Button>
      </div>

      {exportError && (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">
          {exportError}
        </div>
      )}

      <div className={`${PANEL} p-4`}>
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
                placeholder="Search description, module, action…"
                className={`${INPUT} w-full pl-9 pr-9`}
                autoComplete="off"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-border hover:text-ink transition-colors duration-150">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          {/* Module */}
          <div className="w-full sm:w-44 shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Module</label>
            <select value={module} onChange={(e) => setModule(e.target.value)} className={INPUT}>
              <option value="">All modules</option>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {/* Action */}
          <div className="w-full sm:w-40 shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)} className={INPUT}>
              <option value="">All actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="archive">Archive</option>
              <option value="restore">Restore</option>
              <option value="login">Login</option>
              <option value="failed_login">Failed Login</option>
            </select>
          </div>
          {/* Period */}
          <div className="shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Period</label>
            <select
              value={datePreset}
              onChange={(e) => applyDatePreset(e.target.value)}
              aria-label="Period preset"
              className={`${INPUT} ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5' : ''}`}
              style={{ ...INPUT_TEXT_STYLE, width: '10.5rem' }}
            >
              {DATE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          {/* Date From */}
          <div className="shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDatePreset('custom'); setDateFrom(e.target.value) }}
              max={dateTo || undefined}
              aria-label="Date from"
              className={`${INPUT} scheme-light dark:scheme-dark ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5' : ''}`}
              style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
            />
          </div>
          {/* Date To */}
          <div className="shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDatePreset('custom'); setDateTo(e.target.value) }}
              min={dateFrom || undefined}
              aria-label="Date to"
              className={`${INPUT} scheme-light dark:scheme-dark ${datePreset === 'custom' ? 'border-primary/60 bg-primary/5' : ''}`}
              style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
            />
          </div>
          {/* Reset */}
          {hasFilters && (
            <div className="shrink-0">
              <Button variant="secondary" size="sm" icon={RotateCcw} iconPosition="left" onClick={clearFilters}>Reset</Button>
            </div>
          )}
        </div>
      </div>

      <div className={PANEL}>
        {loading ? (
          <p className="text-xs text-muted px-5 py-6 text-center">Loading audit logs…</p>
        ) : error ? (
          <p className="text-xs text-status-danger px-5 py-6 text-center">{error}</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-muted px-5 py-6 text-center">No audit log entries match these filters.</p>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((log) => {
              const isExpanded = expandedId === log.id
              const badgeClass = ACTION_BADGE[log.action] || 'text-muted bg-bg'
              return (
                <div key={log.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-bg transition-colors duration-150"
                  >
                    {isExpanded
                      ? <ChevronDown size={14} className="mt-0.5 shrink-0 text-muted" />
                      : <ChevronRight size={14} className="mt-0.5 shrink-0 text-muted" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badgeClass}`}>
                          {log.action}
                        </span>
                        <span className="text-xs font-medium text-ink">{log.module}</span>
                        {log.user_name && <span className="text-xs text-muted">by {log.user_name}</span>}
                      </div>
                      <p className="mt-1 text-sm text-ink truncate">{log.activity_description}</p>
                    </div>
                    <p className="shrink-0 text-[11px] text-muted whitespace-nowrap">{formatDateTime(log.created_at)}</p>
                  </button>
                  {isExpanded && <ValueDiff oldValues={log.old_values} newValues={log.new_values} />}
                </div>
              )
            })}
          </div>
        )}

        <Pagination
          page={meta.current_page}
          totalPages={meta.last_page}
          onPageChange={setPage}
          total={meta.total}
          label="audit log entries"
          bordered
        />
      </div>
    </div>
  )
}