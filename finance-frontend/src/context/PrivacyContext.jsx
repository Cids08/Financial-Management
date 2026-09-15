import { createContext, useContext, useState } from 'react'
import { setPrivacyMasking } from '../utils/formatters'

const PrivacyContext = createContext(null)

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

  const togglePrivacy = () => setPrivacyOn((prev) => {
    const next = !prev
    setPrivacyMasking(next)
    try { localStorage.setItem('privacyMode', next ? 'on' : 'off') } catch {}
    return next
  })

  return (
    <PrivacyContext.Provider value={{ privacyOn, togglePrivacy }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext)
  if (!ctx) throw new Error('usePrivacy must be used within a PrivacyProvider')
  return ctx
}