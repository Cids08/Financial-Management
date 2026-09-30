import { Check, Clock3, CircleAlert, LoaderCircle } from 'lucide-react'

const statusStyles = {
  Paid: { className: 'bg-status-success-bg text-status-success border-status-success-border', icon: Check },
  Completed: { className: 'bg-status-success-bg text-status-success border-status-success-border', icon: Check },
  Approved: { className: 'bg-status-success-bg text-status-success border-status-success-border', icon: Check },
  Ready: { className: 'bg-status-success-bg text-status-success border-status-success-border', icon: Check },
  Posted: { className: 'bg-status-success-bg text-status-success border-status-success-border', icon: Check },
  Confirmed: { className: 'bg-status-success-bg text-status-success border-status-success-border', icon: Check },
  Pending: { className: 'bg-status-warning-bg text-status-warning border-status-warning-border', icon: Clock3 },
  'Partially Paid': { className: 'bg-status-warning-bg text-status-warning border-status-warning-border', icon: Clock3 },
  Processing: { className: 'bg-status-info-bg text-status-info border-status-info-border', icon: LoaderCircle },
  'In Progress': { className: 'bg-status-info-bg text-status-info border-status-info-border', icon: LoaderCircle },
  Overdue: { className: 'bg-status-danger-bg text-status-danger border-status-danger-border', icon: CircleAlert },
  Failed: { className: 'bg-status-danger-bg text-status-danger border-status-danger-border', icon: CircleAlert },
  Rejected: { className: 'bg-status-danger-bg text-status-danger border-status-danger-border', icon: CircleAlert },
}

function StatusBadge({ status }) {
  const { className, icon: Icon } = statusStyles[status] || { className: 'bg-status-neutral-bg text-status-neutral border-status-neutral-border' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-md text-xs font-semibold ${className}`}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {status}
    </span>
  )
}

export default function Table({ columns, data, onRowClick }) {
  return (
    <div className="overflow-x-auto rounded-t-2xl">
      <table className="w-full text-sm">
        <thead className="bg-bg/80">
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${col.key === 'amount' ? 'text-right' : 'text-left'} font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(row)}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onRowClick(row)
                }
              } : undefined}
              className={`border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {columns.map((col) => (
                <td key={col.key} className={`px-4 py-4 text-ink whitespace-nowrap ${col.key === 'amount' ? 'text-right' : ''}`}>
                  {col.key === 'status' ? (
                    <StatusBadge status={row[col.key]} />
                  ) : col.key === 'amount' ? (
                    <span className="font-medium tabular-nums">{row[col.key]}</span>
                  ) : col.key === 'reference' ? (
                    <span className="font-mono text-xs text-muted">{row[col.key]}</span>
                  ) : (
                    row[col.key]
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
