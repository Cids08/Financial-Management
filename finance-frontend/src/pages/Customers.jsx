import { useEffect, useState, useCallback } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Users as UsersIcon, UserCheck, UserX, Mail, Phone, Eye, EyeOff, Wallet } from 'lucide-react'
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

const EMPTY_FORM = { customer_name: '', contact_person: '', contact_number: '', email: '', address: '', TIN: '', credit_limit: '0', status: 'Active' }

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

export default function Customers({ title = 'Customers', crumbs = ['Master Data', 'Customers'] }) {
  const { currency } = useCompany()
  const [customers, setCustomers] = useState([])
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, archived: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)

  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ currentPage: 1, lastPage: 1, total: 0 })

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

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (showArchived) params.set('archived', '1')
      params.set('page', String(page))
      params.set('per_page', '12') // matches Departments.jsx's page size

      const res = await apiFetch(`/api/customers?${params.toString()}`)
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load customers.')
      }

      setCustomers(json.data || [])
      if (json.meta) {
        setMeta({ currentPage: json.meta.current_page, lastPage: json.meta.last_page, total: json.meta.total })
      }

      // If an archive/restore emptied the current page, step back a page
      // instead of showing a blank table — same behavior as Departments.jsx.
      if ((json.data || []).length === 0 && page > 1) {
        setPage((p) => p - 1)
      }
    } catch (err) {
      setLoadError(err.message || 'Failed to load customers.')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, showArchived, page])

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/customers/stats')
      const json = await res.json()
      if (res.ok && json.success) {
        setStats(json.data)
      }
    } catch {
      // Non-critical — stat cards just keep their last known values.
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(fetchCustomers, 300) // debounce search typing
    return () => clearTimeout(timeout)
  }, [fetchCustomers])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Stats now come from a dedicated /stats endpoint (see fetchStats above) —
  // they reflect true global counts regardless of the current table filter,
  // rather than being derived from whatever subset is currently loaded.

  // Any filter change invalidates the current page number — jumping back
  // to page 1 avoids landing on an out-of-range page for the new result set.
  const updateFilter = (setter) => (value) => {
    setter(value)
    setPage(1)
  }

  const toggleArchive = async (c) => {
    try {
      const endpoint = c.is_archived
        ? `/api/customers/${c.customer_id}/restore`
        : `/api/customers/${c.customer_id}/archive`
      const res = await apiFetch(endpoint, { method: 'PATCH' })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to update customer.')
      }

      fetchCustomers()
      fetchStats()
    } catch (err) {
      setLoadError(err.message || 'Failed to update customer.')
    }
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (c) => {
    setForm({
      customer_name: c.customer_name,
      contact_person: c.contact_person,
      contact_number: c.contact_number || '',
      email: c.email,
      address: c.address || '',
      TIN: c.TIN || '',
      credit_limit: String(c.credit_limit ?? 0),
      status: c.status,
    })
    setFormError('')
    setModalMode(c)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.customer_name.trim() || !form.contact_person.trim() || !form.email.trim()) {
      setFormError('Customer name, contact person, and email are required.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setFormError('Enter a valid email address.')
      return
    }
    if (form.credit_limit !== '' && (isNaN(Number(form.credit_limit)) || Number(form.credit_limit) < 0)) {
      setFormError('Credit limit must be a valid non-negative number.')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const isEditing = modalMode !== 'add'
      const endpoint = isEditing ? `/api/customers/${modalMode.customer_id}` : '/api/customers'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify({ ...form, credit_limit: Number(form.credit_limit) || 0 }),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to save customer.')
      }

      closeModal()
      fetchCustomers()
      fetchStats()
    } catch (err) {
      setFormError(err.message || 'Failed to save customer.')
    } finally {
      setSaving(false)
    }
  }

  const statCards = [
    { key: 'total', label: 'Total Customers', value: stats.total, icon: UsersIcon, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: statusFilter === 'all' && !showArchived, onClick: () => { updateFilter(setStatusFilter)('all'); setShowArchived(false) } },
    { key: 'active', label: 'Active', value: stats.active, icon: UserCheck, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Active' && !showArchived, onClick: () => { updateFilter(setStatusFilter)('Active'); setShowArchived(false) } },
    { key: 'inactive', label: 'Inactive', value: stats.inactive, icon: UserX, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: statusFilter === 'Inactive' && !showArchived, onClick: () => { updateFilter(setStatusFilter)('Inactive'); setShowArchived(false) } },
    { key: 'archived', label: 'Archived', value: stats.archived, icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: showArchived, onClick: () => { setShowArchived(true); setPage(1) } },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Manage customer accounts used across receivables and collections.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Customer</Button>
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
          <input type="text" value={search} onChange={(e) => updateFilter(setSearch)(e.target.value)} placeholder="Search by name, contact, or email..." className={`${INPUT} pl-9`} />
        </div>
        <select value={statusFilter} onChange={(e) => updateFilter(setStatusFilter)(e.target.value)} className={INPUT}>
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
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface" border-border rounded-lg>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Customer</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Contact</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">TIN</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Balance / Limit</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">Loading customers…</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No customers match your filters.</td></tr>
              ) : (
                customers.map((c) => {
                  const revealed = revealedIds.has(c.customer_id)
                  return (
                    <tr key={c.customer_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-ink">{c.customer_name}</p>
                        <p className="text-xs text-muted truncate max-w-55">{c.address}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-1.5">
                          <div className="min-w-0">
                            <p className="text-ink">{c.contact_person}</p>
                            <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted font-mono">
                              <span className="flex items-center gap-1"><Mail size={11} className="shrink-0" /> {revealed ? c.email : maskEmail(c.email)}</span>
                              <span className="flex items-center gap-1"><Phone size={11} className="shrink-0" /> {revealed ? c.contact_number : maskValue(c.contact_number)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleReveal(c.customer_id)}
                            aria-label={revealed ? 'Hide contact details' : 'Show contact details'}
                            className="shrink-0 mt-0.5 text-muted hover:text-ink transition-colors duration-150"
                          >
                            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-muted font-mono text-xs">
                        {revealed ? c.TIN : maskValue(c.TIN)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        <p className={`font-medium ${Number(c.current_balance) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>
                          {formatCurrency(c.current_balance, currency)}
                        </p>
                        <p className="text-xs text-muted">of {formatCurrency(c.credit_limit, currency)} limit</p>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip label="Edit customer" align="start">
                            <button type="button" onClick={() => openEdit(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <Pencil size={15} />
                            </button>
                          </Tooltip>
                          <Tooltip label={c.is_archived ? 'Restore customer' : 'Archive customer'} align="end">
                            <button type="button" onClick={() => toggleArchive(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              {c.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
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

      {!loading && meta.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <p>
            Page {meta.currentPage} of {meta.lastPage} · {meta.total} customer{meta.total === 1 ? '' : 's'} total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={meta.currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={meta.currentPage >= meta.lastPage}
              onClick={() => setPage((p) => Math.min(meta.lastPage, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Customer' : 'Add Customer'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" loading={saving} onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Customer'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div>
            <label className={LABEL}>Customer Name</label>
            <input type="text" value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} className={INPUT} placeholder="Delacruz Trading" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Contact Person</label>
              <input type="text" value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} className={INPUT} placeholder="Juan Delacruz" />
            </div>
            <div>
              <label className={LABEL}>Contact Number</label>
              <input type="text" value={form.contact_number} onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))} className={INPUT} placeholder="0917 234 5678" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={INPUT} placeholder="accounts@company.com" />
          </div>
          <div>
            <label className={LABEL}>Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={INPUT} placeholder="Quezon City, Metro Manila" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>TIN</label>
              <input type="text" value={form.TIN} onChange={(e) => setForm((f) => ({ ...f, TIN: e.target.value }))} className={INPUT} placeholder="123-456-789-000" />
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Credit Limit</label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-primary focus-within:bg-white transition-colors duration-150">
              <Wallet size={15} className="text-muted shrink-0" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.credit_limit}
                onChange={(e) => setForm((f) => ({ ...f, credit_limit: e.target.value }))}
                placeholder="0.00"
                className="w-full text-sm text-ink bg-transparent outline-none border-0"
              />
            </div>
            {isEditing && (
              <p className="mt-1.5 text-[11px] text-muted">
                Current balance: {formatCurrency(modalMode?.current_balance, currency)} (updates automatically from receivables, not editable here)
              </p>
            )}
          </div>
        </form>
      </Modal>
    </div>
  )
}