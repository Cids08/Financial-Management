import { useEffect, useRef, useCallback } from 'react'

const DEFAULT_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

export function useIdleLogout({ onIdle, timeoutMinutes = 5, enabled = true }) {
  const timerRef = useRef(null)

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!enabled) return
    timerRef.current = setTimeout(onIdle, timeoutMinutes * 60 * 1000)
  }, [onIdle, timeoutMinutes, enabled])

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    resetTimer()
    DEFAULT_EVENTS.forEach((evt) => window.addEventListener(evt, resetTimer))
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      DEFAULT_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer))
    }
  }, [enabled, resetTimer])
}