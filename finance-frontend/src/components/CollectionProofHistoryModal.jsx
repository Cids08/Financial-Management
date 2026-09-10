import { useEffect, useRef, useState } from 'react'
import { FileText, Eye, Upload, Loader2, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import Tooltip from './Tooltip'
import { apiFetch } from '../utils/api'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Proof-of-receipt upload history modal for a collection.
 *
 * Matches BudgetPlanHistoryModal's pattern exactly:
 * - Lists all uploaded proofs newest-first
 * - First item tagged "Current"
 * - Re-uploading adds a new version rather than replacing
 * - View button opens the file in a new tab (PDF renders inline;
 *   images render inline; other types download — browser limitation)
 *
 * Props:
 *   open        — boolean
 *   onClose     — () => void
 *   collection  — { id, receipt_number } — the collection whose proofs to show
 *   onUploaded  — () => void — called after a successful upload so the
 *                 parent can refetch if needed
 */
export default function CollectionProofHistoryModal({ open, onClose, collection, onUploaded }) {
  const [documents,  setDocuments]  = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [viewingId,  setViewingId]  = useState(null)
  const [uploading,  setUploading]  = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open || !collection) return
    let cancelled = false
    setLoading(true)
    setError('')
    apiFetch(`/api/collections/${collection.id}/proof`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        if (!json.success) throw new Error(json.message || 'Failed to load proof history.')
        setDocuments(json.data)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, collection])

  const handleView = async (doc) => {
    // Open synchronously before the async fetch — browsers only allow
    // window.open() to bypass the popup blocker when it's a direct result
    // of a click event. Same pattern as BudgetPlanHistoryModal.
    const targetWindow = window.open('', '_blank')
    setViewingId(doc.id)
    setError('')

    try {
      const res  = await apiFetch(`/api/collections/${collection.id}/proof/${doc.id}/view`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)

      if (doc.mime_type === 'application/pdf' || doc.mime_type?.startsWith('image/')) {
        targetWindow.location.href = url
      } else {
        // Non-previewable type — download instead and close the blank tab
        targetWindow.close()
        const a = document.createElement('a')
        a.href = url
        a.download = doc.original_name
        a.click()
        URL.revokeObjectURL(url)
        setError("This file type can't be previewed in-browser, so it's been downloaded instead.")
      }
    } catch (err) {
      targetWindow?.close()
      setError(err.message || 'Failed to open file.')
    } finally {
      setViewingId(null)
    }
  }

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('proof', file)

    try {
      const res  = await apiFetch(`/api/collections/${collection.id}/proof`, {
        method: 'POST',
        body:   formData,
      })
      const json = await res.json()
      if (!json.success) throw new Error(Object.values(json.errors ?? {})[0]?.[0] || json.message)

      // Prepend new document to list so it shows as "Current"
      setDocuments((prev) => [{ ...json.data, uploaded_by_name: null }, ...prev])
      onUploaded?.()
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Proof of Receipt"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          {/* Upload trigger — hidden file input, button opens it (only allowed for Pending collections) */}
          {collection?.status === 'Pending' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
              <Button
                variant="secondary"
                size="md"
                icon={uploading ? Loader2 : Upload}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Upload Proof'}
              </Button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Confirmed & locked — proof uploads disabled
            </span>
          )}
          <Button variant="secondary" size="md" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {collection && (
          <p className="text-xs text-muted">
            All proofs attached to receipt{' '}
            <span className="font-medium text-ink">{collection.receipt_number}</span>,
            newest first. {collection.status === 'Pending'
              ? 'Re-uploading adds a new version rather than replacing the previous one. Accepted formats: PDF, JPG, PNG (max 10MB).'
              : 'This collection is confirmed and financial journals are posted; proof attachments are locked.'}
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
            <Loader2 size={16} className="animate-spin" /> Loading history…
          </div>
        ) : documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No proof has been attached to this collection yet.
          </p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {documents.map((doc, index) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                    <FileText size={16} className="text-primary-dark" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink" title={doc.original_name}>
                      {doc.original_name}
                      {index === 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                          Current
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(doc.uploaded_at)}
                      {doc.uploaded_by_name && ` · ${doc.uploaded_by_name}`}
                      {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''}
                    </p>
                  </div>
                </div>
                {doc.has_file ? (
                  <Tooltip label="View this proof">
                    <button
                      type="button"
                      onClick={() => handleView(doc)}
                      disabled={viewingId === doc.id}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink transition-colors duration-150 disabled:opacity-50"
                    >
                      {viewingId === doc.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Eye size={14} />}
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