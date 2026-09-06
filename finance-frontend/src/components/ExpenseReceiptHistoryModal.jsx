import { useEffect, useState } from 'react'
import { FileText, Eye, Loader2, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import Tooltip from './Tooltip'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Props:
 * - open, onClose: standard Modal controls
 * - expense: the expense whose receipt history is shown (uses expense.id, expense.description)
 * - fetchHistory: async (expenseId) => { success, data, message }
 * - onView: async (expenseId, documentId, targetWindow?) => { success, message } —
 *   opens the version inline in a new tab (see useExpenses.js's
 *   viewReceiptVersion). Only PDFs/images actually render inline in most
 *   browsers — same limitation BudgetPlanHistoryModal notes, though for
 *   receipts (PDF/JPG/PNG only) this should basically always preview
 *   inline in practice.
 */
export default function ExpenseReceiptHistoryModal({ open, onClose, expense, fetchHistory, onView }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewingId, setViewingId] = useState(null)

  useEffect(() => {
    if (!open || !expense) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetchHistory(expense.id).then((result) => {
      if (cancelled) return
      if (result.success) {
        setDocuments(result.data)
      } else {
        setError(result.message)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, expense, fetchHistory])

  const handleView = async (doc) => {
    // Open the tab SYNCHRONOUSLY, before the await below — same reasoning
    // as BudgetPlanHistoryModal's handleView(): browsers only reliably
    // allow window.open() to bypass the popup blocker when it's a direct
    // result of the click event, not after an async fetch has already
    // resolved.
    const targetWindow = window.open('', '_blank')
    setViewingId(doc.id)
    const result = await onView(expense.id, doc.id, targetWindow)
    setViewingId(null)
    if (!result.success) {
      setError(result.message)
    } else if (!result.viewedInline) {
      setError("This file type can't be previewed in-browser, so it's been downloaded instead.")
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Receipt History"
      footer={<Button variant="secondary" size="md" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-3">
        {expense && (
          <p className="text-xs text-muted">
            Every receipt attached to <span className="font-medium text-ink">{expense.description}</span>, newest first. Re-uploading a receipt adds a new version here rather than replacing the old one.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading history...
          </div>
        ) : documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No receipt has been attached to this expense yet.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {documents.map((doc, index) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                    <FileText size={16} className="text-primary-dark" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink" title={doc.original_name}>
                      {doc.original_name}
                      {index === 0 && <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">Current</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(doc.uploaded_at)}
                      {doc.uploaded_by_name && ` · ${doc.uploaded_by_name}`}
                      {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''}
                    </p>
                  </div>
                </div>
                {doc.has_file ? (
                  <Tooltip label="View this version">
                    <button
                      type="button"
                      onClick={() => handleView(doc)}
                      disabled={viewingId === doc.id}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink transition-colors duration-150 disabled:opacity-50"
                    >
                      {viewingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                    </button>
                  </Tooltip>
                ) : (
                  <span className="shrink-0 text-xs text-muted">No file</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}