import { Skeleton } from './LoadingSkeleton'

/** Preserve the shape of modal content while its request is in flight. */
export default function ModalLoading({ variant = 'list', label = 'Loading details' }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="min-w-0 space-y-4 py-2">
      <span className="sr-only">{label}</span>
      {variant === 'chart' ? (
        <div aria-hidden="true" className="rounded-xl border border-border bg-bg p-4">
          <div className="flex items-center justify-between gap-4"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-16" /></div>
          <div className="mt-5 flex h-44 items-end gap-3 border-b border-l border-border px-3 pb-2 sm:gap-5">
            {['h-2/5', 'h-3/5', 'h-1/2', 'h-4/5', 'h-3/5', 'h-5/6'].map((height, i) => <Skeleton key={i} className={'min-w-0 flex-1 rounded-t-md ' + height} />)}
          </div>
          <div className="mt-3 flex justify-around gap-3">{[0,1,2,3].map(i => <Skeleton key={i} className="h-2 w-10" />)}</div>
        </div>
      ) : variant === 'statement' ? (
        <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0,1,2].map(i => <div key={i} className="rounded-xl border border-border bg-bg p-4"><Skeleton className="h-3 w-3/4" /><Skeleton className="mt-3 h-6 w-full" /></div>)}
        </div>
      ) : null}
      <div aria-hidden="true" className="divide-y divide-border rounded-xl border border-border bg-surface">
        {Array.from({ length: variant === 'chart' ? 2 : 3 }, (_, i) => (
          <div key={i} className="flex min-w-0 items-center gap-3 p-4">
            {variant === 'list' && <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />}
            <div className="min-w-0 flex-1"><Skeleton className="h-3 w-3/4" /><Skeleton className="mt-2 h-2 w-1/2" /></div>
            <Skeleton className="h-6 w-12 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
