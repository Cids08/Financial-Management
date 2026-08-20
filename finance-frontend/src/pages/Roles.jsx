import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Archive, RotateCcw, ShieldCheck, Users, Lock, Search } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { useRoles } from '../hooks/useRoles'


const EMPTY_FORM = { role_name: '', description: '' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

function groupByModule(permissions) {
  return permissions.reduce((groups, p) => {
    const key = p.module || 'Other'
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
    return groups
  }, {})
}

export default function Roles({ title = 'Roles', crumbs = ['User Management', 'Roles'] }) {
  const navigate = useNavigate()
  const {
    roles,
    archivedRoles,
    rolesLoading,
    rolesError,
    formSaving,
    formError,
    deleteBusy,
    deleteError,
    actionBusyId,
    permissions,
    permissionsLoading,
    permSaving,
    permError,
    createRole,
    updateRole,
    archiveRole,
    restoreRole,
    fetchRoleWithPermissions,
    updateRolePermissions,
  } = useRoles()

  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const sourceRoles = showArchived ? archivedRoles : roles

  // Same search-bar pattern as the other modules — filters by role name
  // or description, client-side (role lists are short enough that a
  // dedicated search endpoint isn't worth it).
  const filteredRoles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sourceRoles
    return sourceRoles.filter((role) =>
      role.role_name.toLowerCase().includes(term) ||
      (role.description || '').toLowerCase().includes(term))
  }, [sourceRoles, search])

  // Add/Edit modal: null = closed, 'add' = create mode, or the role object being edited
  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formValidationError, setFormValidationError] = useState('')

  // Archive confirmation modal (restoring is a direct one-click action below,
  // no confirmation needed since it's non-destructive)
  const [roleToArchive, setRoleToArchive] = useState(null)

  // Manage Permissions modal
  const [permRole, setPermRole] = useState(null) // the role card being edited
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [permModalLoading, setPermModalLoading] = useState(false)
  const [permSearch, setPermSearch] = useState('')

  const openPermissionsModal = async (role) => {
    setPermRole(role)
    setPermSearch('')
    setPermModalLoading(true)
    const result = await fetchRoleWithPermissions(role.role_id)
    if (result.success) {
      setCheckedIds(new Set(result.role.permissionIds))
    }
    setPermModalLoading(false)
  }

  const closePermissionsModal = () => {
    setPermRole(null)
    setCheckedIds(new Set())
    setPermSearch('')
  }

  const togglePermission = (permissionId) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(permissionId)) next.delete(permissionId)
      else next.add(permissionId)
      return next
    })
  }

  // Bulk-toggles every permission within one module at once — flips to
  // "select all" if any are currently unchecked, "deselect all" only once
  // the whole module is already fully checked.
  const toggleModuleAll = (modulePerms) => {
    const allChecked = modulePerms.every((p) => checkedIds.has(p.permission_id))
    setCheckedIds((prev) => {
      const next = new Set(prev)
      modulePerms.forEach((p) => {
        if (allChecked) next.delete(p.permission_id)
        else next.add(p.permission_id)
      })
      return next
    })
  }

  const savePermissions = async () => {
    const result = await updateRolePermissions(permRole.role_id, Array.from(checkedIds))
    if (result.success) closePermissionsModal()
  }

  // Filters by display name or description before grouping, so a search
  // term can match either — useful since module names alone (e.g.
  // "Accounting") are too broad to narrow down a list this long.
  const filteredPermissionGroups = useMemo(() => {
    const term = permSearch.trim().toLowerCase()
    const filtered = term
      ? permissions.filter((p) =>
          p.display_name.toLowerCase().includes(term) ||
          (p.description || '').toLowerCase().includes(term))
      : permissions
    return groupByModule(filtered)
  }, [permissions, permSearch])

  const openAddModal = () => {
    setForm(EMPTY_FORM)
    setFormValidationError('')
    setModalMode('add')
  }

  const openEditModal = (role) => {
    setForm({ role_name: role.role_name, description: role.description || '' })
    setFormValidationError('')
    setModalMode(role)
  }

  const closeModal = () => {
    setModalMode(null)
    setFormValidationError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormValidationError('')

    if (!form.role_name.trim()) {
      setFormValidationError('Role name is required.')
      return
    }

    const payload = {
      role_name: form.role_name.trim(),
      description: form.description.trim(),
    }

    const result = modalMode === 'add'
      ? await createRole(payload)
      : await updateRole(modalMode.role_id, payload)

    if (result.success) {
      closeModal()
    }
    // On failure, formError (from the hook) surfaces via the box below —
    // the modal stays open so the person can fix it.
  }

  const confirmArchive = async () => {
    const result = await archiveRole(roleToArchive.role_id)
    if (result.success) {
      setRoleToArchive(null)
    }
    // On failure, deleteError surfaces in this same modal — it stays open.
  }

  // Card body click navigates to Users pre-filtered by this role.
  // Icon buttons call e.stopPropagation() so they don't trigger this too.
  const viewUsersForRole = (role) => {
    navigate(`/user-management/users?role=${role.role_id}`)
  }

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Define what each role can access across the system.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAddModal}>
          Add Role
        </Button>
      </div>

      {/* Search + Show Archived — same filter-bar pattern as the other
          modules, instead of a lone checkbox up in the header. */}
      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by role name or description..."
            className={`${INPUT} pl-9`}
          />
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

      {rolesError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {rolesError}
        </div>
      )}

      {/* Role cards — click anywhere on an active card to view its users */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rolesLoading && (
          <div className={`${PANEL} p-4 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>
            Loading roles…
          </div>
        )}

        {!rolesLoading && filteredRoles.map((role) => (
          <div
            key={role.role_id}
            role={showArchived ? undefined : 'button'}
            tabIndex={showArchived ? undefined : 0}
            onClick={showArchived ? undefined : () => viewUsersForRole(role)}
            onKeyDown={showArchived ? undefined : (e) => e.key === 'Enter' && viewUsersForRole(role)}
            className={`${PANEL} p-4 flex flex-col gap-3 text-left
              transition-all duration-200
              ${showArchived ? 'opacity-75' : 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
                <ShieldCheck size={18} />
              </div>
              {/* Manage/Edit cluster — Archive/Restore deliberately kept
                  out of this group (see below) so it isn't a third click
                  target sitting right next to two very different-purpose
                  buttons. */}
              {!showArchived && (
                <div className="flex items-center gap-1">
                  <Tooltip label="Manage permissions" align="start">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openPermissionsModal(role) }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                    >
                      <Lock size={15} />
                    </button>
                  </Tooltip>
                  <Tooltip label="Edit role" align="start">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openEditModal(role) }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                    >
                      <Pencil size={15} />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">{role.role_name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{role.description}</p>
            </div>

            {/* Archive/Restore lives here instead — bottom row, next to
                the user count, separated from Lock/Edit above by the
                card's own layout rather than just spacing. */}
            <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-border">
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Users size={13} />
                {role.userCount} {role.userCount === 1 ? 'user' : 'users'} assigned
              </span>
              <Tooltip label={showArchived ? 'Restore role' : 'Archive role'} align="end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    showArchived ? restoreRole(role.role_id) : setRoleToArchive(role)
                  }}
                  disabled={actionBusyId === role.role_id}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50"
                >
                  {showArchived ? <RotateCcw size={14} /> : <Archive size={14} />}
                </button>
              </Tooltip>
            </div>
          </div>
        ))}

        {!rolesLoading && filteredRoles.length === 0 && (
          <div className={`${PANEL} p-4 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>
            {search
              ? `No roles match "${search}".`
              : showArchived ? 'No archived roles.' : 'No roles yet.'}
          </div>
        )}
      </div>

      {/* Add / Edit Role modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Role' : 'Add Role'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} loading={formSaving}>
              {isEditing ? 'Save Changes' : 'Add Role'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {(formValidationError || formError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {formValidationError || formError}
            </div>
          )}

          <div>
            <label className={LABEL}>Role Name</label>
            <input
              type="text"
              value={form.role_name}
              onChange={(e) => setForm((f) => ({ ...f, role_name: e.target.value }))}
              className={INPUT}
              placeholder="e.g. Accountant"
            />
          </div>

          <div>
            <label className={LABEL}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className={`${INPUT} h-auto py-2 resize-none`}
              placeholder="What can this role access?"
            />
          </div>
        </form>
      </Modal>

      {/* Archive confirmation modal */}
      <Modal
        open={roleToArchive !== null}
        onClose={() => setRoleToArchive(null)}
        title="Archive Role"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRoleToArchive(null)}>Cancel</Button>
            <Button variant="danger" size="md" onClick={confirmArchive} loading={deleteBusy}>
              Archive
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {deleteError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {deleteError}
            </div>
          )}
          <p className="text-sm text-ink">
            Are you sure you want to archive <span className="font-semibold">{roleToArchive?.role_name}</span>?
            {roleToArchive?.userCount > 0 && (
              <span className="mt-2 block text-xs text-amber-600 dark:text-amber-400">
                This role currently has {roleToArchive.userCount} user{roleToArchive.userCount === 1 ? '' : 's'} assigned. They'll need to be reassigned a role first.
              </span>
            )}
          </p>
        </div>
      </Modal>

      {/* Manage Permissions modal */}
      <Modal
        open={permRole !== null}
        onClose={closePermissionsModal}
        title={`Permissions — ${permRole?.role_name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closePermissionsModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={savePermissions} loading={permSaving}>
              Save Permissions
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {permError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {permError}
            </div>
          )}

          {(permModalLoading || permissionsLoading) && (
            <p className="text-sm text-muted">Loading permissions…</p>
          )}

          {!permModalLoading && !permissionsLoading && permissions.length === 0 && (
            <p className="text-sm text-muted">No permissions have been set up yet.</p>
          )}

          {!permModalLoading && !permissionsLoading && permissions.length > 0 && (
            <>
              {/* Search + live selected count — the count updates from
                  checkedIds directly, not from what's currently visible
                  under a search filter, so it always reflects the true
                  total that will be saved. */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    type="text"
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    placeholder="Search permissions..."
                    className={`${INPUT} h-8 pl-7 text-xs`}
                  />
                </div>
                <span className="shrink-0 whitespace-nowrap text-xs font-medium text-muted">
                  {checkedIds.size} of {permissions.length} selected
                </span>
              </div>

              <div className="max-h-[55vh] overflow-y-auto space-y-4 -mx-1 px-1">
                {Object.entries(filteredPermissionGroups).map(([module, perms]) => {
                  const allChecked = perms.every((p) => checkedIds.has(p.permission_id))
                  return (
                    <div key={module}>
                      <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-2 bg-surface px-1 py-1.5 border-b border-border">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{module}</p>
                        <button
                          type="button"
                          onClick={() => toggleModuleAll(perms)}
                          className="shrink-0 text-[11px] font-medium text-primary-dark hover:underline"
                        >
                          {allChecked ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>
                      <div className="space-y-0.5 mt-1.5">
                        {perms.map((p) => {
                          const checked = checkedIds.has(p.permission_id)
                          return (
                            <label
                              key={p.permission_id}
                              className={`flex items-start gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-150
                                ${checked ? 'bg-primary/5' : 'hover:bg-bg'}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermission(p.permission_id)}
                                className="mt-0.5 rounded border-border accent-primary"
                              />
                              <span>
                                <span className="block text-sm text-ink">{p.display_name}</span>
                                {p.description && <span className="block text-xs text-muted">{p.description}</span>}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {Object.keys(filteredPermissionGroups).length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">No permissions match "{permSearch}".</p>
                )}
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}