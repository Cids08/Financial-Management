import { useEffect, useState, useCallback } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Truck, UserCheck, UserX, Mail, Phone, Eye, EyeOff, Globe } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { apiFetch } from '../utils/api'
import { useCompany } from '../context/CompanyContext'

// Masks every character (keeps dashes/spaces as visual separators)
function maskValue(value) {
  if (!value) return value
  return value
    .split('')
    .map((ch) => (ch === '-' || ch === ' ' ? ch : '•'))
    .join('')
}

// Fully masks an email — no part of the local name or domain is shown
function maskEmail(value) {
  if (!value) return value
  return '•'.repeat(10)
}

function formatCurrency(value, currency = 'PHP') {
  const amount = Number(value) || 0
  return amount.toLocaleString('en-PH', { style: 'currency', currency })
}

const EMPTY_FORM = { supplier_name: '', contact_person: '', contact_number: '', email: '', website: '', address: '', TIN: '', status: 'Active' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Inactive: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

export default function Suppliers({ title = 'Suppliers', crumbs = ['Master Data', 'Suppliers'] }) {
  const { currency } = useCompany()
  const [suppliers, setSuppliers] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, archived: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // Controls visibility of TIN, contact number, and email together per row
  const [revealedIds, setRevealedIds] = useState(new Set())
  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (showArchived) params.set('archived', '1')
      params.set('per_page', '100')

      const res = await apiFetch(`/api/suppliers?${params.toString()}`)
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load suppliers.')
      }

      setSuppliers(json.data || [])
    } catch (err) {
      setLoadError(err.message || 'Failed to load suppliers.')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, showArchived])

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/suppliers/stats')
      const json = await res.json()
      if (res.ok && json.success) {
        setStats(json.data)
      }
    } catch {
      // Non-critical — stat cards just keep their last known values.
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(fetchSuppliers, 300) // debounce search typing
    return () => clearTimeout(timeout)
  }, [fetchSuppliers])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Stats now come from a dedicated /stats endpoint (see fetchStats above) —
  // they reflect true global counts regardless of the current table filter,
  // rather than being derived from whatever subset is currently loaded.

  const toggleArchive = async (s) => {
    try {
      const endpoint = s.is_archived
        ? `/api/suppliers/${s.supplier_id}/restore`
        : `/api/suppliers/${s.supplier_id}/archive`
      const res = await apiFetch(endpoint, { method: 'PATCH' })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to update supplier.')
      }

      fetchSuppliers()
      fetchStats()
    } catch (err) {
      setLoadError(err.message || 'Failed to update supplier.')
    }
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (s) => {
    setForm({
      supplier_name: s.supplier_name,
      contact_person: s.contact_person,
      contact_number: s.contact_number || '',
      email: s.email,
      website: s.website || '',
      address: s.address || '',
      TIN: s.TIN || '',
      status: s.status,
    })
    setFormError('')
    setModalMode(s)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.supplier_name.trim() || !form.contact_person.trim() || !form.email.trim()) {
      setFormError('Supplier name, contact person, and email are required.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setFormError('Enter a valid email address.')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const isEditing = modalMode !== 'add'
      const endpoint = isEditing ? `/api/suppliers/${modalMode.supplier_id}` : '/api/suppliers'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(form),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to save supplier.')
      }

      closeModal()
      fetchSuppliers()
      fetchStats()
    } catch (err) {
      setFormError(err.message || 'Failed to save supplier.')
    } finally {
      setSaving(false)
    }
  }

  const statCards = [
    { key: 'total', label: 'Total Suppliers', value: stats.total, icon: Truck, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { setStatusFilter('all'); setShowArchived(false) } },
    { key: 'active', label: 'Active', value: stats.active, icon: UserCheck, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Active' && !showArchived, onClick: () => { setStatusFilter('Active'); setShowArchived(false) } },
    { key: 'inactive', label: 'Inactive', value: stats.inactive, icon: UserX, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: statusFilter === 'Inactive' && !showArchived, onClick: () => { setStatusFilter('Inactive'); setShowArchived(false) } },
    { key: 'archived', label: 'Archived', value: stats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: showArchived, onClick: () => setShowArchived(true) },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Manage supplier accounts used across payables and disbursements.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Supplier</Button>
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
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, contact, or email..." className={`${INPUT} pl-9`} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={INPUT}>
          <option value="all">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <Button
          variant={showArchived ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => setShowArchived((prev) => !prev)}
          className="shrink-0 whitespace-nowrap"
        >
          Show Archived
        </Button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {loadError}
        </div>
      )}

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Supplier</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Contact</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">TIN</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Balance Owed</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">Loading suppliers…</td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No suppliers match your filters.</td></tr>
              ) : (
                suppliers.map((s) => {
                  const revealed = revealedIds.has(s.supplier_id)
                  return (
                    <tr key={s.supplier_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-ink">{s.supplier_name}</p>
                        <p className="text-xs text-muted truncate max-w-55">{s.address}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0">
                            <p className="text-ink">{s.contact_person}</p>
                            <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted font-mono">
                              <span className="flex items-center gap-1"><Mail size={11} className="shrink-0" /> {revealed ? s.email : maskEmail(s.email)}</span>
                              <span className="flex items-center gap-1"><Phone size={11} className="shrink-0" /> {revealed ? s.contact_number : maskValue(s.contact_number)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleReveal(s.supplier_id)}
                            aria-label={revealed ? 'Hide contact details' : 'Show contact details'}
                            className="shrink-0 mt-0.5 text-muted hover:text-ink transition-colors duration-150"
                          >
                            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-muted font-mono text-xs">
                        {revealed ? s.TIN : maskValue(s.TIN)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        <p className={`font-medium ${Number(s.current_balance) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>
                          {formatCurrency(s.current_balance, currency)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip label="Edit supplier" align="start">
                            <button type="button" onClick={() => openEdit(s)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <Pencil size={15} />
                            </button>
                          </Tooltip>
                          <Tooltip label={s.is_archived ? 'Restore supplier' : 'Archive supplier'} align="end">
                            <button type="button" onClick={() => toggleArchive(s)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              {s.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Supplier' : 'Add Supplier'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" loading={saving} onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Supplier'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div>
            <label className={LABEL}>Supplier Name</label>
            <input type="text" value={form.supplier_name} onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))} className={INPUT} placeholder="Northgate Supplies Inc." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Contact Person</label>
              <input type="text" value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} className={INPUT} placeholder="Rico Alvarado" />
            </div>
            <div>
              <label className={LABEL}>Contact Number</label>
              <input type="text" value={form.contact_number} onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))} className={INPUT} placeholder="0917 111 2233" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={INPUT} placeholder="sales@company.com" />
            </div>
            <div>
              <label className={LABEL}>Website</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-primary focus-within:bg-white transition-colors duration-150">
                <Globe size={15} className="text-muted shrink-0" />
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="northgatesupplies.com"
                  className="w-full text-sm text-ink bg-transparent outline-none border-0"
                />
              </div>
            </div>
          </div>
          <div>
            <label className={LABEL}>Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={INPUT} placeholder="Pasig City, Metro Manila" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>TIN</label>
              <input type="text" value={form.TIN} onChange={(e) => setForm((f) => ({ ...f, TIN: e.target.value }))} className={INPUT} placeholder="111-222-333-000" />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          {isEditing && (
            <p className="text-[11px] text-muted">
              Current balance owed: {formatCurrency(modalMode?.current_balance, currency)} (updates automatically from payables, not editable here)
            </p>
          )}
        </form>
      </Modal>
    </div>
  )
}