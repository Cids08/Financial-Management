import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Archive, RotateCcw, ShieldCheck, Users, Lock, Search, ShieldAlert } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import Tooltip from '../components/Tooltip'
import { useRoles } from '../hooks/useRoles'
import { useProfile } from '../hooks/useProfile'
import { apiFetch } from '../utils/api'


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

  // Same search-bar pattern as the other modules  -  filters by role name
  // or description, client-side (role lists are short enough that a
  // dedicated search endpoint isn't worth it).
  const filteredRoles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sourceRoles
    return sourceRoles.filter((role) =>
      role.role_name.toLowerCase().includes(term) ||
      (role.description || '').toLowerCase().includes(term))
  }, [sourceRoles, search])

  const [page, setPage] = useState(1)
  const PER_PAGE = 10
  const totalPages = Math.max(1, Math.ceil(filteredRoles.length / PER_PAGE))
  const rangeStart = (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, filteredRoles.length)

  // Add/Edit modal: null = closed, 'add' = create mode, or the role object being edited
  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})

  // Archive confirmation modal (restoring is a direct one-click action below,
  // no confirmation needed since it's non-destructive)
  const [roleToArchive, setRoleToArchive] = useState(null)

  // Manage Permissions modal
  const [permRole, setPermRole] = useState(null) // the role card being edited
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [permModalLoading, setPermModalLoading] = useState(false)
  const [permSearch, setPermSearch] = useState('')

  // Per-click re-auth gate. A permission toggle applies immediately, so
  // instead of a batch "Save" the checkbox click opens a password prompt:
  // { items: permissions being flipped, adding: true|false }. Only after
  // the password verifies is that single change PUT to the backend.
  const [pendingChange, setPendingChange] = useState(null)
  const [permGatePassword, setPermGatePassword] = useState('')
  const [permGateError, setPermGateError] = useState('')
  const [permGateSaving, setPermGateSaving] = useState(false)

  // Current signed-in user. The role you currently hold is locked  -  the
  // backend rejects edits to it too, so the UI disables the checkboxes to
  // make that unmistakable. The Super Admin role is likewise sealed off
  // from anyone who isn't a Super Admin (backend-enforced; this just
  // surfaces it instead of failing on save).
  const { profile } = useProfile()
  const superAdminRoleId = roles.find((r) => r.role_name.toLowerCase() === 'super admin')?.role_id
  const isSuperAdminActor = profile?.role_slug === 'super-admin'
  const isOwnRole = permRole != null && Number(permRole.role_id) === Number(profile?.role_id)
  const isProtectedSuperAdminRole = superAdminRoleId != null &&
    permRole != null &&
    Number(permRole.role_id) === Number(superAdminRoleId) &&
    !isSuperAdminActor
  const permLocked = isOwnRole || isProtectedSuperAdminRole

  const openPermissionsModal = async (role) => {
    setPermRole(role)
    setPermSearch('')
    setPendingChange(null)
    setPermGatePassword('')
    setPermGateError('')
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
    setPendingChange(null)
    setPermGatePassword('')
    setPermGateError('')
  }

  const togglePermission = (permissionId) => {
    if (permLocked) return
    const permission = permissions.find((p) => p.permission_id === permissionId)
    setPendingChange({ items: [permission], adding: !checkedIds.has(permissionId) })
    setPermGatePassword('')
    setPermGateError('')
  }

  // Bulk-flips every permission within one module at once ("Select all" /
  // "Deselect all")  -  still confirmed with a single password prompt, then
  // applied as one change. "Select all" when any are unchecked, "deselect
  // all" only once the whole module is already fully checked.
  const toggleModuleAll = (modulePerms) => {
    if (permLocked) return
    const allChecked = modulePerms.every((p) => checkedIds.has(p.permission_id))
    setPendingChange({ items: modulePerms, adding: !allChecked })
    setPermGatePassword('')
    setPermGateError('')
  }

  // Verify the admin's password, then apply the single pending toggle. A
  // wrong password keeps the gate open with an error and changes nothing.
  const confirmPendingChange = async () => {
    setPermGateSaving(true)
    setPermGateError('')
    try {
      const res = await apiFetch('/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: permGatePassword }),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        setPermGateError(json.message || 'The password is incorrect.')
        setPermGateSaving(false)
        return
      }

      const next = new Set(checkedIds)
      pendingChange.items.forEach((p) => {
        if (pendingChange.adding) next.add(p.permission_id)
        else next.delete(p.permission_id)
      })

      const result = await updateRolePermissions(permRole.role_id, Array.from(next))
      if (result.success) {
        setCheckedIds(next)
        setPendingChange(null)
        setPermGatePassword('')
      } else {
        setPermGateError(result.message || 'Could not update permissions.')
      }
    } catch {
      setPermGateError('Could not verify your password. Please try again.')
    } finally {
      setPermGateSaving(false)
    }
  }

  // Filters by display name or description before grouping, so a search
  // term can match either  -  useful since module names alone (e.g.
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
    setFieldErrors({})
    setModalMode('add')
  }

  const openEditModal = (role) => {
    setForm({ role_name: role.role_name, description: role.description || '' })
    setFieldErrors({})
    setModalMode(role)
  }

  const closeModal = () => {
    setModalMode(null)
    setFieldErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!form.role_name.trim()) errors.role_name = 'Role name is required.'
    if (Object.keys(errors).length) { setFieldErrors(errors); return }

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
    // On failure, formError (from the hook) surfaces via the box below  - 
    // the modal stays open so the person can fix it.
  }

  const confirmArchive = async () => {
    const result = await archiveRole(roleToArchive.role_id)
    if (result.success) {
      setRoleToArchive(null)
    }
    // On failure, deleteError surfaces in this same modal  -  it stays open.
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

      {/* Search + Show Archived  -  same filter-bar pattern as the other
          modules, instead of a lone checkbox up in the header. */}
      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by role name or description..."
            className={`${INPUT} pl-9`}
          />
        </div>
        <Button
          variant={showArchived ? 'primary' : 'secondary'}
          size="sm"
          icon={Archive}
          onClick={() => { setPage(1); setShowArchived((prev) => !prev) }}
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

      {/* Role cards  -  click anywhere on an active card to view its users */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rolesLoading && (
          <div className={`${PANEL} p-4 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>
            Loading roles…
          </div>
        )}

        {!rolesLoading && filteredRoles.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((role) => (
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
              {/* Manage/Edit cluster  -  Archive/Restore deliberately kept
                  out of this group (see below) so it isn't a third click
                  target sitting right next to two very different-purpose
                  buttons. */}
              {!showArchived && (
                <div className="flex items-center gap-1">
                  {(() => {
                    const ownCard = Number(role.role_id) === Number(profile?.role_id)
                    const protectedCard = superAdminRoleId != null &&
                      Number(role.role_id) === Number(superAdminRoleId) &&
                      !isSuperAdminActor
                    // Don't render the lock at all when this role can't be
                    // managed  -  a greyed-out icon only invites a pointless click.
                    if (ownCard || protectedCard) return null
                    return (
                      <Tooltip label="Manage permissions" align="start">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openPermissionsModal(role) }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                        >
                          <Lock size={15} />
                        </button>
                      </Tooltip>
                    )
                  })()}
                  <Tooltip label="Edit name & description" align="start">
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

            {/* Archive/Restore lives here instead  -  bottom row, next to
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

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={filteredRoles.length}
        label="roles"
        showRange
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        bordered
      />

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
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {formError}
            </div>
          )}

          <div>
            <label className={LABEL}>Role Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.role_name}
              onChange={(e) => { setForm((f) => ({ ...f, role_name: e.target.value })); setFieldErrors((fe) => ({ ...fe, role_name: '' })) }}
              className={`${INPUT} ${fieldErrors.role_name ? 'border-red-400 dark:border-red-500' : ''}`}
              placeholder="e.g. Accountant"
            />
            {fieldErrors.role_name && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.role_name}</p>}
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
        title={`Permissions for ${permRole?.role_name ?? ''}`}
        footer={
          <Button variant="secondary" size="md" onClick={closePermissionsModal}>Done</Button>
        }
      >
        <div className="space-y-3">
          {permLocked && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>
                {isProtectedSuperAdminRole
                  ? 'Only a Super Admin can manage permissions for the Super Admin role.'
                  : "You can't change permissions for your own role."}
              </span>
            </div>
          )}

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
              {/* Search + live selected count  -  the count updates from
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
                          disabled={permLocked}
                          className="shrink-0 text-[11px] font-medium text-primary-dark hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:hover:no-underline"
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
                              className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors duration-150
                                ${permLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                                ${checked ? 'bg-primary/5' : 'hover:bg-bg'}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermission(p.permission_id)}
                                disabled={permLocked}
                                className="mt-0.5 rounded border-border accent-primary disabled:cursor-not-allowed"
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

      {/* Password gate for permission changes  -  toggling a permission applies
          immediately to every user on the role, so each click is confirmed
          with the admin's own password before it's sent. */}
      <Modal
        open={pendingChange !== null}
        onClose={() => { if (!permGateSaving) { setPendingChange(null); setPermGatePassword(''); setPermGateError('') } }}
        title="Confirm Permission Change"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => { if (!permGateSaving) { setPendingChange(null); setPermGatePassword(''); setPermGateError('') } }} disabled={permGateSaving}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={confirmPendingChange} loading={permGateSaving}>
              Confirm &amp; Apply
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            <span>
              {pendingChange ? (
                pendingChange.items.length === 1 ? (
                  <>
                    <span className="font-medium text-ink">{pendingChange.adding ? 'Grant' : 'Revoke'}</span>{' '}
                    "<span className="font-medium text-ink">{pendingChange.items[0].display_name}</span>"{' '}
                    {pendingChange.adding ? 'to' : 'from'}{' '}
                    <span className="font-medium text-ink">{permRole?.role_name}</span>. Takes effect immediately for
                    every user with this role.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-ink">{pendingChange.adding ? 'Grant' : 'Revoke'}</span>{' '}
                    <span className="font-medium text-ink">{pendingChange.items.length} permissions</span>{' '}
                    {pendingChange.adding ? 'to' : 'from'}{' '}
                    <span className="font-medium text-ink">{permRole?.role_name}</span>. Takes effect immediately for
                    every user with this role.
                  </>
                )
              ) : null}
            </span>
          </div>

          {permGateError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {permGateError}
            </div>
          )}

          <div>
            <label className={LABEL}>Your Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={permGatePassword}
              onChange={(e) => { setPermGatePassword(e.target.value); setPermGateError('') }}
              placeholder="Enter your password to confirm"
              className={INPUT}
              autoFocus
            />
            <p className="mt-1 text-[11px] text-muted">Proving it's you before this change is applied.</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}