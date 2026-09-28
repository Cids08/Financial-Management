import { useState, useEffect, useMemo } from 'react'
import {
  Search, Plus, Pencil, Archive, RotateCcw, Boxes, Wrench,
  Truck as TruckIcon, Building2, Loader2, TrendingDown, X,
  Eye, Calculator, ShieldCheck, DollarSign, Calendar, Layers, FileText, CheckCircle2
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Pagination from '../components/Pagination'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency, formatDate } from '../utils/formatters'
import { MIN_INVOICE_AMOUNT, minHint } from '../utils/business'
import { useFixedAssets } from '../hooks/useFixedAssets'
import { apiFetch } from '../utils/api'
import { useHighlightRow } from '../hooks/useHighlightRow'
import DeletePermanentButton from '../components/DeletePermanentButton'
import RetentionCountdown from '../components/RetentionCountdown'
import { usePrivacy } from '../context/PrivacyContext'
import { useProfile } from '../hooks/useProfile'
import DepreciationRunModal from '../components/DepreciationRunModal'

// asset_category is a plain string column per the ERD
const ASSET_CATEGORIES = ['Heavy Equipment', 'Vehicles', 'Office Equipment', 'IT Equipment']

const CATEGORY_ICON = {
  'Heavy Equipment': Wrench,
  Vehicles: TruckIcon,
  'Office Equipment': Boxes,
  'IT Equipment': Boxes,
}

const EMPTY_FORM = {
  asset_code: '',
  asset_name: '',
  asset_category: ASSET_CATEGORIES[0],
  serial_number: '',
  brand: '',
  model: '',
  location: '',
  department_id: '',
  purchase_date: '',
  purchase_cost: '',
  salvage_value: '',
  useful_life_years: '',
  status: 'Active',
  remarks: '',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20',
  'Under Maintenance': 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20',
  Disposed: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20',
}

export default function FixedAssets({ title = 'Fixed Assets', crumbs = ['Master Data', 'Fixed Assets'] }) {
  const {
    assets, meta, loading, saving, error,
    search, setSearch,
    categoryFilter, setCategoryFilter,
    statusFilter, setStatusFilter,
    showArchived, setShowArchived,
    page, setPage,
    createAsset, updateAsset, archiveAsset, restoreAsset,
    fetchDepreciationPreview, executeDepreciationRun,
    refetch,
  } = useFixedAssets()

  usePrivacy()

  const { profile } = useProfile()
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin' || profile?.role_slug === 'admin' || profile?.role_slug === 'super-admin'

  const [showDepreciationModal, setShowDepreciationModal] = useState(false)
  const [viewingAsset, setViewingAsset] = useState(null)

  const { highlightedId, highlightSearch } = useHighlightRow()
  useEffect(() => {
    if (highlightSearch == null) return
    setSearch(highlightSearch)
    setCategoryFilter('all')
    setStatusFilter('all')
    setShowArchived(false)
    setPage(1)
  }, [highlightSearch])

  const [departments, setDepartments] = useState([])
  useEffect(() => {
    apiFetch('/api/departments')
      .then((res) => res.json())
      .then((json) => { if (json.success) setDepartments(json.data) })
      .catch(() => {})
  }, [])

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [dateErrors, setDateErrors] = useState({ purchase_date: '' })
  const [costErrors, setCostErrors] = useState({ purchase_cost: '', salvage_value: '', useful_life_years: '' })

  const validateDate = (field, value) => {
    if (!value) {
      setDateErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    const d = new Date(value)
    const min = new Date('2017-01-01')
    if (isNaN(d.getTime())) {
      setDateErrors((e) => ({ ...e, [field]: 'Invalid date.' }))
    } else if (d < min) {
      setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
    } else {
      setDateErrors((e) => ({ ...e, [field]: '' }))
    }
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setFormError('')
    setFieldErrors({})
    setDateErrors({ purchase_date: '' })
    setCostErrors({ purchase_cost: '', salvage_value: '', useful_life_years: '' })
    setModalMode('add')
  }

  const openEdit = (a) => {
    setForm({
      asset_code: a.asset_code,
      asset_name: a.asset_name,
      asset_category: a.asset_category,
      serial_number: a.serial_number || '',
      brand: a.brand || '',
      model: a.model || '',
      location: a.location || '',
      department_id: a.department_id || '',
      purchase_date: a.purchase_date,
      purchase_cost: a.purchase_cost,
      salvage_value: a.salvage_value,
      useful_life_years: a.useful_life,
      status: a.status,
      remarks: a.remarks || '',
    })
    setFormError('')
    setFieldErrors({})
    setDateErrors({ purchase_date: '' })
    setCostErrors({ purchase_cost: '', salvage_value: '', useful_life_years: '' })
    setModalMode(a)
    if (viewingAsset) setViewingAsset(null)
  }

  const closeModal = () => {
    setModalMode(null)
    setFormError('')
    setFieldErrors({})
    setDateErrors({ purchase_date: '' })
    setCostErrors({ purchase_cost: '', salvage_value: '', useful_life_years: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    const errors = {}

    if (!form.asset_code?.trim()) {
      errors.asset_code = 'Asset code is required.'
    }
    if (!form.asset_name?.trim()) {
      errors.asset_name = 'Asset name is required.'
    }
    if (!form.purchase_date) {
      errors.purchase_date = 'Purchase date is required.'
    }
    if (form.useful_life_years !== '' && (isNaN(Number(form.useful_life_years)) || Number(form.useful_life_years) < 1)) {
      errors.useful_life_years = 'Useful life must be at least 1 year.'
    }
    if (form.purchase_cost !== '' && Number(form.purchase_cost) < MIN_INVOICE_AMOUNT) {
      errors.purchase_cost = `Purchase cost must be at least ${formatCurrency(MIN_INVOICE_AMOUNT)}.`
    }
    if (form.salvage_value !== '' && Number(form.salvage_value) < 0) {
      errors.salvage_value = 'Salvage value cannot be negative.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    const payload = {
      asset_code: form.asset_code,
      asset_name: form.asset_name,
      asset_category: form.asset_category,
      serial_number: form.serial_number || null,
      brand: form.brand || null,
      model: form.model || null,
      location: form.location || null,
      department_id: form.department_id ? Number(form.department_id) : null,
      purchase_date: form.purchase_date,
      purchase_cost: Number(form.purchase_cost) || 0,
      salvage_value: Number(form.salvage_value) || 0,
      useful_life_years: Number(form.useful_life_years) || 1,
      status: form.status,
      remarks: form.remarks || null,
    }

    const result = modalMode === 'add'
      ? await createAsset(payload)
      : await updateAsset(modalMode.id, payload)

    if (!result.success) {
      setFormError(result.message)
      return
    }
    closeModal()
  }

  // Executive summary metrics (inspired by SAP B1 Fixed Assets Financial KPI Overview)
  const totalAssetsCount = meta.summary?.total_assets ?? meta.total
  const grossApcCost = meta.summary?.gross_historical_cost ?? assets.reduce((s, a) => s + (Number(a.purchase_cost) || 0), 0)
  const totalAccumDep = meta.summary?.total_accumulated_depreciation ?? assets.reduce((s, a) => s + (Number(a.accumulated_depreciation) || 0), 0)
  const totalNetBookValue = meta.summary?.net_book_value ?? assets.reduce((s, a) => s + (Number(a.book_value) || 0), 0)
  const underMaintenanceCount = meta.summary?.under_maintenance ?? assets.filter((a) => a.status === 'Under Maintenance').length

  const statCards = [
    {
      key: 'total',
      label: 'Capital Assets',
      sublabel: `${underMaintenanceCount} under maintenance`,
      value: totalAssetsCount,
      icon: Boxes,
      iconBg: 'bg-primary/15 text-primary-dark',
      isActive: categoryFilter === 'all' && statusFilter === 'all' && !showArchived,
      onClick: () => { setCategoryFilter('all'); setStatusFilter('all'); setShowArchived(false) },
    },
    {
      key: 'apc',
      label: 'Historical Cost (APC)',
      sublabel: 'Capitalized gross investment',
      value: formatCurrency(grossApcCost),
      icon: Building2,
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
      isActive: false,
      onClick: () => setShowArchived(false),
    },
    {
      key: 'dep',
      label: 'Accumulated Depreciation',
      sublabel: 'Contra-asset reserve (Acct 1590)',
      value: formatCurrency(totalAccumDep),
      icon: TrendingDown,
      iconBg: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
      isActive: false,
      onClick: () => setShowArchived(false),
    },
    {
      key: 'nbv',
      label: 'Net Book Value (NBV)',
      sublabel: 'Balance sheet carrying value',
      value: formatCurrency(totalNetBookValue),
      icon: ShieldCheck,
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
      isActive: false,
      onClick: () => setShowArchived(false),
    },
  ]

  // Real-time valuation calculations for the Add/Edit form (SAP B1 Depreciation Preview)
  const formCost = Number(form.purchase_cost) || 0
  const formSalvage = Number(form.salvage_value) || 0
  const formLife = Number(form.useful_life_years) || 1
  const formDepreciableBase = Math.max(0, formCost - formSalvage)
  const formEstAnnualDep = formLife > 0 ? formDepreciableBase / formLife : 0
  const formEstMonthlyDep = formEstAnnualDep / 12

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-primary/10 text-primary-dark">
              <Layers size={10} /> Sub-Ledger
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Enterprise Asset Master Data, Net Book Value valuation, and automated periodic depreciation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={TrendingDown} onClick={() => setShowDepreciationModal(true)}>
            Depreciation Run
          </Button>
          {isAdmin && (
            <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>
              Add Asset
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ERP KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              className={`${PANEL} ${PANEL_PAD} flex items-start justify-between text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className="min-w-0 pr-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{card.label}</p>
                <p className="text-xl font-bold text-ink mt-0.5 tabular-nums truncate">{card.value}</p>
                <p className="text-[11px] text-muted mt-1 truncate">{card.sublabel}</p>
              </div>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}>
                <Icon size={18} />
              </div>
            </button>
          )
        })}
      </div>

      {/* Filter and Search Panel */}
      <div className={`${PANEL} ${PANEL_PAD}`}>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              Search Master Data
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by asset code, name, serial no, or model..."
                className={`${INPUT} pl-9 pr-9`}
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-border hover:text-ink transition-colors duration-150"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="w-full sm:w-44 shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Asset Class</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={INPUT}
            >
              <option value="all">All Asset Classes</option>
              {ASSET_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-44 shrink-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Operational Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={INPUT}
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Under Maintenance">Under Maintenance</option>
              <option value="Disposed">Disposed</option>
            </select>
          </div>

          {(search || categoryFilter !== 'all' || statusFilter !== 'all' || showArchived) && (
            <div className="shrink-0">
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                iconPosition="left"
                onClick={() => {
                  setSearch('')
                  setCategoryFilter('all')
                  setStatusFilter('all')
                  setShowArchived(false)
                }}
              >
                Reset
              </Button>
            </div>
          )}

          <div className="sm:ml-auto flex items-center gap-1.5 pt-1 sm:pt-0">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${showArchived
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30'
                  : 'bg-bg text-muted hover:text-ink border border-border'
                }`}
            >
              <Archive size={13} />
              {showArchived ? 'Viewing Archived' : 'View Archived'}
            </button>
          </div>
        </div>
      </div>

      {/* Asset Sub-Ledger Table */}
      <div className={`${PANEL} overflow-hidden`}>
        <div className="overflow-hidden rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="bg-surface border-b border-border/60 text-[11px] uppercase tracking-wider text-muted font-semibold">
              <tr>
                <th className="text-left px-4 py-3">Asset Master Record</th>
                <th className="text-left px-3.5 py-3">Cost Center / Location</th>
                <th className="text-right px-3.5 py-3 whitespace-nowrap">Acquisition Cost</th>
                <th className="text-right px-3.5 py-3 whitespace-nowrap">Net Book Value & Dep.</th>
                <th className="text-center px-3 py-3 whitespace-nowrap">Status</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">
                    <Loader2 size={18} className="inline animate-spin mr-2 text-primary" /> Loading Asset Sub-Ledger…
                  </td>
                </tr>
              )}

              {!loading && assets.map((a) => {
                const CatIcon = CATEGORY_ICON[a.asset_category] || Boxes
                const cost = Number(a.purchase_cost) || 0
                const accum = Number(a.accumulated_depreciation) || 0
                const bookVal = Number(a.book_value) || 0
                const depPct = cost > 0 ? Math.min(100, Math.round((accum / cost) * 100)) : 0
                const remPct = Math.max(0, 100 - depPct)

                return (
                  <tr
                    key={a.id}
                    data-row-id={a.id}
                    className={`border-b border-border/40 last:border-0 transition-colors duration-150
                      ${highlightedId === a.id ? 'bg-primary/10' : 'hover:bg-bg/60'}`}
                  >
                    {/* Asset Master Record: Clean 2-line layout */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-dark border border-primary/20">
                          <CatIcon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink text-sm" title={a.asset_name}>
                            {a.asset_name}
                          </p>
                          <p className="truncate text-xs text-muted">
                            <span className="font-mono text-primary-dark font-medium">{a.asset_code}</span>
                            <span className="mx-1.5 opacity-40">&bull;</span>
                            <span>{a.asset_category}</span>
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Cost Center / Location */}
                    <td className="px-3.5 py-3">
                      <p className="text-ink text-xs font-medium truncate">{a.department_name || 'Fleet Division'}</p>
                      <p className="text-muted text-[11px] truncate">{a.location || 'Depot / Yard'}</p>
                    </td>

                    {/* Acquisition Cost (APC) & Date */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-right">
                      <span className="font-mono font-medium text-ink tabular-nums text-xs">
                        {formatCurrency(cost)}
                      </span>
                      <p className="text-[11px] text-muted tabular-nums">
                        {formatDate(a.purchase_date)}
                      </p>
                    </td>

                    {/* Net Book Value & Accumulated Dep. */}
                    <td className="px-3.5 py-3 whitespace-nowrap text-right">
                      <div className="font-mono font-semibold text-ink tabular-nums text-xs">
                        {formatCurrency(bookVal)}
                      </div>
                      <p className="text-[10.5px] text-muted font-mono tabular-nums">
                        <span className="text-amber-600 dark:text-amber-400">-{formatCurrency(accum)}</span> ({remPct}% NBV)
                      </p>
                    </td>

                    {/* Operational Status */}
                    <td className="px-3 py-3 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[a.status] || ''}`}>
                        {a.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {/* View Master Record */}
                        <Tooltip label="View Asset Master Record" align="start">
                          <button
                            type="button"
                            onClick={() => setViewingAsset(a)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-primary transition-colors duration-150"
                          >
                            <Eye size={15} />
                          </button>
                        </Tooltip>

                        {!showArchived && (
                          <Tooltip label="Edit asset" align="start">
                            <button
                              type="button"
                              onClick={() => openEdit(a)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <Pencil size={15} />
                            </button>
                          </Tooltip>
                        )}

                        {isAdmin && (
                          <Tooltip label={showArchived ? 'Restore asset' : 'Archive asset'} align="end">
                            <button
                              type="button"
                              onClick={() => (showArchived ? restoreAsset(a.id) : archiveAsset(a.id))}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              {showArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
                            </button>
                          </Tooltip>
                        )}

                        {showArchived && (
                          <>
                            <RetentionCountdown deletedAt={a.deleted_at} compact />
                            {isAdmin && (
                              <DeletePermanentButton
                                endpoint={`/api/fixed-assets/${a.id}/permanent`}
                                label="fixed asset"
                                name={a.asset_name || ''}
                                onDeleted={refetch}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {!loading && assets.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                    No fixed assets match your search or filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={meta.last_page}
          onPageChange={setPage}
          total={meta.total}
          label="fixed assets"
          bordered
        />
      </div>

      {/* SAP Business One Inspired Asset Master Record Modal */}
      <Modal
        open={!!viewingAsset}
        onClose={() => setViewingAsset(null)}
        title="Asset Master Record"
        size="2xl"
        maxWidth="max-w-4xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-muted font-mono">
              FMS Sub-Ledger &bull; PAS 16 Compliant
            </span>
            <div className="flex items-center gap-2">
              {!viewingAsset?.is_archived && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Pencil}
                  onClick={() => openEdit(viewingAsset)}
                >
                  Edit Master Data
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => setViewingAsset(null)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        {viewingAsset && (
          <div className="space-y-4 text-ink">
            {/* Asset Header Banner */}
            <div className="rounded-xl border border-border bg-bg/50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-primary/10 text-primary-dark border border-primary/20">
                      {viewingAsset.asset_code}
                    </span>
                    <span className="text-xs text-muted font-medium">
                      {viewingAsset.asset_category}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-ink mt-1">
                    {viewingAsset.asset_name}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[viewingAsset.status] || ''}`}>
                    {viewingAsset.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Financial Valuation Summary (APC, Accum Dep, NBV, Salvage) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-lg border border-border bg-surface">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Acquisition Cost</p>
                <p className="text-sm font-bold font-mono text-ink mt-0.5 tabular-nums">
                  {formatCurrency(viewingAsset.purchase_cost)}
                </p>
                <p className="text-[10px] text-muted">Capitalized APC</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Accum. Depreciation</p>
                <p className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">
                  {formatCurrency(viewingAsset.accumulated_depreciation)}
                </p>
                <p className="text-[10px] text-muted">Contra-Asset Balance</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Net Book Value (NBV)</p>
                <p className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                  {formatCurrency(viewingAsset.book_value)}
                </p>
                <p className="text-[10px] text-muted">Balance Sheet Value</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Salvage / Scrap Floor</p>
                <p className="text-sm font-bold font-mono text-ink mt-0.5 tabular-nums">
                  {formatCurrency(viewingAsset.salvage_value)}
                </p>
                <p className="text-[10px] text-muted">Minimum Residual</p>
              </div>
            </div>

            {/* Visual Carrying Value Bar */}
            {(() => {
              const cost = Number(viewingAsset.purchase_cost) || 0
              const accum = Number(viewingAsset.accumulated_depreciation) || 0
              const depPct = cost > 0 ? Math.min(100, Math.round((accum / cost) * 100)) : 0
              const remPct = Math.max(0, 100 - depPct)

              return (
                <div className="rounded-lg border border-border p-3 bg-surface">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-muted uppercase text-[10.5px]">Depreciation Life Cycle</span>
                    <span className="font-mono text-ink">{depPct}% Expired &bull; {remPct}% Remaining</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-border overflow-hidden flex">
                    <div
                      className="bg-amber-500 h-full transition-all duration-300"
                      style={{ width: `${depPct}%` }}
                      title={`Depreciated: ${depPct}%`}
                    />
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${remPct}%` }}
                      title={`Remaining Book Value: ${remPct}%`}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10.5px] text-muted mt-1.5">
                    <span>Acquisition: {formatDate(viewingAsset.purchase_date)}</span>
                    <span>Salvage Floor: {formatCurrency(viewingAsset.salvage_value)}</span>
                  </div>
                </div>
              )
            })()}

            {/* Master Details: 2-Column ERP Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Physical & Identification */}
              <div className="rounded-lg border border-border p-3.5 bg-surface space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Boxes size={14} className="text-primary" /> Physical & Custody Data
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted block text-[11px]">Brand:</span>
                    <span className="font-medium text-ink">{viewingAsset.brand || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Model:</span>
                    <span className="font-medium text-ink">{viewingAsset.model || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Serial / Chassis No:</span>
                    <span className="font-mono text-ink">{viewingAsset.serial_number || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Cost Center (Dept):</span>
                    <span className="font-medium text-ink">{viewingAsset.department_name || 'Fleet Division'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted block text-[11px]">Physical Location / Yard:</span>
                    <span className="font-medium text-ink">{viewingAsset.location || '—'}</span>
                  </div>
                </div>
                {viewingAsset.remarks && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-muted block text-[11px]">Operational Remarks:</span>
                    <p className="text-xs text-ink italic mt-0.5">{viewingAsset.remarks}</p>
                  </div>
                )}
              </div>

              {/* Right Column: Depreciation & Financial Parameters */}
              <div className="rounded-lg border border-border p-3.5 bg-surface space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Calculator size={14} className="text-primary" /> Depreciation Parameters
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted block text-[11px]">Method:</span>
                    <span className="font-medium text-ink">{viewingAsset.depreciation_method || 'Straight Line'}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Useful Life:</span>
                    <span className="font-medium text-ink">{viewingAsset.useful_life} Years</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Annual Depreciation:</span>
                    <span className="font-mono text-ink">{formatCurrency(viewingAsset.annual_depreciation)}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Monthly Depreciation:</span>
                    <span className="font-mono text-ink">{formatCurrency(viewingAsset.annual_depreciation / 12)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted block text-[11px]">Depreciable Base:</span>
                    <span className="font-mono text-ink">
                      {formatCurrency(Math.max(0, viewingAsset.purchase_cost - viewingAsset.salvage_value))}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* General Ledger Account Determination Banner */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-primary-dark flex items-center gap-1.5 uppercase text-[11px]">
                  <CheckCircle2 size={14} /> General Ledger Account Determination
                </span>
                <span className="text-[10.5px] text-muted">Automated Voucher DEP-YYYYMM</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11.5px] mt-1">
                <div className="flex items-center justify-between bg-bg/80 px-2.5 py-1.5 rounded-lg border border-border">
                  <span className="text-muted">Debit (P&L Expense):</span>
                  <span className="font-bold text-ink">5500 - Depreciation Expense</span>
                </div>
                <div className="flex items-center justify-between bg-bg/80 px-2.5 py-1.5 rounded-lg border border-border">
                  <span className="text-muted">Credit (Contra-Asset):</span>
                  <span className="font-bold text-ink">1590 - Accumulated Depreciation</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / Edit Asset Modal with Real-time ERP Valuation Calculator */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? `Edit Asset Master — ${modalMode.asset_code}` : 'Add Asset Master Record'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Asset Master'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {formError}
            </div>
          )}

          {/* Section 1: Asset Master & Identification */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 pb-1 border-b border-border">
              <Boxes size={13} className="text-primary" /> Asset Identification
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Asset Code <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.asset_code}
                  onChange={(e) => {
                    setFieldErrors((fe) => ({ ...fe, asset_code: '' }))
                    setForm((f) => ({ ...f, asset_code: e.target.value }))
                  }}
                  className={`${INPUT} font-mono ${fieldErrors.asset_code ? 'border-red-400 dark:border-red-500' : ''}`}
                  placeholder="FA-2024-009"
                />
                {fieldErrors.asset_code && <p className="mt-1 text-xs text-red-500">{fieldErrors.asset_code}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className={LABEL}>Asset Description / Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.asset_name}
                  onChange={(e) => {
                    setFieldErrors((fe) => ({ ...fe, asset_name: '' }))
                    setForm((f) => ({ ...f, asset_name: e.target.value }))
                  }}
                  className={`${INPUT} ${fieldErrors.asset_name ? 'border-red-400 dark:border-red-500' : ''}`}
                  placeholder="e.g. Tadano 50-Ton Rough Terrain Crane"
                />
                {fieldErrors.asset_name && <p className="mt-1 text-xs text-red-500">{fieldErrors.asset_name}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Asset Class / Category</label>
                <select
                  value={form.asset_category}
                  onChange={(e) => setForm((f) => ({ ...f, asset_category: e.target.value }))}
                  className={INPUT}
                >
                  {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Brand / Manufacturer</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  className={INPUT}
                  placeholder="e.g. Caterpillar"
                />
              </div>
              <div>
                <label className={LABEL}>Model</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  className={INPUT}
                  placeholder="e.g. 320D"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Physical Location & Cost Center */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 pb-1 border-b border-border">
              <Building2 size={13} className="text-primary" /> Location & Responsibility
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Serial / Chassis No.</label>
                <input
                  type="text"
                  value={form.serial_number}
                  onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
                  className={`${INPUT} font-mono`}
                  placeholder="SN-99812-PH"
                />
              </div>
              <div>
                <label className={LABEL}>Department (Cost Center)</label>
                <select
                  value={form.department_id}
                  onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                  className={INPUT}
                >
                  <option value="">Unassigned Fleet</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Physical Yard / Site Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className={INPUT}
                  placeholder="Yard 1 - Main Depot"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Capitalization & Depreciation Parameters */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 pb-1 border-b border-border">
              <Calculator size={13} className="text-primary" /> Capitalization & Valuation Parameters
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className={LABEL}>Acquisition Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={form.purchase_date}
                  min="2017-01-01"
                  onChange={(e) => {
                    setFieldErrors((fe) => ({ ...fe, purchase_date: '' }))
                    setForm((f) => ({ ...f, purchase_date: e.target.value }))
                  }}
                  onBlur={(e) => validateDate('purchase_date', e.target.value)}
                  className={`${INPUT} scheme-light dark:scheme-dark ${(fieldErrors.purchase_date || dateErrors.purchase_date) ? 'border-red-400 dark:border-red-500' : ''}`}
                />
                {(fieldErrors.purchase_date || dateErrors.purchase_date) && (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.purchase_date || dateErrors.purchase_date}</p>
                )}
              </div>

              <div>
                <label className={LABEL}>Acquisition Cost (APC)</label>
                <input
                  type="number"
                  min={MIN_INVOICE_AMOUNT}
                  step="any"
                  value={form.purchase_cost}
                  onChange={(e) => {
                    const val = e.target.value
                    setFieldErrors((fe) => ({ ...fe, purchase_cost: '' }))
                    setForm((f) => ({ ...f, purchase_cost: val }))
                  }}
                  className={`${INPUT} font-mono`}
                  placeholder={minHint(MIN_INVOICE_AMOUNT)}
                />
              </div>

              <div>
                <label className={LABEL}>Salvage / Scrap Floor</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.salvage_value}
                  onChange={(e) => {
                    const val = e.target.value
                    setFieldErrors((fe) => ({ ...fe, salvage_value: '' }))
                    setForm((f) => ({ ...f, salvage_value: val }))
                  }}
                  className={`${INPUT} font-mono`}
                  placeholder="0"
                />
              </div>

              <div>
                <label className={LABEL}>Useful Life (Years)</label>
                <input
                  type="number"
                  min="1"
                  value={form.useful_life_years}
                  onChange={(e) => {
                    const val = e.target.value
                    setFieldErrors((fe) => ({ ...fe, useful_life_years: '' }))
                    setForm((f) => ({ ...f, useful_life_years: val }))
                  }}
                  className={`${INPUT} font-mono`}
                  placeholder="10"
                />
              </div>
            </div>

            {/* Real-time ERP Valuation Calculator Preview Box */}
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
              <div className="flex items-center justify-between text-[11px] font-semibold text-primary-dark uppercase mb-1">
                <span>Valuation Preview (Straight Line)</span>
                <span className="font-mono">PFRS / PAS 16</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div>
                  <span className="text-muted block text-[10px]">Depreciable Base:</span>
                  <span className="font-bold text-ink">{formatCurrency(formDepreciableBase)}</span>
                </div>
                <div>
                  <span className="text-muted block text-[10px]">Est. Annual Dep.:</span>
                  <span className="font-bold text-ink">{formatCurrency(formEstAnnualDep)}</span>
                </div>
                <div>
                  <span className="text-muted block text-[10px]">Est. Monthly Dep.:</span>
                  <span className="font-bold text-ink">{formatCurrency(formEstMonthlyDep)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Operational Status & Remarks */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className={LABEL}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={INPUT}
              >
                <option value="Active">Active</option>
                <option value="Under Maintenance">Under Maintenance</option>
                <option value="Disposed">Disposed</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Operational Remarks</label>
              <input
                type="text"
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                className={INPUT}
                placeholder="Optional asset notes"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Automated Periodic Depreciation Run Wizard Modal */}
      <DepreciationRunModal
        open={showDepreciationModal}
        onClose={() => setShowDepreciationModal(false)}
        categories={ASSET_CATEGORIES}
        fetchDepreciationPreview={fetchDepreciationPreview}
        executeDepreciationRun={executeDepreciationRun}
      />
    </div>
  )
}
