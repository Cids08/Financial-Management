import { useEffect, useMemo, useState } from 'react'
import { Search, CalendarRange, X, ChevronDown, ChevronRight, Download } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import { usePermissions } from '../context/PermissionsContext'
import { useAuditLogs } from '../hooks/useAuditLogs'

/* Reuses the same style tokens as Settings.jsx for visual consistency. */
const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const INPUT = `h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
// Native <input type="date"> calendar popups are OS-rendered and ignore
// normal CSS, but they do respect color-scheme — without this, the popup
// renders in the OS/browser's default (usually light) palette regardless
// of the app's dark theme, clashing against everything around it. Same
// fix Settings.jsx's date inputs already use.
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }

const ACTION_BADGE = {
  create: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10',
  update: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10',
  archive: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10',
  restore: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-500/10',
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Same CSV field-escaping rule as Settings.jsx's exportActivity — wrap in
// quotes and double up embedded quotes whenever the value contains a
// comma, quote, or newline, so e.g. a multi-line old/new value diff
// doesn't silently split into extra columns.
function csvField(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvField).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Renders a field-by-field before/after diff for one log entry. Both sides
// are optional (archive/restore log null values since they're pure status
// transitions, not field edits) — falls back to a plain message rather
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
  // already uses for Company Branding (settings.manage) — not tied to any
  // single module's own permission, since this view spans all of them.
  const { hasPermission, loading: permissionsLoading } = usePermissions()
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

  // Any filter change resets to page 1 — otherwise narrowing the results
  // could leave the view stranded on a page that no longer exists.
  useEffect(() => {
    setPage(1)
  }, [filters])

  useEffect(() => {
    if (canView) fetchLogs(filters, page)
  }, [canView, filters, page, fetchLogs])

  const clearFilters = () => {
    setSearch(''); setModule(''); setAction(''); setDateFrom(''); setDateTo('')
  }

  const hasFilters = Boolean(search || module || action || dateFrom || dateTo)

  // Exports whatever the current filters match — including the date
  // range, if one is set — not just the current page. Mirrors
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
    downloadCsv(`audit-logs-${today}${rangeSuffix}.csv`, rows)
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
          disabled={logs.length === 0}
          className="shrink-0 whitespace-nowrap"
        >
          Export
        </Button>
      </div>

      {exportError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {exportError}
        </div>
      )}

      <div className={`${PANEL} p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-50">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, module, action…"
              className={`${INPUT} w-full pl-8`}
            />
          </div>

          <select value={module} onChange={(e) => setModule(e.target.value)} className={INPUT}>
            <option value="">All modules</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          <select value={action} onChange={(e) => setAction(e.target.value)} className={INPUT}>
            <option value="">All actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="archive">Archive</option>
            <option value="restore">Restore</option>
          </select>

          <div className="flex items-center gap-1.5">
            <CalendarRange size={15} className="text-muted shrink-0" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
              aria-label="Date from"
              className={`${INPUT} scheme-light dark:scheme-dark`}
              style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
              aria-label="Date to"
              className={`${INPUT} scheme-light dark:scheme-dark`}
              style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
            />
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              aria-label="Clear filters"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div className={PANEL}>
        {loading ? (
          <p className="text-xs text-muted px-5 py-6 text-center">Loading audit logs…</p>
        ) : error ? (
          <p className="text-xs text-red-600 px-5 py-6 text-center">{error}</p>
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

        {meta.last_page > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted">
            <span>Page {meta.current_page} of {meta.last_page} · {meta.total} total</span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={meta.current_page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={meta.current_page >= meta.last_page}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}