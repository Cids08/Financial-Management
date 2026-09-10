import { useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Tags } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { usePermissions } from '../context/PermissionsContext'
import { useExpenseCategories } from '../hooks/useExpenseCategories'

const EMPTY_FORM = { category_code: '', category_name: '', description: '', is_active: true }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const ACTIVE_STYLES = {
  true: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  false: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export default function ExpenseCategories({ title = 'Expense Categories', crumbs = ['Master Data', 'Expense Categories'] }) {
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('expense-categories.manage')

  const {
    categories, listLoading, listError, filters, setFilter,
    mutating, mutateError,
    createCategory, updateCategory, archiveCategory, restoreCategory,
  } = useExpenseCategories()

  const [search, setSearch] = useState('')
  const runSearch = (value) => {
    setSearch(value)
    setFilter({ search: value })
  }

  const [modalMode, setModalMode] = useState(null) // 'add' | category object | null
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setFieldErrors({}); setModalMode('add') }
  const openEdit = (c) => {
    setForm({
      category_code: c.category_code,
      category_name: c.category_name,
      description: c.description || '',
      is_active: c.is_active,
    })
    setFormError('')
    setFieldErrors({})
    setModalMode(c)
  }
  const closeModal = () => { setModalMode(null); setFormError(''); setFieldErrors({}) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!form.category_code.trim()) errors.category_code = 'Category code is required.'
    if (!form.category_name.trim()) errors.category_name = 'Category name is required.'
    if (Object.keys(errors).length) { setFieldErrors(errors); return }

    const result = isEditing
      ? await updateCategory(modalMode.id, form)
      : await createCategory(form)

    if (result.success) {
      closeModal()
    } else {
      setFormError(result.message)
    }
  }

  const handleArchive = async (c) => { await archiveCategory(c.id) }
  const handleRestore = async (c) => { await restoreCategory(c.id) }

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Categories used to classify expenses across all departments.</p>
        </div>
        {/* Backend already enforces expense-categories.manage on store() via
            ExpenseCategoryPolicy — this hides the button for Staff (view-only)
            rather than showing something that would 403 on click. */}
        {canManage && (
          <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Category</Button>
        )}
      </div>

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search by code or name..."
            className={`${INPUT} pl-9`}
            style={{ ...INPUT_TEXT_STYLE, width: '100%' }}
            autoComplete="off"
          />
        </div>
        <select
          value={filters.is_active}
          onChange={(e) => setFilter({ is_active: e.target.value })}
          className={INPUT}
          style={{ ...INPUT_TEXT_STYLE, width: '12rem' }}
        >
          <option value="">All Statuses</option>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
        {canManage && (
          <Button
            variant={filters.trashed ? 'primary' : 'secondary'}
            size="sm"
            icon={Archive}
            onClick={() => setFilter({ trashed: !filters.trashed })}
            className="shrink-0 whitespace-nowrap"
          >
            Show Archived
          </Button>
        )}
      </div>

      {listError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{listError}</div>
      )}
      {mutateError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{mutateError}</div>
      )}

      <div className={PANEL}>
        <div className="overflow-hidden rounded-t-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Code</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Name</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Description</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap"># Expenses</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                {canManage && <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-sm text-muted">Loading categories…</td></tr>
              ) : categories.length === 0 ? (
                <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-sm text-muted">No expense categories found.</td></tr>
              ) : categories.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                  <td className="px-4 py-3.5 whitespace-nowrap font-medium text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      <Tags size={14} className="text-muted" />
                      {c.category_code}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-ink">{c.category_name}</td>
                  <td className="px-4 py-3.5 text-muted text-xs max-w-xs truncate">{c.description || '—'}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink text-xs">{c.expenses_count ?? 0}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ACTIVE_STYLES[c.is_active]}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!filters.trashed && (
                          <Tooltip label="Edit category" align="start">
                            <button type="button" onClick={() => openEdit(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              <Pencil size={15} />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip label={filters.trashed ? 'Restore category' : 'Archive category'} align="end">
                          <button
                            type="button"
                            onClick={() => (filters.trashed ? handleRestore(c) : handleArchive(c))}
                            disabled={mutating}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50"
                          >
                            {filters.trashed ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Category' : 'Add Category'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" loading={mutating} onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Category'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Category Code <span className="text-red-500">*</span></label>
              <input type="text" value={form.category_code} onChange={(e) => { setForm((f) => ({ ...f, category_code: e.target.value })); setFieldErrors((fe) => ({ ...fe, category_code: '' })) }} className={`${INPUT} ${fieldErrors.category_code ? 'border-red-400 dark:border-red-500' : ''}`} style={INPUT_TEXT_STYLE} placeholder="e.g. TAX, UTIL" />
              {fieldErrors.category_code && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.category_code}</p>}
            </div>
            <div>
              <label className={LABEL}>Category Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.category_name} onChange={(e) => { setForm((f) => ({ ...f, category_name: e.target.value })); setFieldErrors((fe) => ({ ...fe, category_name: '' })) }} className={`${INPUT} ${fieldErrors.category_name ? 'border-red-400 dark:border-red-500' : ''}`} style={INPUT_TEXT_STYLE} placeholder="e.g. Utilities" />
              {fieldErrors.category_name && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.category_name}</p>}
            </div>
          </div>
          <div>
            <label className={LABEL}>Description (optional)</label>
            <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={INPUT} style={INPUT_TEXT_STYLE} placeholder="What this category covers" />
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select
              value={form.is_active ? '1' : '0'}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}
              className={INPUT}
              style={INPUT_TEXT_STYLE}
            >
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  )
}