import { useEffect, useRef, useState } from 'react'
import { UploadCloud, FileText, X, AlertTriangle, Eye, Loader2 } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import Tooltip from './Tooltip'

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp'
const MAX_SIZE_MB = 10

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
 * Proof of payment upload + history modal for a disbursement voucher.
 * Matches AccountsPayableDocumentModal and CollectionProofHistoryModal.
 *
 * Props:
 * - open, onClose: Modal state handlers
 * - disbursement: The disbursement record ({ disbursement_id, voucher_number, payee, is_archived, status })
 * - fetchHistory: async (disbursementId) => { success, data, message }
 * - onUpload: async (disbursementId, file) => { success, message }
 * - onView: async (disbursementId, documentId, targetWindow) => { success, message, viewedInline }
 * - onUploaded: callback after successful upload
 * - canManage: boolean, whether the current user can upload proofs
 */
export default function DisbursementProofModal({ open, onClose, disbursement, fetchHistory, onUpload, onView, onUploaded, canManage = true }) {
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
    if (!disbursement) return
    setHistoryLoading(true)
    setHistoryError('')
    fetchHistory(disbursement.disbursement_id).then((result) => {
      if (result.success) setDocuments(result.data)
      else setHistoryError(result.message)
      setHistoryLoading(false)
    })
  }

  useEffect(() => {
    if (open && disbursement) loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, disbursement])

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
    try {
      await onUpload(disbursement.disbursement_id, file)
      resetUpload()
      loadHistory()
      onUploaded?.()
    } catch (err) {
      setUploadError(err.message || 'Failed to upload proof of payment.')
    } finally {
      setUploading(false)
    }
  }

  const handleView = async (doc) => {
    const targetWindow = window.open('', '_blank')
    setViewingId(doc.id)
    const result = await onView(disbursement.disbursement_id, doc.id, targetWindow)
    setViewingId(null)
    if (!result.success) {
      setHistoryError(result.message || 'Failed to open document.')
    }
  }

  const canUpload = canManage && !disbursement?.is_archived

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Proof of Payment — ${disbursement?.voucher_number || 'Disbursement'}`}
      maxWidth="max-w-2xl"
      footer={<Button variant="secondary" size="md" onClick={handleClose} disabled={uploading}>Close</Button>}
    >
      <div className="space-y-5 text-ink">
        {disbursement?.payee && (
          <div className="flex items-center justify-between text-xs text-muted border-b border-border pb-3">
            <span>Payee: <strong className="text-ink">{disbursement.payee}</strong></span>
            <span className="font-mono text-muted">{disbursement.voucher_number}</span>
          </div>
        )}

        {/* Upload new proof section */}
        {canUpload ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-ink">
              Attach New Proof of Payment
              <span className="ml-1 text-[11px] font-normal text-muted">— upload signed check voucher, transfer slip, or deposit receipt</span>
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors duration-150 ${
                dragActive ? 'border-primary bg-primary/10' : 'border-border bg-bg hover:border-primary/60'
              }`}
            >
              <UploadCloud size={22} className="text-muted" />
              <p className="text-xs font-medium text-ink">
                Drag &amp; drop file here, or <span className="text-primary-dark underline">browse</span>
              </p>
              <p className="text-[11px] text-muted">JPG, PNG, WEBP or PDF up to {MAX_SIZE_MB}MB</p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            {file && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <FileText size={16} className="text-primary-dark shrink-0" />
                  <span className="truncate font-medium text-ink">{file.name}</span>
                  <span className="text-muted shrink-0">({formatBytes(file.size)})</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="primary" size="sm" onClick={handleUpload} loading={uploading}>
                    Upload Proof
                  </Button>
                  <button
                    type="button"
                    onClick={resetUpload}
                    disabled={uploading}
                    className="p-1 text-muted hover:text-ink transition-colors"
                    aria-label="Cancel file"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle size={13} className="shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        ) : (
          disbursement?.is_archived && (
            <p className="text-xs text-muted italic">This disbursement is archived. Proof uploads are disabled.</p>
          )
        )}

        {/* Uploaded History Section */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink">
            Attached Proofs &amp; Documents ({documents.length})
          </p>

          {historyLoading ? (
            <div className="flex items-center justify-center py-6 text-muted gap-2 text-xs">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span>Loading proof files...</span>
            </div>
          ) : historyError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {historyError}
            </div>
          ) : documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted">
              No proof of payment attached yet.
            </div>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden bg-bg">
              {documents.map((doc, idx) => {
                const isCurrent = idx === 0
                const isViewing = viewingId === doc.id
                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border text-primary shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-ink truncate">{doc.original_name}</p>
                          {isCurrent && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted">
                          {formatBytes(doc.file_size)} • Uploaded {formatDateTime(doc.uploaded_at)}
                          {doc.uploaded_by_name ? ` by ${doc.uploaded_by_name}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Tooltip label="View document in new tab">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Eye}
                          loading={isViewing}
                          onClick={() => handleView(doc)}
                        >
                          View
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
