// Privacy Mode -  a module-level flag (synced from PrivacyContext) that makes
// formatCurrency mask every on-screen amount with the shared placeholder. This
// is what keeps masking consistent across EVERY page without threading a
// context into each call site: pages only need to re-render on toggle (their
// page-level usePrivacy() does that), and formatCurrency reads the flag at
// render time.
let privacymasking = false

export const MASKED_CURRENCY = '₱ ••••••'

export const setPrivacyMasking = (on) => {
  privacymasking = on
}

const realFormatCurrency = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value)

export const formatCurrency = (value) => (privacymasking ? MASKED_CURRENCY : realFormatCurrency(value))

// Documents, print-outs, CSV/PDF exports and official statements must show the
// REAL amounts even when Privacy Mode is on -  those are explicit "produce
// this record" actions, not on-screen browsing. Use formatCurrencyRaw there.
export const formatCurrencyRaw = realFormatCurrency

export const formatDate = (isoDate) =>
  new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

// Added for Budgets  -  timestamps like approved_at/created_at/updated_at
// need the time portion, which formatDate above doesn't include. Same
// locale/style convention as formatDate, just with hour/minute appended.
export const formatDateTime = (isoDate) => {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}