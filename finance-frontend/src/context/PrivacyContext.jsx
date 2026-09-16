import { createContext, useContext, useEffect, useState } from 'react'
import { setPrivacyMasking } from '../utils/formatters'

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
    setPrivacyOn((prev) => {
      const next = !prev
      setPrivacyMasking(next)
      try { localStorage.setItem('privacyMode', next ? 'on' : 'off') } catch {}
      return next
    })
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