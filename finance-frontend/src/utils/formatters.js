export const formatCurrency = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(value)

export const formatDate = (isoDate) =>
  new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

// Added for Budgets — timestamps like approved_at/created_at/updated_at
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