import { useEffect, useRef, useState } from 'react'
import { UploadCloud, FileText, X, AlertTriangle, Eye, Loader2 } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import Tooltip from './Tooltip'

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp'
const MAX_SIZE_MB = 10 // matches 10MB limit on the backend

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
 * Combined upload + history modal for an invoice's supporting documents.
 * Props:
 * - open, onClose: standard Modal controls
 * - invoice: the AccountsReceivable record (uses invoice.ar_id, invoice.invoice_number)
 * - fetchHistory: async (arId) => { success, data, message }
 * - onUpload: async (file) => { success, message }
 * - onView: async (arId, documentId, targetWindow) => { success, message, viewedInline }
 * - onUploaded: called after a successful upload, so the parent can refetch
 */
export default function AccountsReceivableDocumentModal({ open, onClose, invoice, fetchHistory, onUpload, onView, onUploaded }) {
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
    if (!invoice) return
    setHistoryLoading(true)
    setHistoryError('')
    fetchHistory(invoice.ar_id).then((result) => {
      if (result.success) setDocuments(result.data)
      else setHistoryError(result.message)
      setHistoryLoading(false)
    })
  }

  useEffect(() => {
    if (open && invoice) loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice])

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
    const targetWindow = window.open('', '_blank')
    setViewingId(doc.id)
    const result = await onView(invoice.ar_id, doc.id, targetWindow)
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
        {invoice && (
          <p className="text-xs text-muted">
            Documents attached to <span className="font-medium text-ink">{invoice.invoice_number}</span>. Re-uploading adds a new version rather than replacing the old one.
          </p>
        )}

        {/* Upload panel */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors duration-150 ${
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-border bg-bg hover:border-primary/60'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => {
              const selected = e.target.files?.[0]
              if (selected) handleFile(selected)
            }}
            className="hidden"
          />
          <UploadCloud size={22} className="text-muted" />
          <p className="text-xs text-ink font-medium">
            Drag &amp; drop a file, or <span className="text-primary-dark underline">browse</span>
          </p>
          <p className="text-[11px] text-muted">PDF, JPG, PNG or WEBP up to {MAX_SIZE_MB}MB</p>
        </div>

        {file && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} className="text-primary-dark shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink truncate">{file.name}</p>
                <p className="text-[11px] text-muted">{formatBytes(file.size)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="primary"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleUpload() }}
                loading={uploading}
              >
                Upload
              </Button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); resetUpload() }}
                disabled={uploading}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={14} className="shrink-0" />
            <p>{uploadError}</p>
          </div>
        )}

        {/* History table */}
        <div>
          <p className="text-xs font-medium text-ink mb-1.5">Document History</p>
          {historyLoading ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted">
              <Loader2 size={16} className="animate-spin mr-2" /> Loading document history...
            </div>
          ) : historyError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {historyError}
            </div>
          ) : documents.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">No documents uploaded yet.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-bg overflow-hidden">
              {documents.map((doc, idx) => (
                <div key={doc.id} className="flex items-center justify-between p-2.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-ink truncate">{doc.original_name}</p>
                      {idx === 0 && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted">
                      {formatBytes(doc.file_size)} • Uploaded {formatDateTime(doc.uploaded_at)}
                      {doc.uploaded_by_name ? ` by ${doc.uploaded_by_name}` : ''}
                    </p>
                  </div>
                  <Tooltip content="View document in new tab">
                    <button
                      type="button"
                      onClick={() => handleView(doc)}
                      disabled={viewingId === doc.id}
                      className="ml-2 flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink transition-colors duration-150"
                    >
                      {viewingId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
