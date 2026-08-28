// src/components/BudgetPlanUploadModal.jsx
import { useRef, useState } from 'react'
import { UploadCloud, FileText, X, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

// Confirmed against UploadBudgetPlanRequest::rules() — keep these two
// constants in sync if that validation rule ever changes.
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx']
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx'
const MAX_SIZE_MB = 10 // matches 'max:10240' (KB) on the backend

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Modal for attaching a budget plan file to a Pending budget.
 *
 * Props:
 * - open, onClose: standard Modal controls
 * - budget: the budget being attached to (uses budget.budget_id, budget.budget_name)
 * - onUpload: async (file) => { success, message } — call the hook's
 *   uploadPlan(budget.budget_id, file) here from the parent page
 */
export default function BudgetPlanUploadModal({ open, onClose, budget, onUpload }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)

  const reset = () => { setFile(null); setError(''); setDragActive(false) }
  const handleClose = () => { if (!uploading) { reset(); onClose() } }

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
    if (validationError) {
      setError(validationError)
      setFile(null)
      return
    }
    setError('')
    setFile(candidate)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const handleSubmit = async () => {
    if (!file) {
      setError('Choose a file to attach first.')
      return
    }
    setUploading(true)
    setError('')
    const result = await onUpload(file)
    setUploading(false)
    if (result?.success) {
      reset()
      onClose()
    } else {
      setError(result?.message || 'Failed to attach the budget plan. Please try again.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Attach Budget Plan"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={handleClose} disabled={uploading}>Cancel</Button>
          <Button variant="primary" size="md" onClick={handleSubmit} disabled={uploading || !file}>
            {uploading ? 'Uploading...' : 'Attach Plan'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {budget && (
          <p className="text-xs text-muted">
            Attaching a plan to <span className="font-medium text-ink">{budget.budget_name}</span> — this budget cannot be approved until a plan is on file.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
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
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors duration-150 ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-bg'
            }`}
          >
            <UploadCloud size={28} className="text-muted" />
            <p className="text-sm font-medium text-ink">Click to browse or drag a file here</p>
            <p className="text-xs text-muted">PDF, Word, or Excel — up to {MAX_SIZE_MB}MB</p>
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
      </div>
    </Modal>
  )
}