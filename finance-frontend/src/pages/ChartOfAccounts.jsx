import { useState, useEffect, useRef } from 'react'
import { Search, Plus, Pencil, Power, BookText, Activity, Layers, Loader2, Info } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import Tooltip from '../components/Tooltip'
import { useProfile } from '../hooks/useProfile'
import { apiFetch } from '../utils/api'

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']

const CATEGORY_SUGGESTIONS = [
  'Current Asset', 'Fixed Asset', 'Other Asset',
  'Current Liability', 'Long Term Liability',
  'Equity',
  'Operating Revenue', 'Other Revenue',
  'Operating Expense', 'Other Expense',
]

const EMPTY_FORM = { account_code: '', account_name: '', account_type: ACCOUNT_TYPES[0], account_category: '', parent_account_id: '', description: '', is_active: true }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const TYPE_STYLES = {
  Asset: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Liability: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Equity: 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
  Revenue: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Expense: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
}

const STATUS_STYLES = {
  true: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  false: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

async function readError(res, json, fallback) {
  if (json?.success === false || !res.ok) {
    if (json?.errors) return Object.values(json.errors).flat()[0]
    return json?.message || fallback
  }
  return ''
}

export default function ChartOfAccounts({ title = 'Chart of Accounts', crumbs = ['Master Data', 'Chart of Accounts'] }) {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin'

  const [accounts, setAccounts] = useState([])
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [view, setView] = useState('total')
  const [page, setPage] = useState(1)

  const [modalMode, setModalMode] = useState(null)
  const [detailAccount, setDetailAccount] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [parentOptions, setParentOptions] = useState([])

  const fetchList = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '50' })
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (view === 'total' || view === 'posted') params.set('include_inactive', '1')
      if (view === 'inactive') params.set('inactive_only', '1')
      if (view === 'posted') params.set('posted', '1')
      if (search.trim()) params.set('search', search.trim())

      const res = await apiFetch(`/api/chart-of-accounts?${params}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json?.message || 'Failed to load chart of accounts.')
        return
      }
      setAccounts(json.data || [])
      setMeta(json.meta || { current_page: 1, last_page: 1, total: 0 })
    } catch {
      setError('Unable to reach the server.')
    } finally {
      setLoading(false)
    }
  }

  const pageRef = useRef(page)
  useEffect(() => { pageRef.current = page }, [page])

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (pageRef.current !== 1) setPage(1)
      else fetchList()
    }, 300)
    return () => clearTimeout(debounce)
  }, [search, typeFilter, view])

  useEffect(() => {
    void fetchList()
  }, [page])

  const fetchParentOptions = async () => {
    try {
      const res = await apiFetch('/api/chart-of-accounts?per_page=200')
      const json = await res.json()
      if (res.ok && json.success) setParentOptions(json.data || [])
    } catch { /* parent select stays empty on failure */ }
  }

  const openAdd = async () => {
    setForm(EMPTY_FORM)
    setFormError('')
    await fetchParentOptions()
    setModalMode('add')
  }

  const openEdit = async (a) => {
    setForm({
      account_code: a.account_code,
      account_name: a.account_name,
      account_type: a.account_type,
      account_category: a.account_category || '',
      parent_account_id: a.parent_account_id ? String(a.parent_account_id) : '',
      description: a.description || '',
      is_active: a.is_active,
    })
    setFormError('')
    await fetchParentOptions()
    setModalMode(a)
  }

  const closeModal = () => { setModalMode(null); setFormError('') }

  const openDetail = (a) => setDetailAccount(a)

  const closeDetail = () => setDetailAccount(null)

  const editFromDetail = async (a) => {
    closeDetail()
    await openEdit(a)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.account_code.trim() || !form.account_name.trim()) {
      setFormError('Account code and account name are required.')
      return
    }

    setSaving(true)
    setFormError('')
    const payload = {
      account_code: form.account_code.trim(),
      account_name: form.account_name.trim(),
      account_type: form.account_type,
      account_category: form.account_category.trim(),
      parent_account_id: form.parent_account_id ? Number(form.parent_account_id) : null,
      description: form.description.trim() || null,
      is_active: form.is_active,
    }

    try {
      const res = await apiFetch(
        modalMode === 'add' ? '/api/chart-of-accounts' : `/api/chart-of-accounts/${modalMode.id}`,
        { method: modalMode === 'add' ? 'POST' : 'PUT', body: JSON.stringify(payload) }
      )
      const json = await res.json()
      const msg = await readError(res, json, 'Failed to save account.')
      if (msg) { setFormError(msg); return }
      closeModal()
      await fetchList()
    } catch {
      setFormError('Unable to reach the server.')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (a) => {
    setError('')
    try {
      const res = await apiFetch(`/api/chart-of-accounts/${a.id}/toggle-active`, { method: 'PATCH' })
      const json = await res.json()
      const msg = await readError(res, json, 'Unable to update account status.')
      if (msg) { setError(msg); return }
      await fetchList()
    } catch {
      setError('Unable to reach the server.')
    }
  }

  const activeThisPage = accounts.filter((a) => a.is_active).length
  const inactiveThisPage = accounts.filter((a) => !a.is_active).length
  const postedThisPage = accounts.filter((a) => a.entries_count > 0).length

  const statCards = [
    { key: 'total', label: 'All Accounts', value: meta.total, icon: BookText, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: view === 'total', onClick: () => setView('total') },
    { key: 'active', label: 'Active (this page)', value: activeThisPage, icon: Activity, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: view === 'active', onClick: () => setView((v) => (v === 'active' ? 'total' : 'active')) },
    { key: 'inactive', label: 'Inactive (this page)', value: inactiveThisPage, icon: Power, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: view === 'inactive', onClick: () => setView((v) => (v === 'inactive' ? 'total' : 'inactive')) },
    { key: 'posted', label: 'With Postings (this page)', value: postedThisPage, icon: Layers, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: view === 'posted', onClick: () => setView((v) => (v === 'posted' ? 'total' : 'posted')) },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">The official chart of accounts behind every GL posting — revenue, expenses, assets and payables all resolve from here.</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Account</Button>
          </div>
        )}
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
              className={`${PANEL} p-4 flex items-center gap-2.5 text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={15} className={card.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">{card.label}</p>
                <p className="text-lg font-bold text-ink">{card.value}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className={`${PANEL} p-4 flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by code, name, type or category..." className={`${INPUT} pl-9`} />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={`${INPUT} lg:w-48! shrink-0`}
        >
          <option value="all">All Types</option>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className={PANEL}>
        <div className="overflow-hidden rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Code</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Account</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Type</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Category</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Parent</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Postings</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                  <Loader2 size={16} className="inline animate-spin mr-2" /> Loading chart of accounts…
                </td></tr>
              )}
              {!loading && accounts.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 transition-colors duration-300 hover:bg-bg">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="font-mono text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-ink">{a.account_code}</span>
                  </td>
                  <td className="px-4 py-3.5 cursor-pointer select-none" onClick={() => openDetail(a)}>
                    <p className="font-medium text-ink group-hover:text-primary-dark transition-colors duration-150">{a.account_name}</p>
                    {a.description && <p className="text-xs text-muted truncate max-w-xs" title={a.description}>{a.description}</p>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[a.account_type]}`}>{a.account_type}</span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs text-ink">{a.account_category}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-xs text-muted">
                    {a.parent ? <span className="font-mono">{a.parent.account_code}</span> : <span className="italic">—</span>}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {a.entries_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-ink bg-bg border border-border rounded-full px-2.5 py-1">
                        <Activity size={12} className="text-primary-dark" /> {a.entries_count}
                      </span>
                    ) : (
                      <span className="text-xs text-muted italic">Unused</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[a.is_active]}`}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip label="View details" align="start">
                        <button type="button" onClick={() => openDetail(a)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Info size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="Edit account" align="start">
                        <button type="button" onClick={() => openEdit(a)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Pencil size={15} />
                        </button>
                      </Tooltip>
                      {isAdmin && (
                        <Tooltip label={a.is_active ? 'Deactivate account' : 'Activate account'} align="end">
                          <button
                            type="button"
                            onClick={() => handleToggle(a)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150
                              ${a.is_active ? 'text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10' : 'text-muted hover:bg-bg hover:text-ink'}`}
                          >
                            <Power size={15} />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && accounts.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">No accounts match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={meta.last_page}
          onPageChange={setPage}
          total={meta.total}
          label="accounts"
          showRange
          rangeStart={meta.total === 0 ? 0 : (meta.current_page - 1) * 50 + 1}
          rangeEnd={Math.min(meta.current_page * 50, meta.total)}
          bordered
        />
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Account' : 'Add Chart Account'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Account'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Account Code</label>
              <input type="text" value={form.account_code} onChange={(e) => setForm((f) => ({ ...f, account_code: e.target.value }))} className={`${INPUT} font-mono`} placeholder="5000" />
            </div>
            <div>
              <label className={LABEL}>Account Type</label>
              <select value={form.account_type} onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value }))} className={INPUT}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={LABEL}>Account Name</label>
            <input type="text" value={form.account_name} onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))} className={INPUT} placeholder="Miscellaneous Income" />
          </div>
          <div>
            <label className={LABEL}>Category</label>
            <input type="text" list="coa-categories" value={form.account_category} onChange={(e) => setForm((f) => ({ ...f, account_category: e.target.value }))} className={INPUT} placeholder="Operating Revenue" />
            <datalist id="coa-categories">
              {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className={LABEL}>Parent Account</label>
            <select value={form.parent_account_id} onChange={(e) => setForm((f) => ({ ...f, parent_account_id: e.target.value }))} className={INPUT}>
              <option value="">— None (top-level) —</option>
              {parentOptions
                .filter((o) => !isEditing || o.id !== modalMode.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>{o.account_code} — {o.account_name}</option>
                ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className={`${INPUT} h-auto py-2 resize-none`} placeholder="Optional note about when this account is used." />
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))} className={INPUT}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        open={detailAccount !== null}
        onClose={closeDetail}
        title="Account Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            <Button variant="primary" size="md" onClick={() => editFromDetail(detailAccount)}>Edit Account</Button>
          </>
        }
      >
        {detailAccount && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-ink">{detailAccount.account_code}</span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_STYLES[detailAccount.account_type]}`}>{detailAccount.account_type}</span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailAccount.is_active]}`}>
                  {detailAccount.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-ink">{detailAccount.account_name}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">Category</p>
                <p className="mt-0.5 font-medium text-ink">{detailAccount.account_category || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Parent Account</p>
                <p className="mt-0.5 font-medium text-ink">
                  {detailAccount.parent
                    ? <span className="font-mono">{detailAccount.parent.account_code}</span> : <span className="text-muted">Top-level account</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">GL Postings</p>
                <p className="mt-0.5 font-medium text-ink">
                  {detailAccount.entries_count > 0
                    ? <span className="inline-flex items-center gap-1"><Activity size={13} className="text-primary-dark" /> {detailAccount.entries_count} journal line{detailAccount.entries_count === 1 ? '' : 's'}</span>
                    : <span className="text-muted italic">No postings yet</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Record ID</p>
                <p className="mt-0.5 font-medium text-ink">#{detailAccount.id}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted">What this account is used for</p>
              <p className="mt-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-ink whitespace-pre-line">
                {detailAccount.description || <span className="italic text-muted">No description yet.</span>}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}