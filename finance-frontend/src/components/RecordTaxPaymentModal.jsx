// src/components/RecordTaxPaymentModal.jsx
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  FileText,
  Paperclip,
  Receipt,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import { apiFetch } from '../utils/api'
import { formatCurrency } from '../utils/formatters'

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']
const ACCEPT = '.pdf,.jpg,.jpeg,.png'
const MAX_SIZE_MB = 10

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const INPUT_CLASS = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150 text-sm`
const LABEL_CLASS = 'block text-xs font-medium text-muted mb-1.5'

export default function RecordTaxPaymentModal({
  open,
  onClose,
  obligation,
  onPay,
}) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [cashAccounts, setCashAccounts] = useState([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)

  const [form, setForm] = useState({
    cash_account_id: '',
    payment_date: todayStr,
    reference_number: '',
    remarks: '',
  })
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const fileInputRef = useRef(null)

  // Fetch available cash accounts on open
  useEffect(() => {
    if (!open) return
    let active = true
    setLoadingAccounts(true)
    apiFetch('/api/cash-accounts?per_page=100')
      .then((res) => res.json())
      .then((json) => {
        if (active && json.data) {
          const list = Array.isArray(json.data) ? json.data : (json.data.data || [])
          setCashAccounts(list)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingAccounts(false)
      })

    // Reset state with default reference suggested
    const taxTypeSlug = (obligation?.tax_type || 'TAX').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const dateCompact = todayStr.replace(/-/g, '').slice(2)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    setForm({
      cash_account_id: '',
      payment_date: todayStr,
      reference_number: `BIR-${taxTypeSlug}-${dateCompact}-${randomSuffix}`,
      remarks: '',
    })
    setFile(null)
    setError('')
    setFieldErrors({})
    setDragActive(false)

    return () => {
      active = false
    }
  }, [open, obligation, todayStr])

  const validateFile = (candidate) => {
    const ext = candidate.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `"${candidate.name}" isn't a supported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}.`
    }
    if (candidate.size > MAX_SIZE_MB * 1024 * 1024) {
      return `"${candidate.name}" is ${formatBytes(candidate.size)}, which exceeds the ${MAX_SIZE_MB}MB limit.`
    }
    return ''
  }

  const handleFileSelect = (candidate) => {
    if (!candidate) return
    const err = validateFile(candidate)
    if (err) {
      setError(err)
      setFile(null)
      return
    }
    setError('')
    setFieldErrors((prev) => ({ ...prev, document: '' }))
    setFile(candidate)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    handleFileSelect(e.dataTransfer.files?.[0])
  }

  const handleGenerateRef = () => {
    const taxTypeSlug = (obligation?.tax_type || 'TAX').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const dateCompact = (form.payment_date || todayStr).replace(/-/g, '').slice(2)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    setForm((f) => ({ ...f, reference_number: `BIR-${taxTypeSlug}-${dateCompact}-${randomSuffix}` }))
    setFieldErrors((prev) => ({ ...prev, reference_number: '' }))
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setError('')
    const errors = {}

    if (!form.cash_account_id) {
      errors.cash_account_id = 'Please select a cash or bank account to pay from.'
    }
    if (!form.payment_date) {
      errors.payment_date = 'Payment date is required.'
    }
    if (!form.reference_number || !form.reference_number.trim()) {
      errors.reference_number = 'Official reference or confirmation number is required.'
    }
    if (!file) {
      errors.document = 'Proof of payment (e.g. BIR confirmation or bank slip) is mandatory.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('cash_account_id', form.cash_account_id)
      formData.append('payment_date', form.payment_date)
      formData.append('reference_number', form.reference_number.trim())
      if (form.remarks?.trim()) {
        formData.append('remarks', form.remarks.trim())
      }
      formData.append('document', file)

      const result = await onPay(obligation.tax_id || obligation.id, formData)
      if (result?.success) {
        onClose()
      } else {
        setError(result?.message || 'Failed to record payment. Please review input.')
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open || !obligation) return null

  const amountOwed = Number(obligation.amount ?? obligation.tax_amount ?? 0)

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Record BIR Tax Payment"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={Receipt}
            onClick={handleSubmit}
            disabled={submitting || !file || !form.cash_account_id}
          >
            {submitting ? 'Recording Payment...' : 'Confirm & Record Payment'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Obligation Summary Card */}
        <div className="rounded-xl border border-border bg-bg/50 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Tax Obligation Details
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-surface border border-border text-ink">
              {obligation.tax_period}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <div>
              <p className="text-sm font-semibold text-ink">{obligation.tax_type}</p>
              <p className="text-xs text-muted">Due date: {formatDate(obligation.due_date)}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted block">Amount Due</span>
              <span className="text-lg font-bold text-ink tabular-nums">
                {formatCurrency(amountOwed)}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Cash / Bank Account Selector */}
        <div>
          <label className={LABEL_CLASS}>
            Paid From (Cash / Bank Account) <span className="text-red-500">*</span>
          </label>
          <select
            value={form.cash_account_id}
            onChange={(e) => {
              setForm({ ...form, cash_account_id: e.target.value })
              setFieldErrors((prev) => ({ ...prev, cash_account_id: '' }))
            }}
            disabled={submitting || loadingAccounts}
            className={`${INPUT_CLASS} ${fieldErrors.cash_account_id ? 'border-red-500' : ''}`}
          >
            <option value="">
              {loadingAccounts ? 'Loading cash accounts...' : 'Select Cash / Bank Account...'}
            </option>
            {cashAccounts.map((acc) => {
              const bankOrCode = acc.bank_name || acc.account_code || ''
              return (
                <option key={acc.id} value={acc.id}>
                  {acc.account_name} {bankOrCode ? `(${bankOrCode})` : ''}
                </option>
              )
            })}
          </select>
          {fieldErrors.cash_account_id ? (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.cash_account_id}</p>
          ) : (
            <p className="mt-1 text-[11px] text-muted">
              Funds will be deducted from this account and synchronized with the General Ledger.
            </p>
          )}
        </div>

        {/* Payment Date & Reference Number Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>
              Payment Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.payment_date}
              onChange={(e) => {
                setForm({ ...form, payment_date: e.target.value })
                setFieldErrors((prev) => ({ ...prev, payment_date: '' }))
              }}
              disabled={submitting}
              className={`${INPUT_CLASS} ${fieldErrors.payment_date ? 'border-red-500' : ''}`}
            />
            {fieldErrors.payment_date && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.payment_date}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-muted">
                Reference / Confirmation No. <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateRef}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
              >
                <Sparkles size={11} /> Auto
              </button>
            </div>
            <input
              type="text"
              value={form.reference_number}
              placeholder="e.g. BIR-EWT-0910-4821"
              onChange={(e) => {
                setForm({ ...form, reference_number: e.target.value })
                setFieldErrors((prev) => ({ ...prev, reference_number: '' }))
              }}
              disabled={submitting}
              className={`${INPUT_CLASS} ${fieldErrors.reference_number ? 'border-red-500' : ''}`}
            />
            {fieldErrors.reference_number && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.reference_number}</p>
            )}
          </div>
        </div>

        {/* Proof of Payment Upload */}
        <div>
          <label className={LABEL_CLASS}>
            Proof of Payment (BIR Confirmation Slip / Bank Receipt){' '}
            <span className="text-red-500">*</span>
          </label>

          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : fieldErrors.document
                  ? 'border-red-400 bg-red-50/50 dark:bg-red-500/5'
                  : 'border-border hover:border-primary/50 hover:bg-bg/60'
              }`}
            >
              <UploadCloud className="w-7 h-7 text-muted mb-1.5" />
              <p className="text-xs font-medium text-ink">
                Click to browse or drag & drop BIR receipt
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                Supported: PDF, JPG, PNG (Max {MAX_SIZE_MB}MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileText size={16} />
                </div>
                <div className="truncate">
                  <p className="text-xs font-medium text-ink truncate">{file.name}</p>
                  <p className="text-[11px] text-muted">{formatBytes(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                disabled={submitting}
                className="p-1 text-muted hover:text-red-500 rounded transition-colors"
                title="Remove file"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {fieldErrors.document && (
            <p className="mt-1 text-xs text-red-500">{fieldErrors.document}</p>
          )}
        </div>

        {/* Remarks (Optional) */}
        <div>
          <label className={LABEL_CLASS}>Remarks / Notes (Optional)</label>
          <textarea
            rows={2}
            value={form.remarks}
            placeholder="e.g. Paid via eFPS / Authorized Agent Bank"
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            disabled={submitting}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface !text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-150 text-sm resize-none"
          />
        </div>
      </form>
    </Modal>
  )
}

