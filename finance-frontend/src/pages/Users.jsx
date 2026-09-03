import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Users as UsersIcon,
  UserCheck,
  UserX,
  Clock,
  Copy,
  CheckCircle2,
  ShieldAlert,
  Eye,
  EyeOff,
  IdCard,
  X,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { useUsers } from '../hooks/useUsers'
import { useHighlightRow } from '../hooks/useHighlightRow'

// Covers both the originally-assumed role names AND the actual ones this
// project's roles table uses (Admin, Staff) — every entry has an explicit
// dark: variant so a role never silently falls back to the unstyled
// default. If a brand-new role name shows up that isn't listed here, the
// fallback below (also dark-mode-safe now) keeps it readable either way.
const ROLE_STYLES = {
  Administrator: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  Admin: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  'Finance Manager': 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
  Accountant: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
  Staff: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-400',
  Collector: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Auditor: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

// Was 'bg-gray-100 text-muted' — bg-gray-100 has no dark: variant, so any
// role name not in the map above stayed pale-on-pale in dark mode. This
// mirrors the Auditor style, which already handled dark mode correctly.
const ROLE_STYLE_FALLBACK = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Inactive: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

const EMPTY_FORM = { first_name: '', last_name: '', email: '', role_id: '', status: 'Active' }

/* ---------------------------------------------------------------------- */
/* Shared style tokens (matches Dashboard.jsx)                             */
/* ---------------------------------------------------------------------- */
const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

// Base URL used to resolve avatar paths that come back from the API as
// root-relative paths (e.g. "/storage/avatars/3.jpg" from Laravel's
// Storage::url()) instead of full URLs. A root-relative path with no
// domain gets resolved by the browser against whatever origin the page
// is currently on (the Vite dev server), not the Laravel backend — which
// is why avatars 404'd and silently fell back to initials. Falls back to
// the known local backend so this works out of the box in dev; set
// VITE_API_URL in your .env for other environments (staging, production).
const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function resolveAvatarUrl(url) {
  if (!url) return null
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  return `${API_BASE.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
}

function initials(first, last) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase()
}

function formatDateTime(iso) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Full mask, not partial — a fixed placeholder rather than "keep first
// char + domain visible" or "keep last 4 digits visible". Partial masks
// leak information (e.g. on a short list, seeing "j••••@alibaton.test"
// narrows down who it is almost immediately); a fixed-length placeholder
// reveals nothing, not even the real string's length.
const MASKED_EMAIL = '••••••••••••'
const MASKED_VALUE = '••••••••'

// Shown once, right after a new user is created — the backend only ever
// includes initial_password on the create response, never again, so this
// is genuinely the only chance to see it in the UI.
function NewUserCredentialsModal({ credentials, onClose }) {
  const [copied, setCopied] = useState(false)

  const copyText = `Employee No: ${credentials?.employee_no}\nPassword: ${credentials?.password}`

  const handleCopy = () => {
    navigator.clipboard?.writeText(copyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal
      open={!!credentials}
      onClose={onClose}
      title="User Created"
      maxWidth="max-w-sm"
      footer={<Button variant="primary" size="md" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          This password is shown only once. Share it with the new user securely — they should change it after their first login.
        </div>

        <div className="rounded-lg border border-border bg-bg p-3 space-y-2 font-mono text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-sans">Employee No.</span>
            <span className="text-ink">{credentials?.employee_no}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-sans">Password</span>
            <span className="text-ink">{credentials?.password}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-medium text-primary-dark hover:underline"
        >
          {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy credentials'}
        </button>
      </div>
    </Modal>
  )
}

// Full-screen preview of a single image — click-to-enlarge target for the
// avatar shown in ViewProfileModal. Closes on backdrop click, X button, or
// Escape key.
function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    if (!src) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [src, onClose])

  if (!src) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/80 px-4 py-8 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full
          bg-white/10 text-white hover:bg-white/20 transition-colors duration-150"
      >
        <X size={18} />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-xl object-contain shadow-2xl cursor-default"
      />
    </div>
  )
}

// Full profile view — bigger avatar than the table row, plus the user's
// core info in one place. Clicking the avatar opens it full-screen via
// ImageLightbox. Read-only; editing still happens through the existing
// Edit modal so we don't duplicate validation/save logic here.
function ViewProfileModal({ user, roleLabel, onClose }) {
  const [imgFailed, setImgFailed] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Reset per-user UI state whenever a different user is opened, otherwise
  // a failure on user A would stick and hide user B's avatar even though
  // B's URL is fine, and the lightbox could stay open across users.
  useEffect(() => {
    setImgFailed(false)
    setLightboxOpen(false)
  }, [user?.user_id])

  if (!user) return null

  const avatarSrc = resolveAvatarUrl(user.avatar_url)
  const showImage = avatarSrc && !imgFailed
  const fullName = `${user.first_name} ${user.last_name}`

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="User Profile"
      maxWidth="max-w-sm"
      footer={<Button variant="primary" size="md" onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col items-center gap-3 pb-4">
        <button
          type="button"
          onClick={() => showImage && setLightboxOpen(true)}
          disabled={!showImage}
          aria-label={showImage ? 'View full-size photo' : undefined}
          className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-primary/15 text-2xl font-semibold text-primary-dark overflow-hidden ring-4 ring-primary/10
            ${showImage ? 'cursor-zoom-in hover:ring-primary/30 transition-all duration-150' : 'cursor-default'}`}
        >
          {showImage ? (
            <img
              src={avatarSrc}
              alt={fullName}
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            initials(user.first_name, user.last_name)
          )}
        </button>
        <div className="text-center">
          <p className="text-base font-semibold text-ink">{fullName}</p>
          <span className={`inline-flex mt-1.5 items-center px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_STYLES[roleLabel] || ROLE_STYLE_FALLBACK}`}>
            {roleLabel}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg divide-y divide-border">
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted mb-0.5">Email</p>
          <p className="text-sm text-ink break-all">{user.email}</p>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs text-muted mb-0.5">Employee No.</p>
          <p className="text-sm text-ink font-mono">{user.employee_no}</p>
        </div>
        <div className="px-3 py-2.5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted mb-0.5">Status</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[user.status]}`}>
              {user.status}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted mb-0.5">Last Login</p>
            <p className="text-sm text-ink flex items-center gap-1 justify-end">
              <Clock size={12} className="text-muted" /> {formatDateTime(user.last_login)}
            </p>
          </div>
        </div>
      </div>

      {lightboxOpen && (
        <ImageLightbox
          src={avatarSrc}
          alt={fullName}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </Modal>
  )
}

export default function Users({ title = 'Users', crumbs = ['User Management', 'Users'] }) {
  const [searchParams, setSearchParams] = useSearchParams()

  const {
    users,
    archivedUsers,
    usersLoading,
    usersError,
    roles,
    rolesLoading,
    formSaving,
    formError,
    actionBusyId,
    createUser,
    updateUser,
    archiveUser,
    restoreUser,
  } = useUsers()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') || 'all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showArchived, setShowArchived] = useState(false)
  // Users.jsx loads every user client-side (no server-side `search`
  // paging), so highlightSearch isn't needed here — the target row is
  // already in memory the moment it's highlighted.
  const { highlightedId } = useHighlightRow()

  // A row arriving via search highlight should always be visible — clear
  // any active filter that could otherwise hide it (e.g. landing here
  // with a role filter still set from a previous visit).
  useEffect(() => {
    if (highlightedId == null) return
    setSearch('')
    setRoleFilter('all')
    setStatusFilter('all')
    setShowArchived(false)
  }, [highlightedId])

  // If arriving from a role card's deep link (/user-management/users?role=3),
  // pick up the filter once on mount and clean the URL so it doesn't linger.
  useEffect(() => {
    const roleParam = searchParams.get('role')
    if (roleParam) {
      setRoleFilter(roleParam)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Modal state: null = closed, 'add' = create mode, or the user object being edited
  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formValidationError, setFormValidationError] = useState('')

  // Set only right after a successful create, when the response includes
  // initial_password. Cleared on close and never repopulated afterward.
  const [newUserCredentials, setNewUserCredentials] = useState(null)

  // The user currently shown in the "View Profile" modal. Separate from
  // modalMode (Add/Edit form) so viewing a profile never interferes with
  // an in-progress edit.
  const [viewingUser, setViewingUser] = useState(null)

  // Controls visibility of email + employee no. together per row — masked
  // by default, revealed only when the eye icon is clicked.
  const [revealedIds, setRevealedIds] = useState(new Set())
  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Same graceful-fallback pattern as Header.jsx's Avatar component:
  // avatar_url being present just means the backend has *a* path on
  // record — it doesn't guarantee the file still exists at that URL
  // (deleted from disk, stale DB value, wrong storage disk, etc), or that
  // it was even a resolvable URL to begin with (relative paths need
  // resolveAvatarUrl above). A plain `u.avatar_url ? <img> : initials`
  // truthy check renders the <img> tag regardless, and when that request
  // 404s with no onError handler, the browser shows raw alt text instead
  // of falling back to initials. This tracks failures per row so a
  // broken URL degrades the same way a missing one does.
  const [avatarErrorIds, setAvatarErrorIds] = useState(new Set())
  const markAvatarError = (id) => {
    setAvatarErrorIds((prev) => new Set(prev).add(id))
  }

  useEffect(() => {
    if (!rolesLoading && roles.length && !form.role_id && modalMode === 'add') {
      setForm((f) => ({ ...f, role_id: roles[0].role_id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesLoading, roles, modalMode])

  const roleName = (roleId) => roles.find((r) => r.role_id === roleId)?.role_name ?? 'Unknown'

  const sourceList = showArchived ? archivedUsers : users

  const filteredUsers = useMemo(() => {
    return sourceList.filter((u) => {
      if (roleFilter !== 'all' && u.role_id !== Number(roleFilter)) return false
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
      if (search && !fullName.includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      return true
    })
  }, [sourceList, search, roleFilter, statusFilter])

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.status === 'Active').length,
    inactive: users.filter((u) => u.status === 'Inactive').length,
    archived: archivedUsers.length,
  }), [users, archivedUsers])

  const toggleArchive = async (user) => {
    if (user.is_archived) {
      await restoreUser(user.user_id)
    } else {
      await archiveUser(user.user_id)
    }
  }

  const openAddModal = () => {
    setForm({ ...EMPTY_FORM, role_id: roles[0]?.role_id ?? '' })
    setFormValidationError('')
    setModalMode('add')
  }

  const openEditModal = (user) => {
    setForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role_id: user.role_id,
      status: user.status,
    })
    setFormValidationError('')
    setModalMode(user)
  }

  const closeModal = () => {
    setModalMode(null)
    setFormValidationError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormValidationError('')

    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setFormValidationError('First name, last name, and email are required.')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setFormValidationError('Enter a valid email address.')
      return
    }

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim(),
      role_id: Number(form.role_id),
      status: form.status,
    }

    const wasAdding = modalMode === 'add'
    const result = wasAdding
      ? await createUser(payload)
      : await updateUser(modalMode.user_id, payload)

    if (result.success) {
      closeModal()
      if (wasAdding && result.data?.initial_password) {
        setNewUserCredentials({
          employee_no: result.data.employee_no,
          password: result.data.initial_password,
        })
      }
    }
    // On failure, formError (from the hook) surfaces via InlineError below —
    // the modal stays open so the person can fix it.
  }

  // Each stat card doubles as a quick filter — clicking it narrows the table
  // to match, and is highlighted while that filter is the active one. The
  // Archived card is the only way to toggle showArchived now (the separate
  // "Show Archived" button in the filter bar was removed as redundant); every
  // other card explicitly resets showArchived to false when clicked, so
  // there's still a one-click way back out of the archived view.
  const statCards = [
    {
      key: 'total',
      label: 'Total Users',
      value: stats.total,
      icon: UsersIcon,
      iconBg: 'bg-primary/15',
      iconColor: 'text-primary-dark',
      isActive: roleFilter === 'all' && statusFilter === 'all' && !showArchived,
      onClick: () => { setRoleFilter('all'); setStatusFilter('all'); setShowArchived(false) },
    },
    {
      key: 'active',
      label: 'Active',
      value: stats.active,
      icon: UserCheck,
      iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      isActive: statusFilter === 'Active' && !showArchived,
      onClick: () => { setStatusFilter('Active'); setShowArchived(false) },
    },
    {
      key: 'inactive',
      label: 'Inactive',
      value: stats.inactive,
      icon: UserX,
      iconBg: 'bg-red-50 dark:bg-red-500/10',
      iconColor: 'text-red-600 dark:text-red-400',
      isActive: statusFilter === 'Inactive' && !showArchived,
      onClick: () => { setStatusFilter('Inactive'); setShowArchived(false) },
    },
    {
      key: 'archived',
      label: 'Archived',
      value: stats.archived,
      icon: Archive,
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-500 dark:text-slate-400',
      isActive: showArchived,
      onClick: () => setShowArchived((prev) => !prev),
    },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Manage system accounts and access.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAddModal} disabled={rolesLoading}>
          Add User
        </Button>
      </div>

      {usersError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {usersError}
        </div>
      )}

      {/* Stat cards — clickable quick filters */}
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
                <p className="text-lg font-bold text-ink">{usersLoading ? '—' : card.value}</p>
              </div>
            </button>
          )
        })}
      </div>
      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className={`${INPUT} pl-9`}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className={`${INPUT} lg:w-56! shrink-0`}
        >
          <option value="all">All Roles</option>
          {roles.map((r) => (
            <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">User</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Role</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Last Login</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                    Loading users…
                  </td>
                </tr>
              )}

              {!usersLoading && filteredUsers.map((u) => {
                const revealed = revealedIds.has(u.user_id)
                const avatarFailed = avatarErrorIds.has(u.user_id)
                const avatarSrc = resolveAvatarUrl(u.avatar_url)
                const showAvatarImage = avatarSrc && !avatarFailed
                return (
                  <tr
                    key={u.user_id}
                    data-row-id={u.user_id}
                    className={`border-b border-border last:border-0 transition-colors duration-300
                      ${highlightedId === u.user_id ? 'bg-primary/10' : 'hover:bg-bg'}`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-dark overflow-hidden">
                          {showAvatarImage ? (
                            <img
                              src={avatarSrc}
                              alt={`${u.first_name} ${u.last_name}`}
                              className="h-full w-full object-cover"
                              onError={() => markAvatarError(u.user_id)}
                            />
                          ) : (
                            initials(u.first_name, u.last_name)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate font-medium text-ink">{u.first_name} {u.last_name}</p>
                            <button
                              type="button"
                              onClick={() => toggleReveal(u.user_id)}
                              aria-label={revealed ? 'Hide contact details' : 'Show contact details'}
                              className="shrink-0 text-muted hover:text-ink transition-colors duration-150"
                            >
                              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          <p className="truncate text-xs text-muted">{revealed ? u.email : MASKED_EMAIL}</p>
                          <p className="truncate text-xs text-muted font-mono">{revealed ? u.employee_no : MASKED_VALUE}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_STYLES[roleName(u.role_id)] || ROLE_STYLE_FALLBACK}`}>
                        {roleName(u.role_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[u.status]}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-muted">
                      <span className="flex items-center gap-1.5 text-xs">
                        <Clock size={12} /> {formatDateTime(u.last_login)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="View profile" align="start">
                          <button
                            type="button"
                            onClick={() => setViewingUser(u)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                          >
                            <IdCard size={15} />
                          </button>
                        </Tooltip>
                        {!u.is_archived && (
                          <Tooltip label="Edit user" align="start">
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                            >
                              <Pencil size={15} />
                            </button>
                          </Tooltip>
                        )}
                        <Tooltip label={u.is_archived ? 'Restore user' : 'Archive user'} align="end">
                          <button
                            type="button"
                            onClick={() => toggleArchive(u)}
                            disabled={actionBusyId === u.user_id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-50"
                          >
                            {u.is_archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {!usersLoading && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                    No users match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit User' : 'Add User'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} loading={formSaving}>
              {isEditing ? 'Save Changes' : 'Add User'}
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

          {isEditing && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2">
              <span className="text-xs text-muted">Employee No.</span>
              <span className="text-xs font-mono font-medium text-ink">{modalMode.employee_no}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>First Name</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                className={INPUT}
                placeholder="Juan"
              />
            </div>
            <div>
              <label className={LABEL}>Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                className={INPUT}
                placeholder="Dela Cruz"
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={INPUT}
              placeholder="juan.delacruz@alibaton.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Role</label>
              <select
                value={form.role_id}
                onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
                className={INPUT}
              >
                {roles.map((r) => (
                  <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className={INPUT}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </form>
      </Modal>

      <NewUserCredentialsModal
        credentials={newUserCredentials}
        onClose={() => setNewUserCredentials(null)}
      />

      <ViewProfileModal
        user={viewingUser}
        roleLabel={viewingUser ? roleName(viewingUser.role_id) : ''}
        onClose={() => setViewingUser(null)}
      />
    </div>
  )
}