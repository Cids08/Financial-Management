const statusStyles = {
  Paid: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Completed: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Pending: 'bg-primary/15 text-primary-dark',
  Processing: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Overdue: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  Failed: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
        statusStyles[status] || 'bg-gray-100 text-muted dark:bg-slate-800 dark:text-muted'
      }`}
    >
      {status}
    </span>
  )
}

export default function Table({ columns, data, onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap"
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
              className={`border-b border-border last:border-0 hover:bg-bg transition-colors duration-150 ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3.5 text-ink whitespace-nowrap">
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