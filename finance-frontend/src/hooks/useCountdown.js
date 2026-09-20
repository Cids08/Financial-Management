import { useEffect, useState } from 'react'

// Ticks down to an absolute expiry timestamp (ms since epoch) and reports
// the whole seconds remaining (never below 0). The value is derived during
// render so a newly-issued code (new expiresAt) is reflected immediately,
// without a one-frame "expired" flash; the interval only forces re-renders
// once per second while there's time left.
function secondsUntil(expiresAt) {
  if (!expiresAt) return 0
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
}

export function useCountdown(expiresAt) {
  const [, forceTick] = useState(0)
  const remaining = secondsUntil(expiresAt)

  useEffect(() => {
    if (!expiresAt || secondsUntil(expiresAt) <= 0) return undefined

    const id = setInterval(() => {
      forceTick((t) => t + 1)
      if (secondsUntil(expiresAt) <= 0) clearInterval(id)
    }, 1000)

    return () => clearInterval(id)
  }, [expiresAt])

  return remaining
}

export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
