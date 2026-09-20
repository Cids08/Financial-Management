// Privacy Mode -  a module-level flag (synced from PrivacyContext) that makes
// formatCurrency mask every on-screen amount with the shared placeholder. This
// is what keeps masking consistent across EVERY page without threading a
// context into each call site: pages only need to re-render on toggle (their
// page-level usePrivacy() does that), and formatCurrency reads the flag at
// render time.
let privacymasking = false

// Company-wide currency (from Settings via CompanyContext). Module-level so
// every formatCurrency call site honours the setting without threading a
// context into each one — same pattern as privacy masking below.
//
// `activeBaseCurrency` is the currency amounts are STORED in (Settings ->
// Base Currency). `activeCurrency` is what they're DISPLAYED in. When they
// differ, a value is divided by activeExchangeRates[activeCurrency] before
// formatting, where the rate is the number of BASE units one unit of that
// currency is worth (e.g. 1 USD = 59 PHP -> rate 59). Stored values are
// never modified.
let activeCurrency = 'PHP'
let activeBaseCurrency = 'PHP'
let activeExchangeRates = {}

export const setActiveConversion = ({ currency, baseCurrency, exchangeRates } = {}) => {
  activeCurrency = currency || 'PHP'
  activeBaseCurrency = baseCurrency || 'PHP'
  activeExchangeRates = exchangeRates && typeof exchangeRates === 'object' ? exchangeRates : {}
}

export const getActiveCurrency = () => activeCurrency

export const getActiveBaseCurrency = () => activeBaseCurrency

// Locale-neutral symbols so every environment renders the same glyph
// (Intl's en-PH locale shows e.g. "SGD" instead of "S$", and narrowSymbol
// collapses A$/S$/USD all to "$"). Extend this map when adding a currency.
const CURRENCY_SYMBOLS = {
  PHP: '₱',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  GBP: '£',
  AUD: 'A$',
  SGD: 'S$',
}

export const currencySymbol = (currency = activeCurrency) => {
  const code = (currency || 'PHP').toUpperCase()
  if (CURRENCY_SYMBOLS[code]) return CURRENCY_SYMBOLS[code]
  try {
    return (
      (0)
        .toLocaleString('en-PH', { style: 'currency', currency: code, minimumFractionDigits: 0 })
        .replace(/[0-9.,\s\u00a0-]/g, '') || code
    )
  } catch {
    return code
  }
}

/** Privacy placeholder for the active (display) currency, e.g. "₱ ••••••". */
export const maskedAmount = (currency = activeCurrency) => `${currencySymbol(currency)} ••••••`

export const setPrivacyMasking = (on) => {
  privacymasking = on
}

/** Converts a stored (base-currency) value into the requested display currency. */
export const convertAmount = (value, currency = activeCurrency) => {
  const amount = Number(value) || 0
  if (!currency || currency === activeBaseCurrency) return amount
  const rate = Number(activeExchangeRates?.[currency])
  return Number.isFinite(rate) && rate > 0 ? amount / rate : amount
}

const realFormatCurrency = (value, currency = activeCurrency) => {
  const amount = convertAmount(value, currency)
  const sign = amount < 0 ? '-' : ''
  const body = Math.abs(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}${currencySymbol(currency)}${body}`
}

export const formatCurrency = (value, currency = activeCurrency) =>
  privacymasking ? maskedAmount(currency) : realFormatCurrency(value, currency)

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