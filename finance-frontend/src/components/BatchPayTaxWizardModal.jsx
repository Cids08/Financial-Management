// src/components/BatchPayTaxWizardModal.jsx
// 2-step Batch Tax Payment Wizard  -  Step 1 Review & Select (filter pills,
// live total), Step 2 Payment Details (cash account, date, reference, shared
// proof-of-payment upload, remarks). Replaces the old table checkbox -> bar
// flow: selection now happens inside the modal, so the list table stays clean
// and the user is taken straight through to settlement.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Layers,
  Receipt,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import { apiFetch } from '../utils/api'
import { formatCurrency } from '../utils/formatters'
import { compressImageToUploadable, cannotFitHostLimit } from '../utils/fileUpload'
import { usePrivacy } from '../context/PrivacyContext'

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png']
const ACCEPT = '.pdf,.jpg,.jpeg,.png'
const MAX_SIZE_MB = 10

// Stable default so an inline [] never changes identity between renders
// (would trip effects that list it as a dependency).
const NO_OBLIGATIONS = []

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

function daysUntil(dueDate) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return Math.round((due - today) / 86400000)
}

const INPUT_CLASS = `w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150 text-sm`
const LABEL_CLASS = 'block text-xs font-medium text-muted mb-1.5'

const GROUP_STYLES = {
  all: '',
  Overdue: 'text-red-600 dark:text-red-400',
  Pending: 'text-amber-600 dark:text-amber-400',
}

const STEPS = ['Select Obligations', 'Payment Details']

// Urgency ordering mirrors Taxobligations.jsx's table: Overdue first, then
// obligations with an amount, then zero-amount ones; soonest due on top.
function compareUrgency(a, b) {
  const aOverdue = a.status === 'Overdue' || daysUntil(a.due_date) < 0
  const bOverdue = b.status === 'Overdue' || daysUntil(b.due_date) < 0
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
  const aAmount = Number(a.amount) || 0
  const bAmount = Number(b.amount) || 0
  if ((aAmount > 0) !== (bAmount > 0)) return aAmount > 0 ? -1 : 1
  return new Date(a.due_date) - new Date(b.due_date)
}

export default function BatchPayTaxWizardModal({
  open,
  onClose,
  obligations = NO_OBLIGATIONS,
  onBatchPay,
}) {
  usePrivacy()

  const todayStr = new Date().toISOString().slice(0, 10)

  // ── Step 1 (Review & Select) state ─────────────────────────────────────
  const [group, setGroup] = useState('all') // 'all' | 'Overdue' | 'Pending'
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())

  // ── Step 2 (Payment Details) state ─────────────────────────────────────
  const [step, setStep] = useState(0)
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

  // Reset state only when the modal actually opens (keyed on the open
  // transition, not on props) so a parent re-render can never re-fire this.
  const prevOpenRef = useRef(open)
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (!justOpened) return

    const dateCompact = todayStr.replace(/-/g, '').slice(2)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    setStep(0)
    setGroup('all')
    setSearch('')
    setSelected(new Set())
    setError('')
    setFieldErrors({})
    setFile(null)
    setDragActive(false)
    setForm({
      cash_account_id: '',
      payment_date: todayStr,
      reference_number: `BIR-BATCH-${dateCompact}-${randomSuffix}`,
      remarks: '',
    })

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
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const groupCounts = useMemo(() => {
    const counts = { all: obligations.length, Overdue: 0, Pending: 0 }
    obligations.forEach((o) => {
      if (o.status === 'Overdue') counts.Overdue += 1
      if (o.status === 'Pending') counts.Pending += 1
    })
    return counts
  }, [obligations])

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...obligations]
      .sort(compareUrgency)
      .filter((o) => group === 'all' || o.status === group)
      .filter(
        (o) =>
          !q ||
          o.tax_type.toLowerCase().includes(q) ||
          (o.tax_period || '').toLowerCase().includes(q) ||
          (o.reference_number || '').toLowerCase().includes(q),
      )
  }, [obligations, group, search])

  const allFilteredSelected = useMemo(
    () => filteredList.length > 0 && filteredList.every((o) => selected.has(o.tax_id)),
    [filteredList, selected],
  )

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredList.forEach((o) => next.delete(o.tax_id))
      } else {
        filteredList.forEach((o) => next.add(o.tax_id))
      }
      return next
    })
  }

  const toggleSelectOne = (taxId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(taxId)) next.delete(taxId)
      else next.add(taxId)
      return next
    })
  }

  const selectedList = useMemo(
    () => obligations.filter((o) => selected.has(o.tax_id)),
    [obligations, selected],
  )
  const totalAmount = useMemo(
    () => selectedList.reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
    [selectedList],
  )

  // ── Step 2 derived state (mirrors BatchRecordTaxPaymentModal) ───────────
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
    const hostError = cannotFitHostLimit(candidate)
    if (hostError) return hostError
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

    if (!selectedList.length) {
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
      selectedList.forEach((o) => fd.append('tax_ids[]', o.tax_id))
      fd.append('cash_account_id', form.cash_account_id)
      fd.append('payment_date', form.payment_date)
      fd.append('reference_number', form.reference_number.trim())
      if (form.remarks?.trim()) {
        fd.append('remarks', form.remarks.trim())
      }
      fd.append('document', await compressImageToUploadable(file))

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

  const canContinue = selectedList.length > 0 && !loadingAccounts

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Layers size={18} />
            </div>
            <div>
              <span className="font-semibold text-ink">Batch Pay Tax Obligations</span>
              <p className="text-xs font-normal text-muted">
                {step === 0
                  ? 'Select the statutory obligations to settle in one transaction'
                  : `Settle ${selectedList.length} obligation${selectedList.length === 1 ? '' : 's'} · ${formatCurrency(totalAmount)}`}
              </p>
            </div>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                {i > 0 && <div className="h-px w-4 bg-border" />}
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors
                    ${i === step
                      ? 'bg-emerald-600 text-white'
                      : i < step
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                        : 'bg-bg text-muted'}`}
                >
                  {i < step ? <CheckCircle2 size={12} /> : <span className="tabular-nums">{i + 1}</span>}
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      }
      maxWidth={step === 0 ? 'max-w-2xl' : 'max-w-xl'}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-muted">
            {step === 0
              ? selectedList.length > 0
                ? `${selectedList.length} selected · ${formatCurrency(totalAmount)} to pay`
                : 'No obligations selected yet'
              : `Total Batch: ${formatCurrency(totalAmount)}`}
          </div>
          <div className="flex items-center gap-2">
            {step === 1 && (
              <Button variant="secondary" size="md" icon={ChevronLeft} onClick={() => setStep(0)} disabled={submitting}>
                Back
              </Button>
            )}
            <Button
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={submitting}
            >
              {step === 0 ? 'Cancel' : 'Close'}
            </Button>
            {step === 0 ? (
              <Button
                variant="primary"
                size="md"
                iconPosition="right"
                icon={ChevronRight}
                onClick={() => setStep(1)}
                disabled={!canContinue}
              >
                {selectedList.length > 0 ? `Continue (${selectedList.length})` : 'Continue'}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                icon={Receipt}
                onClick={handleSubmit}
                disabled={submitting || isOverdrawn || selectedList.length === 0}
              >
                {submitting ? 'Recording Batch Payment…' : `Pay ${selectedList.length} Obligations`}
              </Button>
            )}
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

        {step === 0 ? (
          <>
            {/* Group filter pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'Overdue', 'Pending']).map((key) => {
                const active = group === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGroup(key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors duration-150
                      ${active
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'border-border bg-surface text-muted hover:bg-bg hover:text-ink'}`}
                  >
                    <span className={!active && key !== 'all' ? GROUP_STYLES[key] : ''}>
                      {key === 'all' ? 'All' : key}
                    </span>
                    <span className={`tabular-nums ${active ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted'}`}>
                      {groupCounts[key]}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Search within step */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${group === 'all' ? 'all' : group.toLowerCase()} obligations by tax type, period, or reference…`}
                className={INPUT_CLASS}
                style={{ paddingLeft: '2.25rem' }}
                autoComplete="off"
              />
            </div>

            {/* Selection list */}
            <div className="rounded-lg border border-border bg-surface overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-bg/50 border-b border-border">
                <label className="flex items-center gap-2 font-semibold text-ink cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all shown obligations"
                    className="rounded border-border text-primary focus:ring-primary/40 cursor-pointer h-3.5 w-3.5"
                  />
                  Select all
                </label>
                <span className="text-[11px] text-muted">
                  {selectedList.length} of {obligations.length} eligible
                </span>
              </div>

              {loadingAccounts && !obligations.length && (
                <div className="px-4 py-8 text-center text-sm text-muted">
                  <Loader2 size={16} className="inline animate-spin mr-2" /> Loading obligations…
                </div>
              )}

              {!filteredList.length ? (
                <div className="px-4 py-8 text-center text-sm text-muted">
                  No {group !== 'all' ? group.toLowerCase() : ''} obligations match{search ? ' your search' : ''}.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-border">
                  {filteredList.map((o) => {
                    const remaining = daysUntil(o.due_date)
                    const isSelected = selected.has(o.tax_id)
                    return (
                      <label
                        key={o.tax_id}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors duration-100 select-none
                          ${isSelected ? 'bg-emerald-50/60 dark:bg-emerald-500/10' : 'hover:bg-bg'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(o.tax_id)}
                          aria-label={`Select ${o.tax_type} ${o.tax_period}`}
                          className="rounded border-border text-primary focus:ring-primary/40 cursor-pointer h-3.5 w-3.5 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink truncate">{o.tax_type}</span>
                          <span className="block text-[11px] text-muted">
                            {o.tax_period} · Due {formatDate(o.due_date)}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className="font-semibold tabular-nums text-ink">
                            {formatCurrency(o.amount)}
                          </span>
                          <span className={`text-[10px] ${remaining < 0 ? 'text-red-500 font-medium' : 'text-muted'}`}>
                            {remaining < 0 ? `${Math.abs(remaining)}d overdue` : remaining === 0 ? 'Due today' : `Due in ${remaining}d`}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Live running total already in footer; show a compact strip too */}
            {selectedList.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {selectedList.length} obligation{selectedList.length === 1 ? '' : 's'} ready to settle
                </span>
                <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Selected Obligations Summary */}
            <div className="rounded-lg border border-border bg-surface overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-bg/50 border-b border-border">
                <span className="font-semibold text-ink">Pending for Payment ({selectedList.length})</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="max-h-32 overflow-y-auto divide-y divide-border">
                {selectedList.map((o) => (
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
                    {acc.account_name} ({acc.bank_name || acc.account_code || 'Cash'})  -  Available: {formatCurrency(acc.current_balance)}
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
                  className={`${INPUT_CLASS} scheme-light dark:scheme-dark ${fieldErrors.payment_date ? 'border-red-500' : ''}`}
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
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFileSelect(e.dataTransfer.files?.[0]) }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors duration-150
                    ${dragActive ? 'border-primary bg-primary/5' : fieldErrors.document ? 'border-red-400 bg-red-50/30' : 'border-border bg-surface hover:bg-bg'}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary-dark mb-2">
                    <UploadCloud size={18} />
                  </div>
                  <p className="font-semibold text-ink text-xs">
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
              <span className="font-semibold text-ink">Audit &amp; Compliance Notice:</span> Marking this batch as paid will automatically record {selectedList.length} individual approved expenses under statutory tax compliance, debit cash account &ldquo;{selectedAccount?.account_name || 'selected account'}&rdquo; by {formatCurrency(totalAmount)}, and post corresponding double-entry journal entries to the General Ledger.
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}