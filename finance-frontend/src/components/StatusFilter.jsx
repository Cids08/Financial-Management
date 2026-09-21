import { memo } from 'react'

export default memo(function StatusFilter({ items, value, onChange, className = '' }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Status filter"
      className={`border border-border rounded-lg bg-bg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors duration-150 dark:bg-bg-dark dark:border-border-dark dark:text-ink-light scheme-light dark:scheme-dark ${className}`}
      style={{ borderRadius: '0.5rem', minHeight: '2.25rem' }}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>{item.label}</option>
      ))}
    </select>
  )
})
