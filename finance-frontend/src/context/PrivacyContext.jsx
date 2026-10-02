import { createContext, useContext, useEffect, useState } from 'react'
import { setPrivacyMasking } from '../utils/formatters'
import { syncPushPrivacy } from '../utils/pushNotifications'

const PrivacyContext = createContext(null)

const TOGGLE_COOLDOWN_MS = 750

export function PrivacyProvider({ children }) {
  const [privacyOn, setPrivacyOn] = useState(() => {
    const stored = (() => {
      try {
        return localStorage.getItem('privacyMode') !== 'off'
      } catch {
        return true
      }
    })()
    // Prime the formatter flag on first mount too, so the page's initial
    // paint is already masked (not just after the effect runs).
    setPrivacyMasking(stored)
    return stored
  })

  // Rate-limit guard: once toggled, ignore further clicks until the
  // cooldown window has elapsed.
  const [cooldownUntil, setCooldownUntil] = useState(0)

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const id = setTimeout(() => setCooldownUntil(0), cooldownUntil - Date.now())
    return () => clearTimeout(id)
  }, [cooldownUntil])

  const cooldownActive = cooldownUntil > Date.now()

  const togglePrivacy = () => {
    if (cooldownUntil > Date.now()) return
    setCooldownUntil(Date.now() + TOGGLE_COOLDOWN_MS)

    // Everything below is a side effect  -  it must NOT live inside the
    // setState updater. Updaters are supposed to be pure; React.StrictMode
    // double-invokes them in dev, and React may replay them after discarding
    // a render. Doing I/O there used to fire TWO push syncs per toggle and
    // could leave localStorage + the server subscription disagreeing with
    // the committed state. Compute next from the render-time value instead
    // (safe: the cooldown guard above makes this effectively single-click).
    const next = !privacyOn
    setPrivacyOn(next)
    setPrivacyMasking(next)
    try { localStorage.setItem('privacyMode', next ? 'on' : 'off') } catch {}
    // Keep OS push toasts in step with the toggle (redact amounts/names
    // from the screen when Privacy Mode is on). Best-effort, no await.
    syncPushPrivacy(next)
  }

  return (
    <PrivacyContext.Provider value={{ privacyOn, togglePrivacy, cooldownActive }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext)
  if (!ctx) throw new Error('usePrivacy must be used within a PrivacyProvider')
  return ctx
}