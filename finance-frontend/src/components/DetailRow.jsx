/** Consistent label/value alignment in financial detail dialogs. */
export default function DetailRow({ label, value }) {
  return <div className="detail-row py-2">
    <span className="text-xs text-muted">{label}</span>
    <span className="detail-value text-xs font-medium text-ink">{value ?? '\u2014'}</span>
  </div>
}
