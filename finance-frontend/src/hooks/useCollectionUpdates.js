import { useEffect, useRef } from 'react'
import { getEcho } from '../utils/echo'

/**
 * Subscribes to the private-collections channel and calls `onUpdate`
 * whenever a collection.status.changed event arrives  -  i.e. when any
 * user confirms or cancels a collection.
 *
 * The callback should be refetch() from useCollections so the page
 * re-fetches the full list rather than trying to patch local state with
 * the minimal broadcast payload.
 *
 * Usage:
 *   useCollectionUpdates(refetch)
 *
 * onUpdate is kept in a ref (like useDataUpdates) so the listener always
 * calls the LATEST refetch -  not the first-render one, which would close
 * over stale filters like `trashed` and silently reload the un-trashed
 * list on top of the archived view.
 */
export function useCollectionUpdates(onUpdate) {
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    const echo    = getEcho()
    const channel = echo.private('collections')

    // broadcastAs() in CollectionStatusChanged returns 'collection.status.changed',
    // which Laravel Echo prefixes with a dot when listening  -  hence '.collection.status.changed'.
    const handler = () => onUpdateRef.current()

    channel.listen('.collection.status.changed', handler)

    return () => {
      // stopListening only (same as useDataUpdates): leave() tears the
      // channel object down out of Echo's cache entirely, which could kill
      // a subscription another component still relies on. The captured
      // `echo`/`channel` are used here (never a fresh getEcho()) so a
      // disconnect that already nulled the module singleton isn't undone
      // by this cleanup constructing a brand-new socket.
      channel.stopListening('.collection.status.changed', handler)
    }
  }, [])
}