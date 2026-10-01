export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={'skeleton block rounded-md ' + className} />
}
export function TableSkeleton({ columns = 5, rows = 5 }) {
  return Array.from({ length: rows }, (_, row) => <tr key={row} aria-label={row === 0 ? 'Loading records' : undefined} aria-busy="true" className="border-b border-border last:border-0">{Array.from({ length: columns }, (_, col) => <td key={col} className="px-4 py-4"><Skeleton className={col === 0 ? 'h-3 w-4/5' : 'h-3 w-3/5'} /><Skeleton className="mt-2 h-2 w-1/2" /></td>)}</tr>)
}
export function ContentSkeleton({ rows = 3 }) {
  return <div role="status" aria-label="Loading content" className="space-y-4 p-5"><span className="sr-only">Loading content</span>{Array.from({ length: rows }, (_, i) => <div key={i}><Skeleton className="h-3 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" /></div>)}</div>
}
export function PageSkeleton() {
  return <div role="status" aria-label="Loading workspace" className="space-y-6"><span className="sr-only">Loading workspace</span><Skeleton className="h-7 w-52" /><Skeleton className="h-3 w-2/3" /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(i=><div key={i} className="rounded-xl border border-border bg-surface p-5"><Skeleton className="h-3 w-24" /><Skeleton className="mt-4 h-7 w-32" /></div>)}</div><div className="rounded-xl border border-border bg-surface"><ContentSkeleton rows={5} /></div><div className="grid gap-4 sm:grid-cols-2">{[0,1].map(i=><div key={i} className="rounded-xl border border-border bg-surface p-5"><Skeleton className="h-4 w-36" /><Skeleton className="mt-6 h-40 w-full" /></div>)}</div></div>
}
