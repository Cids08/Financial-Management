import { useEffect, useRef } from 'react'
import { getEcho } from '../utils/echo'

/**
 * Subscribes to the shared private-data channel and calls `onUpdate`
 * whenever a data.updated event arrives for one of the given modules.
 *
 * The shared channel carries module/action slugs only (no row data), so
 * this is a refetch signal: onUpdate should re-fetch the page's data via
 * the normal API, which applies its own permission checks.
 *
 * Usage:
 *   useDataUpdates(['customers', 'suppliers'], () => refetch())
 *
 * Pass the same module array on every call (pass a stable array or use
 * useMemo) — modules are serialised into the effect's dependency array.
 *
 * The channel is a single shared, long-lived subscription (many modules
 * multiplex over it), so cleanup only removes this hook's listener — the
 * channel itself is not torn down, keeping other subscribers intact.
 */
export function useDataUpdates(modules, onUpdate) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const moduleKey = modules.join(',') || '*'

  useEffect(() => {
    const echo    = getEcho()
    const channel = echo.private('data')

    const handler = (event) => {
      if (!event || typeof event.module !== 'string') return
      const wanted = moduleKey.split(',')
      if (!wanted.includes('*') && !wanted.includes(event.module)) return

      onUpdateRef.current(event)
    }

    channel.listen('.data.updated', handler)

    return () => {
      channel.stopListening('.data.updated', handler)
    }
  }, [moduleKey])
}

/**
 * Convenience wrapper for pages that should refetch on ANY module change
 * (e.g. the dashboards, which aggregate everything).
 */
export function useAllDataUpdates(onUpdate) {
  useDataUpdates(['*'], onUpdate)
}