import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, ShieldCheck, Users, Lock } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { useRoles } from '../hooks/useRoles'


const EMPTY_FORM = { role_name: '', description: '' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
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
    rolesLoading,
    rolesError,
    formSaving,
    formError,
    deleteBusy,
    deleteError,
    permissions,
    permissionsLoading,
    permSaving,
    permError,
    createRole,
    updateRole,
    deleteRole,
    fetchRoleWithPermissions,
    updateRolePermissions,
  } = useRoles()

  // Add/Edit modal: null = closed, 'add' = create mode, or the role object being edited
  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formValidationError, setFormValidationError] = useState('')

  // Delete confirmation modal
  const [roleToDelete, setRoleToDelete] = useState(null)

  // Manage Permissions modal
  const [permRole, setPermRole] = useState(null) // the role card being edited
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [permModalLoading, setPermModalLoading] = useState(false)

  const openPermissionsModal = async (role) => {
    setPermRole(role)
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
  }

  const togglePermission = (permissionId) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(permissionId)) next.delete(permissionId)
      else next.add(permissionId)
      return next
    })
  }

  const savePermissions = async () => {
    const result = await updateRolePermissions(permRole.role_id, Array.from(checkedIds))
    if (result.success) closePermissionsModal()
  }

  const permissionGroups = groupByModule(permissions)

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

  const confirmDelete = async () => {
    const result = await deleteRole(roleToDelete.role_id)
    if (result.success) {
      setRoleToDelete(null)
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

      {rolesError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {rolesError}
        </div>
      )}

      {/* Role cards — click anywhere on a card to view its users */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rolesLoading && (
          <div className={`${PANEL} p-4 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>
            Loading roles…
          </div>
        )}

        {!rolesLoading && roles.map((role) => (
          <div
            key={role.role_id}
            role="button"
            tabIndex={0}
            onClick={() => viewUsersForRole(role)}
            onKeyDown={(e) => e.key === 'Enter' && viewUsersForRole(role)}
            className={`${PANEL} p-4 flex flex-col gap-3 text-left cursor-pointer
              transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
                <ShieldCheck size={18} />
              </div>
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
                <Tooltip label="Delete role" align="end">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setRoleToDelete(role) }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors duration-150"
                  >
                    <Trash2 size={15} />
                  </button>
                </Tooltip>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">{role.role_name}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{role.description}</p>
            </div>

            <div className="mt-auto flex items-center gap-1.5 text-xs text-muted pt-2 border-t border-border">
              <Users size={13} />
              {role.userCount} {role.userCount === 1 ? 'user' : 'users'} assigned
            </div>
          </div>
        ))}

        {!rolesLoading && roles.length === 0 && (
          <div className={`${PANEL} p-4 text-center text-sm text-muted sm:col-span-2 xl:col-span-3`}>
            No roles yet.
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

      {/* Delete confirmation modal */}
      <Modal
        open={roleToDelete !== null}
        onClose={() => setRoleToDelete(null)}
        title="Delete Role"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRoleToDelete(null)}>Cancel</Button>
            <Button variant="danger" size="md" onClick={confirmDelete} loading={deleteBusy}>
              Delete
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
            Are you sure you want to delete <span className="font-semibold">{roleToDelete?.role_name}</span>?
            {roleToDelete?.userCount > 0 && (
              <span className="mt-2 block text-xs text-amber-600 dark:text-amber-400">
                This role currently has {roleToDelete.userCount} user{roleToDelete.userCount === 1 ? '' : 's'} assigned. Deleting it won't remove those users, but they'll need to be reassigned a role.
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
        <div className="space-y-4">
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

          {!permModalLoading && !permissionsLoading && Object.entries(permissionGroups).map(([module, perms]) => (
            <div key={module}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">{module}</p>
              <div className="space-y-2">
                {perms.map((p) => (
                  <label key={p.permission_id} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkedIds.has(p.permission_id)}
                      onChange={() => togglePermission(p.permission_id)}
                      className="mt-0.5 rounded border-border accent-primary"
                    />
                    <span>
                      <span className="block text-sm text-ink">{p.display_name}</span>
                      {p.description && <span className="block text-xs text-muted">{p.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
