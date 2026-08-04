import { Search } from 'lucide-react'

export default function SearchBar({ className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
      />
      <input
        type="text"
        placeholder="Search transactions, customers, invoices..."
        className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-bg text-sm
          text-ink placeholder:text-muted
          focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
          transition-all duration-150"
      />
    </div>
  )
}
