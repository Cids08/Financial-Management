import { useMemo } from 'react'
import { Timer } from 'lucide-react'
import { useCompany } from '../context/CompanyContext'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Shows how long until the retention purge permanently deletes an ARCHIVED
 * record: "Auto-purge in 27d" counting down from the retention window
 * (settings.dataRetentionDays, default 3650 = BIR books-of-accounts).
 *
 * Renders nothing for active records (no deleted_at). Because restoring a
 * record clears deleted_at, the badge simply disappears on restore — the
 * countdown effectively resets to a fresh window if the record is archived
 * again.
 */
export default function RetentionCountdown({ deletedAt, compact = false, className = '' }) {
  const { dataRetentionDays } = useCompany()

  const state = useMemo(() => {
    const retention = Number(dataRetentionDays)
    if (!retention || !deletedAt) return null

    const archived = new Date(deletedAt).getTime()
    if (Number.isNaN(archived)) return null

    const remainingMs = archived + retention * DAY_MS - Date.now()
    const days = Math.ceil(remainingMs / DAY_MS)

    if (days > 90) return { days, label: `Auto-purge in ${days}d`, tone: 'calm' }
    if (days > 30) return { days, label: `Auto-purge in ${days}d`, tone: 'warn' }
    if (days > 0) return { days, label: `Auto-purge in ${days}d`, tone: 'due' }
    return { days, label: 'Awaiting auto-purge', tone: 'due' }
  }, [deletedAt, dataRetentionDays])

  if (!state) return null

  const tones = {
    calm: 'bg-bg text-muted border border-border',
    warn: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
    due: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  }

  return (
    <span
      title={`${compact ? 'Auto-purge' : 'Permanently deleted'} ${state.days > 0 ? `in ~${state.days} days ` : ''}by the privacy retention policy`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[state.tone]} ${className}`}
    >
      <Timer size={11} className="shrink-0" />
      {/* Compact form for table rows: the full "Auto-purge in 3650d" label is
          wide enough to shove the neighbouring Status cell out of the table
          on narrower screens. The full wording stays in the tooltip. */}
      {compact ? `${state.days > 0 ? `${state.days}d` : 'Purge'}` : state.label}
    </span>
  )
}