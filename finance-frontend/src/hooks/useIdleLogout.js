import { useEffect, useRef, useCallback } from 'react'

const DEFAULT_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'click']

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
    // Element-level scrolls do NOT bubble to window, so the `scroll` event
    // alone missed a user scrolling a long table/modal body. Capture phase
    // on document catches every nested scroll.
    document.addEventListener('scroll', resetTimer, true)
    // Coming back to a backgrounded tab shouldn't be treated as idle -  the
    // timer kept running (and possibly fired) while the tab was hidden.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resetTimer()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', resetTimer)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      DEFAULT_EVENTS.forEach((evt) => window.removeEventListener(evt, resetTimer))
      document.removeEventListener('scroll', resetTimer, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', resetTimer)
    }
  }, [enabled, resetTimer])
}