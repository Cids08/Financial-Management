// src/components/GenerateTaxScheduleModal.jsx
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Info,
  Layers,
  Sparkles,
} from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

const TAX_TYPE_INFO = [
  {
    type: 'VAT',
    cadence: 'Monthly',
    due: '20th of following month',
    rate: '12%',
    description: 'Value-Added Tax on sales less allowable input deductions',
  },
  {
    type: 'Withholding Tax',
    cadence: 'Monthly',
    due: '10th of following month',
    rate: '2%',
    description: 'Expanded Withholding Tax (EWT) on vendor expenses & disbursements',
  },
  {
    type: 'Income Tax',
    cadence: 'Quarterly',
    due: '60 days post quarter (Annual: Apr 15)',
    rate: '25%',
    description: 'Corporate Quarterly Income Tax (ITR) based on net operating income',
  },
  {
    type: 'Percentage Tax',
    cadence: 'Monthly',
    due: '20th of following month',
    rate: '3%',
    description: 'Statutory non-VAT percentage tax on gross sales/receipts',
  },
  {
    type: 'Documentary Stamp Tax',
    cadence: 'Monthly',
    due: '5th of following month',
    rate: '1.5%',
    description: 'DST filings on corporate disbursements and instruments',
  },
  {
    type: 'Local Business Tax',
    cadence: 'Quarterly',
    due: '20th of each quarter month',
    rate: '2%',
    description: 'LGU statutory quarterly business tax based on gross revenues',
  },
]

const SCOPE_OPTIONS = [
  { value: 'full_year', label: 'Full Fiscal Year', sub: 'All 12 Months + 4 Quarters' },
  { value: 'q1', label: 'Quarter 1 (Q1)', sub: 'Jan – Mar' },
  { value: 'q2', label: 'Quarter 2 (Q2)', sub: 'Apr – Jun' },
  { value: 'q3', label: 'Quarter 3 (Q3)', sub: 'Jul – Sep' },
  { value: 'q4', label: 'Quarter 4 (Q4)', sub: 'Oct – Dec' },
]

export default function GenerateTaxScheduleModal({ open, onClose, onGenerate }) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [periodScope, setPeriodScope] = useState('full_year')
  const [selectedTypes, setSelectedTypes] = useState(
    () => new Set(TAX_TYPE_INFO.map((t) => t.type))
  )
  const [autoCalculatePast, setAutoCalculatePast] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setYear(new Date().getFullYear())
      setPeriodScope('full_year')
      setSelectedTypes(new Set(TAX_TYPE_INFO.map((t) => t.type)))
      setAutoCalculatePast(true)
      setError('')
    }
  }, [open])

  const toggleType = (type) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedTypes(new Set(TAX_TYPE_INFO.map((t) => t.type)))
  }

  const deselectAll = () => {
    setSelectedTypes(new Set())
  }

  // Calculate projected maximum obligations to generate
  const projectedCount = useMemo(() => {
    const monthsMultiplier = periodScope === 'full_year' ? 12 : 3
    const quartersMultiplier = periodScope === 'full_year' ? 4 : 1

    let count = 0
    TAX_TYPE_INFO.forEach((t) => {
      if (selectedTypes.has(t.type)) {
        count += t.cadence === 'Monthly' ? monthsMultiplier : quartersMultiplier
      }
    })
    return count
  }, [periodScope, selectedTypes])

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (selectedTypes.size === 0) {
      setError('Please select at least one tax type to schedule.')
      return
    }

    setError('')
    setGenerating(true)

    const payload = {
      year: Number(year),
      period_scope: periodScope,
      tax_types: Array.from(selectedTypes),
      auto_calculate_past: autoCalculatePast,
    }

    const result = await onGenerate(payload)
    setGenerating(false)

    if (result?.success) {
      onClose()
    } else {
      setError(result?.message || 'Failed to generate tax filing schedule.')
    }
  }

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={() => !generating && onClose()}
      title="Generate Periodic Tax Filing Schedule"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose} disabled={generating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={CalendarRange}
            onClick={handleSubmit}
            disabled={generating || selectedTypes.size === 0}
          >
            {generating ? 'Generating Schedule...' : 'Generate Statutory Schedule'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Intro banner */}
        <div className="rounded-xl border border-border bg-primary/5 p-3.5 flex items-start gap-3">
          <CalendarRange className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-ink">
            <p className="font-semibold text-primary">Statutory Compliance Calendar</p>
            <p className="text-muted mt-0.5">
              Automatically schedules periodic statutory BIR tax deadlines for your company.
              Existing obligations will not be duplicated.
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Year and Scope Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Fiscal Year <span className="text-red-500">*</span>
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={generating}
              className="w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
            >
              {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                <option key={y} value={y}>
                  FY {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Filing Period Scope <span className="text-red-500">*</span>
            </label>
            <select
              value={periodScope}
              onChange={(e) => setPeriodScope(e.target.value)}
              disabled={generating}
              className="w-full h-9 px-3 rounded-lg border border-border bg-surface !text-ink focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.sub})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tax Types Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Statutory Tax Types ({selectedTypes.size}/{TAX_TYPE_INFO.length} selected)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Select All
              </button>
              <span className="text-border">·</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-[11px] font-medium text-muted hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {TAX_TYPE_INFO.map((item) => {
              const checked = selectedTypes.has(item.type)
              return (
                <label
                  key={item.type}
                  onClick={() => toggleType(item.type)}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all duration-150 ${
                    checked
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-surface hover:bg-bg/60 opacity-70'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}} // handled by label onClick
                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-ink">{item.type}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface border border-border text-muted">
                          {item.cadence}
                        </span>
                        <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {item.rate}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                    <p className="text-[10px] text-muted/80 mt-1 font-mono">Due: {item.due}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Auto-calculation checkbox */}
        <div className="pt-1 border-t border-border">
          <label className="flex items-start gap-2.5 p-2 rounded-lg bg-bg/50 border border-border cursor-pointer">
            <input
              type="checkbox"
              checked={autoCalculatePast}
              onChange={(e) => setAutoCalculatePast(e.target.checked)}
              disabled={generating}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
            />
            <div className="text-xs">
              <span className="font-medium text-ink flex items-center gap-1">
                <Sparkles size={12} className="text-primary" /> Auto-calculate taxable base for
                past/current periods
              </span>
              <p className="text-muted text-[11px] mt-0.5">
                Automatically scans system Collections and Expenses for already settled or current
                months and derives initial tax base figures.
              </p>
            </div>
          </label>
        </div>

        {/* Summary Footer Note */}
        <div className="rounded-lg bg-surface border border-border p-2.5 flex items-center justify-between text-xs">
          <span className="text-muted">Estimated Filings to Schedule:</span>
          <span className="font-bold text-ink bg-bg px-2 py-0.5 rounded border border-border">
            Up to {projectedCount} obligation{projectedCount === 1 ? '' : 's'}
          </span>
        </div>
      </form>
    </Modal>
  )
}

