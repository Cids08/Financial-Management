/**
 * Shared date-range presets for list filters.
 *
 * Ported out of Generalledger.jsx, which was the only page with this filter.
 * Generalized so every module that filters by date gets the same behaviour.
 *
 * WHY THIS FILE EXISTS INSTEAD OF `d.toISOString().slice(0, 10)`:
 * `toISOString()` serializes to UTC, but the dates being formatted are built
 * from local-timezone components (`new Date(y, m, d)` = local midnight). In
 * any timezone, local midnight is *behind* UTC, so slicing the ISO string
 * returns the PREVIOUS day. Concretely, "Today" in Asia/Manila resolved to
 * 2026-09-26 when the local date was 2026-09-27, which silently filtered the
 * ledger to yesterday. Verified with node across Asia/Manila, Asia/Tokyo,
 * UTC and America/New_York - all four were off by one.
 */

/** Formats a Date from its LOCAL calendar parts. Never use toISOString here. */
export const toISODate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const DATE_PRESETS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom Range' },
]

/**
 * Returns { from, to } for a preset key, anchored to now. Either value can be
 * '' meaning "unbounded". 'week' is Sunday-start to match the original
 * GeneralLedger behaviour; change `start.setDate(day.getDate() - day.getDay())`
 * to `- ((day.getDay() + 6) % 7)` for Monday-start.
 */
export function resolveDatePreset(key, now = new Date()) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  switch (key) {
    case 'today': {
      const day = startOfDay(now)
      return { from: toISODate(day), to: toISODate(day) }
    }
    case 'week': {
      const day = startOfDay(now)
      const start = new Date(day)
      start.setDate(day.getDate() - day.getDay()) // back to Sunday
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3
      const start = new Date(now.getFullYear(), qStartMonth, 1)
      const end = new Date(now.getFullYear(), qStartMonth + 3, 0)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'year': {
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'all':
    case 'custom':
    default:
      return { from: '', to: '' }
  }
}

/**
 * The reducer for preset-driven filter state. Hand-rolled instead of
 * useReducer because every page already keeps dateFrom/dateTo in local state
 * and the wiring differs slightly per module.
 *
 * - selecting a preset overwrites the range
 * - editing a date field switches the preset to 'custom' so the UI stops
 *   claiming a named period that no longer matches the inputs
 * - 'all' and 'custom' both clear the range; 'custom' is only ever reached by
 *   hand-editing the fields, never by picking it from the dropdown
 */
export function applyDatePresetChange(key) {
  const { from, to } = resolveDatePreset(key)
  return { datePreset: key === 'all' ? 'all' : key, dateFrom: from, dateTo: to }
}

export const CUSTOM_RANGE = { datePreset: 'custom' }

/** True when a named preset is no longer active, so the inputs must read as custom. */
export const isCustomRange = (preset) => preset === 'custom'
