import { useEffect, useState, useCallback } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Briefcase, Users } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import Tooltip from '../components/Tooltip'
import { useTitles } from '../hooks/useTitles'
import { useHighlightRow } from '../hooks/useHighlightRow'
import { useProfile } from '../hooks/useProfile'

const EMPTY_FORM = { name: '', is_active: true }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Inactive: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

export default function Titles({ title = 'Titles', crumbs = ['Master Data', 'Titles'] }) {
  const { profile } = useProfile()
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin'
  const {
    titles,
    meta,
    loading,
    saving,
    error: hookError,
    fetchTitles,
    createTitle,
    updateTitle,
    archiveTitle,
    restoreTitle,
  } = useTitles()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showArchived, setShowArchived] = useState(false)

  const { highlightedId, highlightSearch } = useHighlightRow()
  useEffect(() => {
    if (highlightSearch == null) return
    setSearch(highlightSearch)
    setShowArchived(false)
    setPage(1)
  }, [highlightSearch])

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  const [titleToArchive, setTitleToArchive] = useState(null)
  const [archiveError, setArchiveError] = useState('')
  const [restoreBusyId, setRestoreBusyId] = useState(null)

  const loadTitles = useCallback(async () => {
    await fetchTitles({ search, archived: showArchived ? '1' : undefined }, page, 12)
  }, [search, page, showArchived, fetchTitles])

  useEffect(() => {
    const timeout = setTimeout(loadTitles, 300)
    return () => clearTimeout(timeout)
  }, [loadTitles])

  const toggleShowArchived = (checked) => {
    setShowArchived(checked)
    setPage(1)
  }

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setFieldErrors({}); setModalMode('add') }
  const openEdit = (t) => {
    setForm({ name: t.title_name, is_active: t.status === 'Active' })
    setFormError('')
    setFieldErrors({})
    setModalMode(t)
  }
  const closeModal = () => { setModalMode(null); setFormError(''); setFieldErrors({}) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!form.name.trim()) errors.name = 'Position name is required.'
    if (Object.keys(errors).length) { setFieldErrors(errors); return }

    setFormError('')
    const isEditing = modalMode !== 'add'
    const endpoint = isEditing ? `/api/titles/${modalMode.title_id}` : '/api/titles'
    const method = isEditing ? 'PUT' : 'POST'

    const result = isEditing
      ? await updateTitle(modalMode.title_id, { name: form.name.trim(), is_active: form.is_active })
      : await createTitle({ name: form.name.trim(), is_active: form.is_active })

    if (result.success) {
      closeModal()
      loadTitles()
    } else {
      setFormError(result.message || 'Failed to save position.')
    }
  }

  const confirmArchive = async () => {
    setArchiveError('')
    const result = await archiveTitle(titleToArchive.title_id)
    if (result.success) {
      setTitleToArchive(null)
      loadTitles()
    } else {
      setArchiveError(result.message || 'Failed to archive position.')
    }
  }

  const restoreTitleAction = async (title) => {
    setRestoreBusyId(title.title_id)
    const result = await restoreTitle(title.title_id)
    if (result.success) {
      loadTitles()
    }
    setRestoreBusyId(null)
  }

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Job titles assigned to users, shown as signatory positions on printed vouchers.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Position</Button>
        </div>
      </div>

      <div className={`${PANEL} p-4 flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search positions..." className={`${INPUT} pl-9`} />
        </div>
        <Button
          variant={showArchived ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => toggleShowArchived(!showArchived)}
          className="shrink-0 whitespace-nowrap"
        >
          Show Archived
        </Button>
      </div>

      {hookError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {hookError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className={`${PANEL} p-10 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>Loading positions...</div>
        ) : titles.length === 0 ? (
          <div className={`${PANEL} p-10 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>
            {showArchived ? 'No archived positions.' : 'No positions match your search.'}
          </div>
        ) : (
          titles.map((t) => (
            <div
              key={t.title_id}
              data-row-id={t.title_id}
              className={`${PANEL} p-4 flex flex-col gap-3 transition-colors duration-300
                ${showArchived ? 'opacity-75' : ''} ${highlightedId === t.title_id ? 'ring-2 ring-primary/50 bg-primary/10' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
                  <Briefcase size={18} />
                </div>
                <div className="flex items-center gap-1">
                  {showArchived ? (
                    isAdmin && (
                    <Tooltip label="Restore position" align="end">
                      <button
                        type="button"
                        onClick={() => restoreTitleAction(t)}
                        disabled={restoreBusyId === t.title_id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50"
                      >
                        <RotateCcw size={15} />
                      </button>
                    </Tooltip>
                    )) : (
                    <>
                      <Tooltip label="Edit position" align="start">
                        <button type="button" onClick={() => openEdit(t)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                          <Pencil size={15} />
                        </button>
                      </Tooltip>
                      {isAdmin && (
                          <Tooltip label="Archive position" align="end">
                            <button type="button" onClick={() => { setTitleToArchive(t); setArchiveError('') }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors duration-150">
                              <Archive size={15} />
                            </button>
                          </Tooltip>
                        )}
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{t.title_name}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[t.status]}`}>{t.status}</span>
                </div>
              </div>

              <div className="mt-auto flex items-center gap-1.5 text-xs text-muted pt-2 border-t border-border">
                <Users size={13} /> {t.headcount ?? 0} {t.headcount === 1 ? 'user' : 'users'}
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && meta.total > 0 && (
        <Pagination
          page={meta.current_page}
          totalPages={meta.last_page}
          onPageChange={setPage}
          total={meta.total}
          label="positions"
        />
      )}

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Position' : 'Add Position'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" loading={saving} onClick={handleSubmit}>{isEditing ? 'Save Changes' : 'Add Position'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          <div>
            <label className={LABEL}>Position Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setFieldErrors((fe) => ({ ...fe, name: '' })) }} className={`${INPUT} ${fieldErrors.name ? 'border-red-400 dark:border-red-500' : ''}`} placeholder="e.g. Financial Controller" />
            {fieldErrors.name && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.name}</p>}
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.is_active ? 'Active' : 'Inactive'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'Active' }))} className={INPUT}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>

      <Modal
        open={titleToArchive !== null}
        onClose={() => { setTitleToArchive(null); setArchiveError('') }}
        title="Archive Position"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => { setTitleToArchive(null); setArchiveError('') }}>Cancel</Button>
            <Button
              variant="danger"
              size="md"
              loading={saving}
              disabled={titleToArchive?.headcount > 0}
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
            Are you sure you want to archive <span className="font-semibold">{titleToArchive?.title_name}</span>?
          </p>
          {titleToArchive?.headcount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
              This position has {titleToArchive.headcount} user{titleToArchive.headcount === 1 ? '' : 's'} assigned. Reassign
              {titleToArchive.headcount === 1 ? ' them' : ' them all'} to another position before archiving.
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
