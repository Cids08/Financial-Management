import { currencySymbol, getActiveBaseCurrency } from './formatters'

// Business-policy amount floors for a crane/trucking client. These mirror
// finance-backend/config/business.php — keep the two in sync so the API
// validation and the frontend inputs never disagree on what's allowed.
export const MIN_INVOICE_AMOUNT = 1000
export const MIN_COLLECTION_AMOUNT = 500

// Money inputs hold BASE-currency values (amounts are entered/stored in the
// base currency and only converted for display), so the floor is shown in
// the base currency too — otherwise a user in USD display mode would read
// "$18.00" and type 18, which would be stored as 18 base units.
export const formatBaseAmount = (amount) =>
  `${currencySymbol(getActiveBaseCurrency())}${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

// Placeholder text for money inputs so the user can see the floor up front
// instead of a meaningless "0.00".
export const minHint = (amount) => `Min ${formatBaseAmount(amount)}`