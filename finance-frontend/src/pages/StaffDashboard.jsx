import { ClipboardList } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'

export default function StaffDashboard({ title = 'Dashboard', crumbs = ['Dashboard'] }) {
  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">Your day-to-day overview.</p>
      </div>

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col items-center justify-center gap-3 py-16 text-center`}>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary-dark">
          <ClipboardList size={22} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink">Staff dashboard coming soon</p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            This will show the tasks, records, and shortcuts relevant to your role — same idea as the Collector dashboard, tailored for Staff.
          </p>
        </div>
      </div>
    </div>
  )
}