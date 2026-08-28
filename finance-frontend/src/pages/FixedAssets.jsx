import { useState, useEffect } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Boxes, Wrench, Truck as TruckIcon, Building2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency, formatDate } from '../utils/formatters'
import { useFixedAssets } from '../hooks/useFixedAssets'
import { apiFetch } from '../utils/api'

// asset_category is a plain string column per the ERD (no lookup table) —
// this list is just the frontend's suggested set for the dropdown; typing
// a new one and saving it works fine too since there's no FK to violate.
const ASSET_CATEGORIES = ['Heavy Equipment', 'Vehicles', 'Office Equipment', 'IT Equipment']

const CATEGORY_ICON = {
  'Heavy Equipment': Wrench,
  Vehicles: TruckIcon,
  'Office Equipment': Boxes,
  'IT Equipment': Boxes,
}

const EMPTY_FORM = {
  asset_code: '', asset_name: '', asset_category: ASSET_CATEGORIES[0],
  serial_number: '', brand: '', model: '', location: '',
  department_id: '', purchase_date: '', purchase_cost: '', salvage_value: '',
  useful_life_years: '', status: 'Active', remarks: '',
}

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  'Under Maintenance': 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Disposed: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
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
  } = useFixedAssets()

  // Departments come from the real API now (see routes: GET /api/departments).
  // ASSUMPTION: DepartmentResource returns { id, department_name } — the
  // ERD column name. If your actual resource uses different keys, adjust
  // the two references below (department.id / department.department_name).
  const [departments, setDepartments] = useState([])
  useEffect(() => {
    apiFetch('/api/departments')
      .then((res) => res.json())
      .then((json) => { if (json.success) setDepartments(json.data) })
      .catch(() => {}) // non-fatal — form still works with a manual department_id if this fails
  }, [])

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
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
    setModalMode(a)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.asset_code.trim() || !form.asset_name.trim() || !form.purchase_date) {
      setFormError('Asset code, asset name, and purchase date are required.')
      return
    }

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

  // Page-scoped — see Collectors.jsx/CashAccounts.jsx for the same caveat.
  // meta.total (Total Assets card) is the one accurate global number.
  const maintenanceThisPage = assets.filter((a) => a.status === 'Under Maintenance').length
  const bookValueThisPage = assets.reduce((sum, a) => sum + a.book_value, 0)

  const statCards = [
    { key: 'total', label: 'Total Assets', value: meta.total, icon: Boxes, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: categoryFilter === 'all' && statusFilter === 'all' && !showArchived, onClick: () => { setCategoryFilter('all'); setStatusFilter('all'); setShowArchived(false) } },
    { key: 'value', label: 'Book Value (this page)', value: formatCurrency(bookValueThisPage), icon: Building2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => setShowArchived(false) },
    { key: 'maintenance', label: 'Under Maintenance (this page)', value: maintenanceThisPage, icon: Wrench, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: statusFilter === 'Under Maintenance' && !showArchived, onClick: () => { setStatusFilter('Under Maintenance'); setShowArchived(false) } },
    { key: 'archived', label: 'Archived / Disposed', value: showArchived ? meta.total : '—', icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: showArchived, onClick: () => setShowArchived(true) },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Track equipment, vehicles, and other capital assets and their depreciation.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Asset</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={18} className={card.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">{card.label}</p>
                <p className="text-lg font-bold text-ink">{card.value}</p>
              </div>
            </button>
          )
        })}
      </div>
      
      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by asset name, code, or serial no..." className={`${INPUT} pl-9`} />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={`${INPUT} lg:w-48! shrink-0`}
        >
          <option value="all">All Categories</option>
          {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${INPUT} lg:w-48! shrink-0`}
        >
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Under Maintenance">Under Maintenance</option>
          <option value="Disposed">Disposed</option>
        </select>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Asset</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Department / Location</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Purchased</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Book Value</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                  <Loader2 size={16} className="inline animate-spin mr-2" /> Loading assets…
                </td></tr>
              )}
              {!loading && assets.map((a) => {
                const CatIcon = CATEGORY_ICON[a.asset_category] || Boxes
                return (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
                          <CatIcon size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{a.asset_name}</p>
                          <p className="truncate text-xs text-muted font-mono">{a.asset_code} &middot; {a.asset_category}</p>
                          {(a.brand || a.model) && (
                            <p className="truncate text-[11px] text-muted">{[a.brand, a.model].filter(Boolean).join(' · ')}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink text-xs">{a.department_name || '—'}</p>
                      <p className="text-muted text-xs">{a.location || '—'}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-muted text-xs">{formatDate(a.purchase_date)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="font-medium tabular-nums text-ink">{formatCurrency(a.book_value)}</p>
                      <p className="text-[11px] text-muted">of {formatCurrency(a.purchase_cost)}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="Edit asset" align="start">
                          <button type="button" onClick={() => openEdit(a)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label={showArchived ? 'Restore asset' : 'Archive asset'} align="end">
                          <button
                            type="button"
                            onClick={() => (showArchived ? restoreAsset(a.id) : archiveAsset(a.id))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                          >
                            {showArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && assets.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No assets match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted">
            <span>Page {meta.current_page} of {meta.last_page} &middot; {meta.total} total</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-bg disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150">
                <ChevronLeft size={14} />
              </button>
              <button type="button" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-bg disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Asset' : 'Add Asset'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Asset'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-muted">
              Book value: <span className="font-mono text-ink">{formatCurrency(modalMode.book_value)}</span> (recalculated automatically on save)
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Asset Code</label>
              <input type="text" value={form.asset_code} onChange={(e) => setForm((f) => ({ ...f, asset_code: e.target.value }))} className={INPUT} placeholder="FA-1001" />
            </div>
            <div>
              <label className={LABEL}>Category</label>
              <select value={form.asset_category} onChange={(e) => setForm((f) => ({ ...f, asset_category: e.target.value }))} className={INPUT}>
                {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Asset Name</label>
            <input type="text" value={form.asset_name} onChange={(e) => setForm((f) => ({ ...f, asset_name: e.target.value }))} className={INPUT} placeholder="Mobile Crane Unit A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Brand</label>
              <input type="text" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} className={INPUT} placeholder="Komatsu" />
            </div>
            <div>
              <label className={LABEL}>Model</label>
              <input type="text" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} className={INPUT} placeholder="PC200-8" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Serial Number</label>
              <input type="text" value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} className={INPUT} placeholder="SN-88213" />
            </div>
            <div>
              <label className={LABEL}>Location</label>
              <input type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} className={INPUT} placeholder="Site B Yard" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Department</label>
            <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} className={INPUT}>
              <option value="">Unassigned</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Useful Life (years)</label>
              <input type="number" value={form.useful_life_years} onChange={(e) => setForm((f) => ({ ...f, useful_life_years: e.target.value }))} className={INPUT} placeholder="10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Purchase Cost</label>
              <input type="number" value={form.purchase_cost} onChange={(e) => setForm((f) => ({ ...f, purchase_cost: e.target.value }))} className={INPUT} placeholder="8500000" />
            </div>
            <div>
              <label className={LABEL}>Salvage Value</label>
              <input type="number" value={form.salvage_value} onChange={(e) => setForm((f) => ({ ...f, salvage_value: e.target.value }))} className={INPUT} placeholder="850000" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
              <option value="Active">Active</option>
              <option value="Under Maintenance">Under Maintenance</option>
              <option value="Disposed">Disposed</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Remarks</label>
            <textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows={2} className={`${INPUT} h-auto py-2 resize-none`} placeholder="Optional notes" />
          </div>
        </form>
      </Modal>
    </div>
  )
}