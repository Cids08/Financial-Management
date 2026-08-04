import { useLocation } from 'react-router-dom'
import { Construction } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'

export default function PlaceholderPage({ title, crumbs }) {
  const location = useLocation()
  const pageTitle = title || location.pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <Breadcrumb items={crumbs || [pageTitle]} />
        <h1 className="text-2xl font-bold text-ink mt-1.5 tracking-tight capitalize">{pageTitle}</h1>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-xl bg-primary/15 flex items-center justify-center mb-4">
          <Construction size={26} className="text-primary-dark" />
        </div>
        <p className="text-base font-semibold text-ink capitalize">{pageTitle} module</p>
        <p className="text-sm text-muted mt-1.5 max-w-sm">
          This section is under development. Content for this module will appear here once configured.
        </p>
      </div>
    </div>
  )
}
