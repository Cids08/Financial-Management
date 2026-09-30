import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react'

export default function DashboardCard({ title, value, icon: Icon, trend, trendLabel, trendPreference = 'increase', iconBg, onClick }) {
  const hasTrend = trend !== null && trend !== undefined && Number.isFinite(Number(trend))
  const numericTrend = hasTrend ? Number(trend) : null
  const isPositive = numericTrend >= 0
  const favorable = trendPreference === 'decrease' ? numericTrend < 0 : numericTrend > 0
  const clickable = typeof onClick === 'function'
  const Wrapper = clickable ? 'button' : 'div'

  return (
    <Wrapper
      type={clickable ? 'button' : undefined}
      onClick={onClick}
      className={`group relative flex min-w-0 w-full flex-col overflow-hidden text-left bg-surface rounded-2xl border border-border p-5 sm:p-6 shadow-card
        hover:border-primary/50 hover:shadow-dropdown transition-all duration-200 ease-in-out-smooth
        ${clickable ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted font-medium">{title}</p>
        <div className={`ml-2 shrink-0 h-10 w-10 rounded-xl flex items-center justify-center ${iconBg || 'bg-primary/10'}`}>
          <Icon size={16} className="text-ink" strokeWidth={2} />
        </div>
      </div>
      <p className="mt-3 text-[clamp(1.125rem,1.55vw,1.5rem)] font-bold tracking-tight text-ink tabular-nums break-words">{value}</p>

      <div className="flex items-center justify-between gap-2 mt-5 border-t border-border/70 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {hasTrend && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md ${
              numericTrend === 0
                ? 'text-status-neutral bg-status-neutral-bg'
                : favorable
                  ? 'text-status-success bg-status-success-bg'
                  : 'text-status-danger bg-status-danger-bg'
            }`}
          >
            {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(numericTrend)}%
          </span>
          )}
          <span className="text-xs text-muted">{trendLabel || (hasTrend ? 'vs previous period' : 'Current balance')}</span>
        </div>

        {clickable && (
          <ChevronRight
            size={14}
            className="shrink-0 text-muted transition-colors duration-200 group-hover:text-primary"
          />
        )}
      </div>
    </Wrapper>
  )
}
