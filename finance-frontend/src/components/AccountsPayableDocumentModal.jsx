import { useEffect, useRef, useState } from 'react'
import { UploadCloud, FileText, X, AlertTriangle, Eye, Loader2 } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import Tooltip from './Tooltip'

// Confirmed against UploadAccountsPayableDocumentRequest::rules() — keep
// these two constants in sync if that validation rule ever changes.
// Images/PDF only, same restriction as Expense receipts and Collection
// proof-of-receipt uploads.
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']
const ACCEPT = '.pdf,.jpg,.jpeg,.png'
const MAX_SIZE_MB = 10 // matches 'max:10240' (KB) on the backend

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
 * Combined upload + history modal for a bill's supporting documents.
 * Merges the Expense module's two separate modals (upload / history)
 * into one, matching the single-modal shape CollectionProofHistoryModal's
 * prop contract implies.
 *
 * Props:
 * - open, onClose: standard Modal controls
 * - bill: the AccountsPayable record (uses bill.ap_id, bill.invoice_number)
 * - fetchHistory: async (apId) => { success, data, message }
 * - onUpload: async (file) => { success, message } — call the hook's
 *   attachDocument(bill.ap_id, file) here from the parent page
 * - onView: async (apId, documentId, targetWindow) => { success, message, viewedInline }
 * - onUploaded: called after a successful upload, so the parent can refetch bills
 */
export default function AccountsPayableDocumentModal({ open, onClose, bill, fetchHistory, onUpload, onView, onUploaded }) {
  const [documents, setDocuments] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [viewingId, setViewingId] = useState(null)

  const [file, setFile] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)

  const loadHistory = () => {
    if (!bill) return
    setHistoryLoading(true)
    setHistoryError('')
    fetchHistory(bill.ap_id).then((result) => {
      if (result.success) setDocuments(result.data)
      else setHistoryError(result.message)
      setHistoryLoading(false)
    })
  }

  useEffect(() => {
    if (open && bill) loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bill])

  const resetUpload = () => { setFile(null); setUploadError(''); setDragActive(false) }
  const handleClose = () => { if (!uploading) { resetUpload(); onClose() } }

  const validate = (candidate) => {
    const ext = candidate.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `"${candidate.name}" isn't a supported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}.`
    }
    if (candidate.size > MAX_SIZE_MB * 1024 * 1024) {
      return `"${candidate.name}" is ${formatBytes(candidate.size)}, which exceeds the ${MAX_SIZE_MB}MB limit.`
    }
    return ''
  }

  const handleFile = (candidate) => {
    if (!candidate) return
    const validationError = validate(candidate)
    if (validationError) { setUploadError(validationError); setFile(null); return }
    setUploadError('')
    setFile(candidate)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const handleUpload = async () => {
    if (!file) { setUploadError('Choose a file to attach first.'); return }
    setUploading(true)
    setUploadError('')
    const result = await onUpload(file)
    setUploading(false)
    if (result?.success) {
      resetUpload()
      loadHistory()
      onUploaded?.()
    } else {
      setUploadError(result?.message || 'Failed to attach the document. Please try again.')
    }
  }

  const handleView = async (doc) => {
    // Open the tab SYNCHRONOUSLY, before the await below — browsers only
    // reliably allow window.open() to bypass the popup blocker when it's
    // a direct result of the click event, not after an async fetch has
    // already resolved.
    const targetWindow = window.open('', '_blank')
    setViewingId(doc.id)
    const result = await onView(bill.ap_id, doc.id, targetWindow)
    setViewingId(null)
    if (!result.success) {
      setHistoryError(result.message)
    } else if (!result.viewedInline) {
      setHistoryError("This file type can't be previewed in-browser, so it's been downloaded instead.")
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Supporting Documents"
      footer={<Button variant="secondary" size="md" onClick={handleClose}>Close</Button>}
    >
      <div className="space-y-4">
        {bill && (
          <p className="text-xs text-muted">
            Documents attached to <span className="font-medium text-ink">{bill.invoice_number}</span>. Re-uploading adds a new version rather than replacing the old one.
          </p>
        )}

        {historyError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{historyError}</span>
          </div>
        )}

        {historyLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading history...
          </div>
        ) : documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No document has been attached to this bill yet.</p>
        ) : (
          <div className="max-h-56 space-y-2 overflow-y-auto">
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

        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted mb-2">Attach a new document</p>

          {uploadError && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors duration-150 ${
                dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-bg'
              }`}
            >
              <UploadCloud size={24} className="text-muted" />
              <p className="text-sm font-medium text-ink">Click to browse or drag a file here</p>
              <p className="text-xs text-muted">PDF, JPG, or PNG — up to {MAX_SIZE_MB}MB</p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                  <FileText size={16} className="text-primary-dark" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink" title={file.name}>{file.name}</p>
                  <p className="text-xs text-muted">{formatBytes(file.size)}</p>
                </div>
              </div>
              {!uploading && (
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label="Remove selected file"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink transition-colors duration-150"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <Button variant="primary" size="md" onClick={handleUpload} disabled={uploading || !file}>
              {uploading ? 'Uploading...' : 'Attach Document'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}