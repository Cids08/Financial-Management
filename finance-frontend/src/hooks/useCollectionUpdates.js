import { useEffect } from 'react'
import { getEcho } from '../utils/echo'

/**
 * Subscribes to the private-collections channel and calls `onUpdate`
 * whenever a collection.status.changed event arrives — i.e. when any
 * user confirms or cancels a collection.
 *
 * The callback should be refetch() from useCollections so the page
 * re-fetches the full list rather than trying to patch local state with
 * the minimal broadcast payload.
 *
 * Usage:
 *   useCollectionUpdates(refetch)
 *
 * The channel is left unconditionally — Echo's authorizer will deny
 * unauthenticated sockets at the Reverb level before any event fires.
 *
 * Cleanup: the channel is left (unsubscribed) when the component that
 * uses this hook unmounts, so no stale listeners accumulate across
 * page navigations.
 */
export function useCollectionUpdates(onUpdate) {
  useEffect(() => {
    const echo    = getEcho()
    const channel = echo.private('collections')

    // broadcastAs() in CollectionStatusChanged returns 'collection.status.changed',
    // which Laravel Echo prefixes with a dot when listening — hence '.collection.status.changed'.
    channel.listen('.collection.status.changed', () => {
      onUpdate()
    })

    return () => {
      echo.leave('collections')
    }
  }, []) // onUpdate is refetch() from useCollections — stable ref, no dep needed
}