import { Skeleton } from './LoadingSkeleton'

export default function KpiValue({ loading, children }) {
  return loading ? <span role="status" aria-label="Loading metric" aria-busy="true" className="block min-w-0 py-0.5"><span className="sr-only">Loading metric</span><Skeleton className="h-6 w-24 max-w-full" /></span> : children
}
