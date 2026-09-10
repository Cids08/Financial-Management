// src/components/BatchRecordTaxPaymentModal.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  FileText,
  Paperclip,
  Receipt,
  Sparkles,
  UploadCloud,
  X,
  Layers,
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

export default function BatchRecordTaxPaymentModal({
  open,
  onClose,
  obligations = [],
  onBatchPay,
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

  const totalAmount = useMemo(() => {
    return obligations.reduce((sum, o) => sum + (Number(o.amount) || 0), 0)
  }, [obligations])

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

    const dateCompact = todayStr.replace(/-/g, '').slice(2)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    setForm({
      cash_account_id: '',
      payment_date: todayStr,
      reference_number: `BIR-BATCH-${dateCompact}-${randomSuffix}`,
      remarks: '',
    })
    setFile(null)
    setError('')
    setFieldErrors({})
    setDragActive(false)

    return () => {
      active = false
    }
  }, [open, todayStr])

  const selectedAccount = useMemo(() => {
    if (!form.cash_account_id) return null
    return cashAccounts.find((a) => a.id === Number(form.cash_account_id)) || null
  }, [cashAccounts, form.cash_account_id])

  const isOverdrawn = useMemo(() => {
    if (!selectedAccount) return false
    return totalAmount > Number(selectedAccount.current_balance || 0)
  }, [selectedAccount, totalAmount])

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
    const dateCompact = (form.payment_date || todayStr).replace(/-/g, '').slice(2)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    setForm((f) => ({ ...f, reference_number: `BIR-BATCH-${dateCompact}-${randomSuffix}` }))
    setFieldErrors((prev) => ({ ...prev, reference_number: '' }))
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setError('')
    const errors = {}

    if (!obligations.length) {
      setError('No tax obligations are selected for payment.')
      return
    }
    if (!form.cash_account_id) {
      errors.cash_account_id = 'Please select a cash or bank account to pay from.'
    }
    if (!form.payment_date) {
      errors.payment_date = 'Payment date is required.'
    }
    if (!form.reference_number.trim()) {
      errors.reference_number = 'Official reference or confirmation number is required.'
    }
    if (!file) {
      errors.document = 'Proof of payment (BIR confirmation slip or deposit receipt) is strictly required.'
    }
    if (selectedAccount && totalAmount > Number(selectedAccount.current_balance)) {
      errors.cash_account_id = `Account balance (${formatCurrency(selectedAccount.current_balance)}) is insufficient for batch total (${formatCurrency(totalAmount)}).`
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      obligations.forEach((o) => fd.append('tax_ids[]', o.tax_id))
      fd.append('cash_account_id', form.cash_account_id)
      fd.append('payment_date', form.payment_date)
      fd.append('reference_number', form.reference_number.trim())
      if (form.remarks?.trim()) {
        fd.append('remarks', form.remarks.trim())
      }
      fd.append('document', file)

      const result = await onBatchPay(fd)
      if (result?.success) {
        onClose()
      } else {
        setError(result?.message || 'Failed to record batch tax payment.')
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Layers size={18} />
          </div>
          <div>
            <span className="font-semibold text-ink">Batch Pay Tax Obligations</span>
            <p className="text-xs font-normal text-muted">
              Settle {obligations.length} statutory obligation{obligations.length === 1 ? '' : 's'} in a single transaction
            </p>
          </div>
        </div>
      }
      maxWidth="max-w-xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-muted">
            Total Batch: <span className="font-bold text-ink text-sm">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSubmit}
              disabled={submitting || isOverdrawn || obligations.length === 0}
            >
              {submitting ? 'Recording Batch Payment…' : `Pay ${obligations.length} Obligations`}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* Selected Obligations Summary */}
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-bg/50 border-b border-border">
            <span className="font-semibold text-ink">Selected Obligations ({obligations.length})</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="max-h-36 overflow-y-auto divide-y divide-border">
            {obligations.map((o) => (
              <div key={o.tax_id} className="flex items-center justify-between px-3 py-1.5 hover:bg-bg/40">
                <div className="min-w-0">
                  <span className="font-medium text-ink block truncate">{o.tax_type}</span>
                  <span className="text-[11px] text-muted">{o.tax_period} · Due {formatDate(o.due_date)}</span>
                </div>
                <div className="font-semibold tabular-nums text-ink text-right ml-2 shrink-0">
                  {formatCurrency(o.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cash / Bank Account Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-muted">
              Pay From Cash / Bank Account <span className="text-red-500">*</span>
            </label>
            {selectedAccount && (
              <span className={`text-[11px] font-semibold tabular-nums ${isOverdrawn ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                Available: {formatCurrency(selectedAccount.current_balance)}
              </span>
            )}
          </div>
          <select
            value={form.cash_account_id}
            onChange={(e) => {
              setForm((f) => ({ ...f, cash_account_id: e.target.value }))
              setFieldErrors((prev) => ({ ...prev, cash_account_id: '' }))
            }}
            disabled={submitting || loadingAccounts}
            className={`${INPUT_CLASS} ${fieldErrors.cash_account_id ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
          >
            <option value="">-- Select Cash or Bank Account --</option>
            {cashAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.account_name} ({acc.bank_name || acc.account_code || 'Cash'}) — Available: {formatCurrency(acc.current_balance)}
              </option>
            ))}
          </select>
          {fieldErrors.cash_account_id && (
            <p className="mt-1 text-[11px] text-red-500">{fieldErrors.cash_account_id}</p>
          )}
          {isOverdrawn && (
            <p className="mt-1 text-[11px] font-medium text-red-500">
              Warning: The selected account does not have enough funds to cover this batch payment of {formatCurrency(totalAmount)}.
            </p>
          )}
        </div>

        {/* Payment Date & Reference Number */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>
              Payment Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.payment_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, payment_date: e.target.value }))
                setFieldErrors((prev) => ({ ...prev, payment_date: '' }))
              }}
              disabled={submitting}
              className={`${INPUT_CLASS} ${fieldErrors.payment_date ? 'border-red-500' : ''}`}
            />
            {fieldErrors.payment_date && (
              <p className="mt-1 text-[11px] text-red-500">{fieldErrors.payment_date}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-muted">
                Reference / Confirmation No. <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateRef}
                className="inline-flex items-center gap-1 text-[11px] text-primary-dark hover:underline"
              >
                <Sparkles size={11} /> Auto-generate
              </button>
            </div>
            <input
              type="text"
              value={form.reference_number}
              onChange={(e) => {
                setForm((f) => ({ ...f, reference_number: e.target.value }))
                setFieldErrors((prev) => ({ ...prev, reference_number: '' }))
              }}
              placeholder="e.g. BIR-BATCH-260910-4821 or Bank Ref"
              disabled={submitting}
              className={`${INPUT_CLASS} ${fieldErrors.reference_number ? 'border-red-500' : ''}`}
            />
            {fieldErrors.reference_number && (
              <p className="mt-1 text-[11px] text-red-500">{fieldErrors.reference_number}</p>
            )}
          </div>
        </div>

        {/* Shared Proof of Payment Upload */}
        <div>
          <label className={LABEL_CLASS}>
            Official Proof of Payment (Shared across batch) <span className="text-red-500">*</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
            className="hidden"
          />

          {!file ? (
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors duration-150
                ${dragActive ? 'border-primary bg-primary/5' : fieldErrors.document ? 'border-red-400 bg-red-50/30' : 'border-border bg-surface hover:bg-bg'}`}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary-dark mb-2">
                <UploadCloud size={18} />
              </div>
              <p className="font-semibold text-ink">
                Upload BIR Confirmation Slip or Bank Deposit / Transfer Receipt
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                Drag and drop here, or <span className="text-primary-dark underline">browse file</span>
              </p>
              <p className="text-[10px] text-muted mt-1">PDF, JPG, JPEG, PNG up to {MAX_SIZE_MB}MB</p>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <FileText size={16} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate text-xs">{file.name}</p>
                  <p className="text-[11px] text-muted">{formatBytes(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors"
                title="Remove file"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {fieldErrors.document && (
            <p className="mt-1 text-[11px] text-red-500">{fieldErrors.document}</p>
          )}
        </div>

        {/* Remarks */}
        <div>
          <label className={LABEL_CLASS}>Batch Payment Remarks (Optional)</label>
          <textarea
            rows={2}
            value={form.remarks}
            onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
            placeholder="e.g. Combined statutory filings paid via BDO online eFPS batch transfer"
            disabled={submitting}
            className="w-full rounded-lg border border-border bg-surface p-2.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        {/* Audit Notice */}
        <div className="rounded-lg bg-bg border border-border/80 p-2.5 text-[11px] text-muted">
          <span className="font-semibold text-ink">Audit &amp; Compliance Notice:</span> Marking this batch as paid will automatically record {obligations.length} individual approved expenses under statutory tax compliance, debit cash account &ldquo;{selectedAccount?.account_name || 'selected account'}&rdquo; by {formatCurrency(totalAmount)}, and post corresponding double-entry journal entries to the General Ledger.
        </div>
      </form>
    </Modal>
  )
}

