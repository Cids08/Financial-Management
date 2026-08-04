import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react'

export default function DashboardCard({ title, value, icon: Icon, trend, trendLabel, iconBg, onClick }) {
  const isPositive = trend >= 0
  const clickable = typeof onClick === 'function'
  const Wrapper = clickable ? 'button' : 'div'

  return (
    <Wrapper
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      className={`group w-full text-left bg-surface rounded-xl border border-border p-5 shadow-card
        hover:shadow-dropdown hover:-translate-y-0.5 transition-all duration-200 ease-in-out-smooth
        ${clickable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted font-medium truncate">{title}</p>
          <p className="text-2xl font-bold text-ink mt-2 tracking-tight">{value}</p>
        </div>
        <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${iconBg || 'bg-primary/15'}`}>
          <Icon size={20} className="text-ink" strokeWidth={2} />
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-1">
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md ${
              isPositive
                ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10'
                : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10'
            }`}
          >
            {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(trend)}%
          </span>
          <span className="text-xs text-muted">{trendLabel || 'vs last month'}</span>
        </div>

        {clickable && (
          <ChevronRight
            size={14}
            className="shrink-0 text-border opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:text-primary"
          />
        )}
      </div>
    </Wrapper>
  )
}