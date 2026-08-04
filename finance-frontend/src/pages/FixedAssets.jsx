import { useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Boxes, Wrench, Truck as TruckIcon, Building2 } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency, formatDate } from '../utils/formatters'

const categories = [
  { category_id: 1, category_name: 'Heavy Equipment' },
  { category_id: 2, category_name: 'Vehicles' },
  { category_id: 3, category_name: 'Office Equipment' },
  { category_id: 4, category_name: 'IT Equipment' },
]

const departments = [
  { department_id: 1, department_name: 'Finance' },
  { department_id: 2, department_name: 'Operations' },
  { department_id: 3, department_name: 'Marketing' },
  { department_id: 4, department_name: 'Human Resources' },
]

const suppliers = [
  { supplier_id: 1, supplier_name: 'Northgate Supplies Inc.' },
  { supplier_id: 2, supplier_name: 'Pinnacle Freight Co.' },
  { supplier_id: 3, supplier_name: 'Coastal Steel Traders' },
]

const CATEGORY_ICON = {
  'Heavy Equipment': Wrench,
  Vehicles: TruckIcon,
  'Office Equipment': Boxes,
  'IT Equipment': Boxes,
}

const initialAssets = [
  { id: 1, asset_code: 'FA-1001', asset_name: 'Mobile Crane Unit A', category_id: 1, purchase_date: '2023-02-14', purchase_cost: 8500000, salvage_value: 850000, useful_life: 10, status: 'Active', department_id: 2, supplier_id: 1, remarks: 'Primary lifting unit for Site B.', is_archived: false },
  { id: 2, asset_code: 'FA-1002', asset_name: 'Dump Truck #3', category_id: 2, purchase_date: '2022-08-01', purchase_cost: 2600000, salvage_value: 200000, useful_life: 8, status: 'Active', department_id: 2, supplier_id: 2, remarks: 'Assigned to hauling division.', is_archived: false },
  { id: 3, asset_code: 'FA-1003', asset_name: 'Executive Office Desks (Set of 6)', category_id: 3, purchase_date: '2021-05-20', purchase_cost: 180000, salvage_value: 10000, useful_life: 7, status: 'Active', department_id: 1, supplier_id: 3, remarks: '', is_archived: false },
  { id: 4, asset_code: 'FA-1004', asset_name: 'Server Rack & Backup NAS', category_id: 4, purchase_date: '2024-01-10', purchase_cost: 420000, salvage_value: 20000, useful_life: 5, status: 'Under Maintenance', department_id: 1, supplier_id: 3, remarks: 'RAID rebuild in progress.', is_archived: false },
  { id: 5, asset_code: 'FA-0987', asset_name: 'Flatbed Trailer (retired)', category_id: 2, purchase_date: '2016-03-02', purchase_cost: 950000, salvage_value: 50000, useful_life: 10, status: 'Disposed', department_id: 2, supplier_id: 2, remarks: 'Decommissioned, pending sale.', is_archived: true },
]

const EMPTY_FORM = {
  asset_code: '', asset_name: '', category_id: categories[0].category_id, purchase_date: '',
  purchase_cost: '', salvage_value: '', useful_life: '', status: 'Active',
  department_id: departments[0].department_id, supplier_id: suppliers[0].supplier_id, remarks: '',
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

// Straight-line depreciation: (cost - salvage) / useful_life per year, floored at salvage value
function currentBookValue(asset) {
  const years = (Date.now() - new Date(asset.purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  const annualDep = (asset.purchase_cost - asset.salvage_value) / (asset.useful_life || 1)
  const value = asset.purchase_cost - annualDep * years
  return Math.max(asset.salvage_value, Math.round(value))
}

export default function FixedAssets({ title = 'Fixed Assets', crumbs = ['Master Data', 'Fixed Assets'] }) {
  const [assets, setAssets] = useState(initialAssets)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const categoryName = (id) => categories.find((c) => c.category_id === Number(id))?.category_name ?? 'Unknown'
  const departmentName = (id) => departments.find((d) => d.department_id === Number(id))?.department_name ?? 'Unknown'
  const supplierName = (id) => suppliers.find((s) => s.supplier_id === Number(id))?.supplier_name ?? 'Unknown'

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (!showArchived && a.is_archived) return false
      if (showArchived && !a.is_archived) return false
      if (categoryFilter !== 'all' && a.category_id !== Number(categoryFilter)) return false
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      const q = search.toLowerCase()
      if (search && !a.asset_name.toLowerCase().includes(q) && !a.asset_code.toLowerCase().includes(q)) return false
      return true
    })
  }, [assets, search, categoryFilter, statusFilter, showArchived])

  const stats = useMemo(() => {
    const active = assets.filter((a) => !a.is_archived)
    return {
      total: active.length,
      totalValue: active.reduce((sum, a) => sum + currentBookValue(a), 0),
      maintenance: active.filter((a) => a.status === 'Under Maintenance').length,
      archived: assets.filter((a) => a.is_archived).length,
    }
  }, [assets])

  const toggleArchive = (id) => {
    setAssets((prev) =>
      prev.map((a) => (a.id === id ? { ...a, is_archived: !a.is_archived, status: !a.is_archived ? 'Disposed' : a.status } : a))
    )
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (a) => {
    setForm({
      asset_code: a.asset_code, asset_name: a.asset_name, category_id: a.category_id, purchase_date: a.purchase_date,
      purchase_cost: a.purchase_cost, salvage_value: a.salvage_value, useful_life: a.useful_life, status: a.status,
      department_id: a.department_id, supplier_id: a.supplier_id, remarks: a.remarks,
    })
    setFormError('')
    setModalMode(a)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.asset_code.trim() || !form.asset_name.trim() || !form.purchase_date) {
      setFormError('Asset code, asset name, and purchase date are required.')
      return
    }
    const payload = {
      ...form,
      category_id: Number(form.category_id),
      department_id: Number(form.department_id),
      supplier_id: Number(form.supplier_id),
      purchase_cost: Number(form.purchase_cost) || 0,
      salvage_value: Number(form.salvage_value) || 0,
      useful_life: Number(form.useful_life) || 1,
    }
    if (modalMode === 'add') {
      const nextId = Math.max(0, ...assets.map((a) => a.id)) + 1
      setAssets((prev) => [...prev, { id: nextId, ...payload, is_archived: false }])
    } else if (modalMode) {
      const editingId = modalMode.id
      setAssets((prev) => prev.map((a) => (a.id === editingId ? { ...a, ...payload } : a)))
    }
    closeModal()
  }

  const statCards = [
    { key: 'total', label: 'Total Assets', value: stats.total, icon: Boxes, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: categoryFilter === 'all' && statusFilter === 'all' && !showArchived, onClick: () => { setCategoryFilter('all'); setStatusFilter('all'); setShowArchived(false) } },
    { key: 'value', label: 'Total Book Value', value: formatCurrency(stats.totalValue), icon: Building2, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => { setShowArchived(false) } },
    { key: 'maintenance', label: 'Under Maintenance', value: stats.maintenance, icon: Wrench, iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400', isActive: statusFilter === 'Under Maintenance' && !showArchived, onClick: () => { setStatusFilter('Under Maintenance'); setShowArchived(false) } },
    { key: 'archived', label: 'Archived / Disposed', value: stats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: showArchived, onClick: () => setShowArchived(true) },
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
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by asset name or code..." className={`${INPUT} pl-9`} />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={INPUT}>
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT}>
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Under Maintenance">Under Maintenance</option>
          <option value="Disposed">Disposed</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-border accent-primary" />
          Show archived
        </label>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Asset</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Department / Supplier</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Purchased</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Book Value</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const CatIcon = CATEGORY_ICON[categoryName(a.category_id)] || Boxes
                return (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
                          <CatIcon size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{a.asset_name}</p>
                          <p className="truncate text-xs text-muted font-mono">{a.asset_code} &middot; {categoryName(a.category_id)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink text-xs">{departmentName(a.department_id)}</p>
                      <p className="text-muted text-xs">{supplierName(a.supplier_id)}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-muted text-xs">{formatDate(a.purchase_date)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="font-medium tabular-nums text-ink">{formatCurrency(currentBookValue(a))}</p>
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
                        <Tooltip label={a.is_archived ? 'Restore asset' : 'Archive asset'} align="end">
                          <button type="button" onClick={() => toggleArchive(a.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            {a.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No assets match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Asset' : 'Add Asset'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Asset'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Asset Code</label>
              <input type="text" value={form.asset_code} onChange={(e) => setForm((f) => ({ ...f, asset_code: e.target.value }))} className={INPUT} placeholder="FA-1001" />
            </div>
            <div>
              <label className={LABEL}>Category</label>
              <select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))} className={INPUT}>
                {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Asset Name</label>
            <input type="text" value={form.asset_name} onChange={(e) => setForm((f) => ({ ...f, asset_name: e.target.value }))} className={INPUT} placeholder="Mobile Crane Unit A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Department</label>
              <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))} className={INPUT}>
                {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.department_name}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Supplier</label>
              <select value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))} className={INPUT}>
                {suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Purchase Date</label>
              <input type="date" value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Useful Life (years)</label>
              <input type="number" value={form.useful_life} onChange={(e) => setForm((f) => ({ ...f, useful_life: e.target.value }))} className={INPUT} placeholder="10" />
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