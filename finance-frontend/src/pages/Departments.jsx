import { useEffect, useState, useCallback } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Building2, Users, Mail, Phone, UserCog, Eye, EyeOff } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { apiFetch } from '../utils/api'
import { useHighlightRow } from '../hooks/useHighlightRow'

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

const EMPTY_FORM = { department_name: '', department_head: '', department_email: '', department_phone: '', description: '', status: 'Active' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Inactive: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

export default function Departments({ title = 'Departments', crumbs = ['Master Data', 'Departments'] }) {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ currentPage: 1, lastPage: 1, total: 0 })
  const [showArchived, setShowArchived] = useState(false)
  const [revealedIds, setRevealedIds] = useState(new Set())

  // Global search (SearchBar.jsx) navigates here with a highlightId (and,
  // since this grid's `search` filter is server-side, a highlightSearch
  // seed) whenever a department record is clicked from search results.
  const { highlightedId, highlightSearch } = useHighlightRow()
  useEffect(() => {
    if (highlightSearch == null) return
    setSearch(highlightSearch)
    setShowArchived(false)
    setPage(1)
  }, [highlightSearch])

  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const [deptToArchive, setDeptToArchive] = useState(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [restoreBusyId, setRestoreBusyId] = useState(null)

  const fetchDepartments = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('page', String(page))
      params.set('per_page', '12') // 12 divides evenly into the 1/2/3-column card grid
      if (showArchived) params.set('archived', '1')

      const res = await apiFetch(`/api/departments?${params.toString()}`)
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to load departments.')
      }

      setDepartments(json.data || [])
      if (json.meta) {
        setMeta({ currentPage: json.meta.current_page, lastPage: json.meta.last_page, total: json.meta.total })
      }

      // If an archive/restore emptied the current page, step back a page
      // instead of showing a blank grid.
      if ((json.data || []).length === 0 && page > 1) {
        setPage((p) => p - 1)
      }
    } catch (err) {
      setLoadError(err.message || 'Failed to load departments.')
    } finally {
      setLoading(false)
    }
  }, [search, page, showArchived])

  useEffect(() => {
    const timeout = setTimeout(fetchDepartments, 300) // debounce search typing
    return () => clearTimeout(timeout)
  }, [fetchDepartments])

  // Switching views should always land back on page 1 — an archived-list
  // page number has no relationship to the active list's pagination.
  const toggleShowArchived = (checked) => {
    setShowArchived(checked)
    setPage(1)
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (d) => {
    setForm({
      department_name: d.department_name,
      department_head: d.department_head || '',
      department_email: d.department_email || '',
      department_phone: d.department_phone || '',
      description: d.description || '',
      status: d.status,
    })
    setFormError('')
    setModalMode(d)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.department_name.trim()) {
      setFormError('Department name is required.')
      return
    }
    if (form.department_email && !/^\S+@\S+\.\S+$/.test(form.department_email)) {
      setFormError('Enter a valid department email address.')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const isEditing = modalMode !== 'add'
      const endpoint = isEditing ? `/api/departments/${modalMode.department_id}` : '/api/departments'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify({ ...form, is_active: form.status === 'Active' }),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to save department.')
      }

      closeModal()
      fetchDepartments()
    } catch (err) {
      setFormError(err.message || 'Failed to save department.')
    } finally {
      setSaving(false)
    }
  }

  const confirmArchive = async () => {
    setArchiving(true)
    setArchiveError('')
    try {
      const res = await apiFetch(`/api/departments/${deptToArchive.department_id}`, { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to archive department.')
      }

      setDeptToArchive(null)
      fetchDepartments()
    } catch (err) {
      setArchiveError(err.message || 'Failed to archive department.')
    } finally {
      setArchiving(false)
    }
  }

  const restoreDepartment = async (department) => {
    setRestoreBusyId(department.department_id)
    try {
      const res = await apiFetch(`/api/departments/${department.department_id}/restore`, { method: 'PATCH' })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to restore department.')
      }

      fetchDepartments()
    } catch (err) {
      setLoadError(err.message || 'Failed to restore department.')
    } finally {
      setRestoreBusyId(null)
    }
  }

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Manage organizational departments used across budgets and disbursements.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Department</Button>
        </div>
      </div>

      <div className={`${PANEL} p-4 flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search departments..." className={`${INPUT} pl-9`} />
        </div>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className={`${PANEL} p-10 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>Loading departments…</div>
        ) : departments.length === 0 ? (
          <div className={`${PANEL} p-10 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>
            {showArchived ? 'No archived departments.' : 'No departments match your search.'}
          </div>
        ) : (
          departments.map((d) => (
            <div
              key={d.department_id}
              data-row-id={d.department_id}
              className={`${PANEL} p-4 flex flex-col gap-3 transition-colors duration-300
                ${showArchived ? 'opacity-75' : ''} ${highlightedId === d.department_id ? 'ring-2 ring-primary/50 bg-primary/10' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
                  <Building2 size={18} />
                </div>
                <div className="flex items-center gap-1">
                  {showArchived ? (
                    <Tooltip label="Restore department" align="end">
                      <button
                        type="button"
                        onClick={() => restoreDepartment(d)}
                        disabled={restoreBusyId === d.department_id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50"
                      >
                        <RotateCcw size={15} />
                      </button>
                    </Tooltip>
                  ) : (
                    <>
                      <Tooltip label="Edit department" align="start">
                        <button type="button" onClick={() => openEdit(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Pencil size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Archive department" align="end">
                        <button type="button" onClick={() => { setDeptToArchive(d); setArchiveError('') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors duration-150">
                          <Archive size={15} />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{d.department_name}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[d.status]}`}>{d.status}</span>
                </div>
                {d.description && <p className="mt-1 text-xs leading-relaxed text-muted">{d.description}</p>}
              </div>

              {(d.department_head || d.department_email || d.department_phone) && (
                <div className="flex flex-col gap-1 text-xs text-muted">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted/70">Contact details</span>
                    {(d.department_email || d.department_phone) && (
                      <Tooltip label={revealedIds.has(d.department_id) ? 'Hide details' : 'Show details'} align="end">
                        <button
                          type="button"
                          onClick={() => toggleReveal(d.department_id)}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                        >
                          {revealedIds.has(d.department_id) ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  {d.department_head && (
                    <span className="flex items-center gap-1.5">
                      <UserCog size={12} className="shrink-0" />
                      {d.department_head}
                    </span>
                  )}
                  {d.department_email && (
                    <span className="flex items-center gap-1.5">
                      <Mail size={12} className="shrink-0" />
                      {revealedIds.has(d.department_id) ? d.department_email : maskEmail(d.department_email)}
                    </span>
                  )}
                  {d.department_phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone size={12} className="shrink-0" />
                      {revealedIds.has(d.department_id) ? d.department_phone : maskValue(d.department_phone)}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-auto flex items-center gap-1.5 text-xs text-muted pt-2 border-t border-border">
                <Users size={13} /> {d.headcount ?? 0} {d.headcount === 1 ? 'employee' : 'employees'}
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && meta.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <p>
            Page {meta.currentPage} of {meta.lastPage} · {meta.total} department{meta.total === 1 ? '' : 's'} total
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
        title={isEditing ? 'Edit Department' : 'Add Department'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" loading={saving} onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Department'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div>
            <label className={LABEL}>Department Name</label>
            <input type="text" value={form.department_name} onChange={(e) => setForm((f) => ({ ...f, department_name: e.target.value }))} className={INPUT} placeholder="e.g. Finance" />
          </div>
          <div>
            <label className={LABEL}>Department Head</label>
            <input type="text" value={form.department_head} onChange={(e) => setForm((f) => ({ ...f, department_head: e.target.value }))} className={INPUT} placeholder="e.g. Maria Santos" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Department Email</label>
              <input type="email" value={form.department_email} onChange={(e) => setForm((f) => ({ ...f, department_email: e.target.value }))} className={INPUT} placeholder="finance@alibaton.com" />
            </div>
            <div>
              <label className={LABEL}>Department Phone</label>
              <input type="text" value={form.department_phone} onChange={(e) => setForm((f) => ({ ...f, department_phone: e.target.value }))} className={INPUT} placeholder="+63 2 8XXX XXXX" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className={`${INPUT} h-auto py-2 resize-none`} placeholder="What does this department handle?" />
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        open={deptToArchive !== null}
        onClose={() => { setDeptToArchive(null); setArchiveError('') }}
        title="Archive Department"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => { setDeptToArchive(null); setArchiveError('') }}>Cancel</Button>
            <Button
              variant="danger"
              size="md"
              loading={archiving}
              disabled={deptToArchive?.headcount > 0}
              onClick={confirmArchive}
            >
              Archive
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {archiveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{archiveError}</div>
          )}
          <p className="text-sm text-ink">
            Are you sure you want to archive <span className="font-semibold">{deptToArchive?.department_name}</span>?
          </p>
          {deptToArchive?.headcount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
              This department has {deptToArchive.headcount} employee{deptToArchive.headcount === 1 ? '' : 's'} assigned. Reassign
              {deptToArchive.headcount === 1 ? ' them' : ' them all'} to another department before archiving.
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}