import { useEffect, useMemo, useRef, useState } from 'react'
import {
  User, Mail, Phone, Briefcase, Camera, Save, X, Upload, Trash2, AlertCircle,
  Lock, ShieldCheck, Smartphone, Monitor, LogOut, Eye, EyeOff, CheckCircle2,
  AlertTriangle, UserX, KeyRound, Clock, CalendarRange, Copy, Download, RefreshCw,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import Pagination from '../components/Pagination'
import OtpInput from '../components/OtpInput'
import { useProfile } from '../hooks/useProfile'
import { useAccountSecurity } from '../hooks/useAccountSecurity'
import { useCountdown, formatCountdown } from '../hooks/useCountdown'

const ACTIVITY_ICON = {
  Login: CheckCircle2,
  'Failed Login': AlertTriangle,
  'Forced Logout': LogOut,
  'Password Change': KeyRound,
  '2FA Enabled': ShieldCheck,
  '2FA Disabled': ShieldCheck,
  'Session Revoked': LogOut,
  'Signed Out Other Sessions': LogOut,
  'Account Deactivated': UserX,
}

const ACTIVITY_COLOR = {
  success: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10',
  failed: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10',
  warning: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10',
}

/* ---------------------------------------------------------------------- */
/* Shared style tokens                                                     */
/* ---------------------------------------------------------------------- */
const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-5'
const SECTION_TITLE = 'text-sm font-semibold text-ink'
const SECTION_SUBTITLE = 'text-xs text-muted mt-0.5'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const INPUT_TEXT_STYLE = { color: 'var(--color-ink, #0f172a)', caretColor: 'var(--color-ink, #0f172a)', outline: 'none' }
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function localDateOnly(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function timeAgo(iso) {
  if (!iso) return 'Never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function csvField(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvField).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function InlineError({ message }) {
  if (!message) return null
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
      {message}
    </div>
  )
}

function InlineSuccess({ message }) {
  if (!message) return null
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
      <CheckCircle2 size={14} /> {message}
    </div>
  )
}

function PasswordInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`${INPUT} pr-9`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors duration-150"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  )
}

function SessionRow({ session, isCurrent, onRevoke }) {
  const deviceLabel = session.device || 'Unknown device'
  const isMobile = deviceLabel.toLowerCase().includes('iphone') || deviceLabel.toLowerCase().includes('android')
  const DeviceIcon = isMobile ? Smartphone : Monitor

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg text-muted">
          <DeviceIcon size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium text-ink">{deviceLabel}</p>
            {isCurrent && (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary-dark">
                This device
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <Clock size={11} /> Active {timeAgo(session.lastActive)}
          </p>
        </div>
      </div>
      {!isCurrent && (
        <button
          type="button"
          onClick={() => onRevoke(session.id)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300 transition-colors duration-150"
        >
          Sign out
        </button>
      )}
    </div>
  )
}

export default function Profile() {
  const { profile, loading, saving, error, updateProfile, uploadAvatar, removeAvatar } = useProfile()
  const security = useAccountSecurity()

  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    email: '',
    phone_number: '',
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (!profile) return
    setForm({
      first_name: profile.first_name || '',
      middle_name: profile.middle_name || '',
      last_name: profile.last_name || '',
      suffix: profile.suffix || '',
      email: profile.email || '',
      phone_number: profile.phone || '',
    })
  }, [profile])

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSuccessMessage('')
    const result = await updateProfile(form)
    if (result.success) {
      setSuccessMessage('Profile updated successfully.')
      setTimeout(() => setSuccessMessage(''), 3000)
    }
  }

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSuccess, setPwSuccess] = useState('')

  const passwordStrength = useMemo(() => {
    const v = pwForm.next
    if (!v) return { label: '', width: 'w-0', color: '' }
    let score = 0
    if (v.length >= 8) score++
    if (/[A-Z]/.test(v)) score++
    if (/[0-9]/.test(v)) score++
    if (/[^A-Za-z0-9]/.test(v)) score++
    const levels = [
      { label: 'Weak', width: 'w-1/4', color: 'bg-red-500' },
      { label: 'Fair', width: 'w-2/4', color: 'bg-amber-500' },
      { label: 'Good', width: 'w-3/4', color: 'bg-blue-500' },
      { label: 'Strong', width: 'w-full', color: 'bg-emerald-500' },
    ]
    return levels[Math.max(0, score - 1)] || levels[0]
  }, [pwForm.next])

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPwSuccess('')
    const result = await security.changePassword(pwForm)
    if (result.success) {
      setPwForm({ current: '', next: '', confirm: '' })
      setPwSuccess('Password updated successfully.')
      setTimeout(() => setPwSuccess(''), 3000)
    }
  }

  const [twoFAModalOpen, setTwoFAModalOpen] = useState(false)
  const [disable2FAModalOpen, setDisable2FAModalOpen] = useState(false)
  const [disable2FAPassword, setDisable2FAPassword] = useState('')
  const [setupData, setSetupData] = useState(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState(null)

  // Counts down to the setup code's expiry; once it hits 0 we disable the
  // input and offer a Resend button instead.
  const setupSecondsLeft = useCountdown(setupData?.codeExpiresAt)
  const setupExpired = Boolean(setupData) && setupSecondsLeft <= 0

  // Attach an absolute expiry timestamp so the modal can count down; the
  // backend returns the remaining seconds alongside maskedEmail.
  const withCodeExpiry = (result) => ({
    ...result,
    codeExpiresAt: Date.now() + (result.codeExpiresInSeconds ?? 600) * 1000,
  })

  const handleToggle2FA = async () => {
    if (security.twoFAEnabled) {
      setDisable2FAModalOpen(true)
      return
    }
    setVerifyCode('')
    setRecoveryCodes(null)
    const result = await security.initiateTwoFactor()
    if (result.success) {
      setSetupData(withCodeExpiry(result))
      setTwoFAModalOpen(true)
    }
  }

  const confirmEnable2FA = async () => {
    const result = await security.confirmTwoFactor(verifyCode)
    if (result.success) {
      setRecoveryCodes(result.recoveryCodes || [])
    }
  }

  const resendCode = async () => {
    setVerifyCode('')
    const result = await security.initiateTwoFactor()
    if (result.success) setSetupData(withCodeExpiry(result))
  }

  const closeTwoFAModal = () => {
    setTwoFAModalOpen(false)
    setSetupData(null)
    setRecoveryCodes(null)
    setVerifyCode('')
  }

  const closeDisable2FAModal = () => {
    setDisable2FAModalOpen(false)
    setDisable2FAPassword('')
  }

  const confirmDisable2FA = async () => {
    const result = await security.disableTwoFactor(disable2FAPassword)
    if (result.success) closeDisable2FAModal()
  }

  const [signOutAllModalOpen, setSignOutAllModalOpen] = useState(false)

  const signOutAllOthers = async () => {
    const result = await security.revokeOtherSessions()
    if (result.success) setSignOutAllModalOpen(false)
  }

  const { currentSession, otherSessions } = useMemo(() => {
    const current = security.sessions.find((s) => s.id === security.currentTokenId) || null
    const others = security.sessions.filter((s) => s.id !== security.currentTokenId)
    return { currentSession: current, otherSessions: others }
  }, [security.sessions, security.currentTokenId])

  const [activityDateFrom, setActivityDateFrom] = useState('')
  const [activityDateTo, setActivityDateTo] = useState('')
  const hasActivityDateFilter = Boolean(activityDateFrom || activityDateTo)
  const clearActivityDateFilter = () => { setActivityDateFrom(''); setActivityDateTo('') }

  const filteredActivity = useMemo(() => {
    if (!hasActivityDateFilter) return security.activityLog
    return security.activityLog.filter((log) => {
      const logDate = localDateOnly(log.createdAt)
      if (activityDateFrom && (!logDate || logDate < activityDateFrom)) return false
      if (activityDateTo && (!logDate || logDate > activityDateTo)) return false
      return true
    })
  }, [security.activityLog, activityDateFrom, activityDateTo, hasActivityDateFilter])

  const [activityPage, setActivityPage] = useState(1)
  const ACTIVITY_PAGE_SIZE = 6
  const activityTotalPages = Math.max(1, Math.ceil(filteredActivity.length / ACTIVITY_PAGE_SIZE))
  const safeActivityPage = Math.min(activityPage, activityTotalPages)
  const activityStart = (safeActivityPage - 1) * ACTIVITY_PAGE_SIZE
  const visibleActivity = filteredActivity.slice(activityStart, activityStart + ACTIVITY_PAGE_SIZE)

  const exportActivity = () => {
    const rows = [
      ['Date/Time', 'Event', 'Description', 'IP Address', 'Status'],
      ...filteredActivity.map((log) => [
        formatDateTime(log.createdAt),
        log.action,
        log.description,
        log.ip,
        log.status,
      ]),
    ]
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(`security-activity-${today}.csv`, rows)
  }

  useEffect(() => {
    setActivityPage(1)
  }, [filteredActivity.length])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 lg:px-0">
        <p className="text-sm text-muted">Loading profile…</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 lg:px-0 space-y-5 animate-fadeIn">
      <Breadcrumb items={['Profile']} />
      <div>
        <h1 className="text-xl font-bold text-ink">My Profile</h1>
        <p className="text-sm text-muted mt-0.5">Manage your personal information and account security.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 mb-1 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-1 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs text-ink">
          {successMessage}
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border shadow-header p-6">
        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                <User size={26} className="text-primary-dark" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-800 text-white
                flex items-center justify-center hover:bg-slate-700 transition-colors duration-150"
              aria-label="Change photo"
            >
              <Camera size={12} />
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{profile?.name}</p>
            <p className="text-xs text-muted">{profile?.role}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First Name" icon={User} value={form.first_name} onChange={handleChange('first_name')} />
            <Field label="Middle Name" icon={User} value={form.middle_name} onChange={handleChange('middle_name')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Last Name" icon={User} value={form.last_name} onChange={handleChange('last_name')} />
            <Field label="Suffix" icon={User} value={form.suffix} onChange={handleChange('suffix')} placeholder="Jr., Sr., III" />
          </div>
          <Field label="Email" icon={Mail} type="email" value={form.email} onChange={handleChange('email')} />
          <Field label="Phone" icon={Phone} value={form.phone_number} onChange={handleChange('phone_number')} placeholder="+63 9XX XXX XXXX" />
          <Field label="Role" icon={Briefcase} value={profile?.role || ''} disabled />

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-ink text-sm font-semibold
                hover:bg-primary-dark hover:text-white transition-colors duration-150 disabled:opacity-60"
            >
              <Save size={15} />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className={`${PANEL} ${PANEL_PAD}`}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
            <Lock size={17} />
          </div>
          <div>
            <p className={SECTION_TITLE}>Change Password</p>
            <p className={SECTION_SUBTITLE}>Use a strong password you don't use elsewhere.</p>
          </div>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <InlineError message={security.passwordError} />
          <InlineSuccess message={pwSuccess} />

          <PasswordInput
            label="Current Password"
            value={pwForm.current}
            onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <PasswordInput
                label="New Password"
                value={pwForm.next}
                onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
              />
              {pwForm.next && (
                <div className="mt-1.5">
                  <div className="h-1 w-full rounded-full bg-border overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${passwordStrength.width} ${passwordStrength.color}`} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{passwordStrength.label} password</p>
                </div>
              )}
            </div>
            <PasswordInput
              label="Confirm New Password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary" size="md" loading={security.passwordSaving}>
              Update Password
            </Button>
          </div>
        </form>
      </div>

      {/* Two-Factor Authentication */}
      <div className={`${PANEL} ${PANEL_PAD}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
              <ShieldCheck size={17} />
            </div>
            <div>
              <p className={SECTION_TITLE}>Two-Factor Authentication</p>
              <p className={SECTION_SUBTITLE}>Add an extra layer of security to your account.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggle2FA}
            disabled={security.twoFABusy}
            role="switch"
            aria-checked={security.twoFAEnabled}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 disabled:opacity-60
              ${security.twoFAEnabled ? 'bg-primary border-primary' : 'bg-transparent border-border'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow-sm transition-transform duration-200
                ${security.twoFAEnabled ? 'translate-x-5 bg-white' : 'translate-x-0 bg-muted'}`}
            />
          </button>
        </div>

        {security.twoFAEnabled && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
            <CheckCircle2 size={14} className="shrink-0" />
            Two-factor authentication is active on your account.
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className={`${PANEL} ${PANEL_PAD}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
              <Monitor size={17} />
            </div>
            <div>
              <p className={SECTION_TITLE}>Active Sessions</p>
              <p className={SECTION_SUBTITLE}>Devices currently signed in to your account.</p>
            </div>
          </div>
          {security.sessions.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setSignOutAllModalOpen(true)}>
              Sign out all others
            </Button>
          )}
        </div>

        <InlineError message={security.sessionsError} />

        {security.sessionsLoading ? (
          <p className="text-xs text-muted py-2">Loading sessions…</p>
        ) : security.sessions.length === 0 ? (
          <p className="text-xs text-muted py-2">No active sessions found.</p>
        ) : (
          <div className="space-y-5 mt-2">
            {currentSession && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">
                  This Device
                </p>
                <SessionRow session={currentSession} isCurrent onRevoke={security.revokeSession} />
              </div>
            )}

            {otherSessions.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">
                  Other Sessions ({otherSessions.length})
                </p>
                <div className="space-y-2">
                  {otherSessions.map((s) => (
                    <SessionRow key={s.id} session={s} onRevoke={security.revokeSession} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Security Activity */}
      <div className={PANEL}>
        <div className="flex flex-col gap-3 px-5 py-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
              <Clock size={17} />
            </div>
            <div>
              <p className={SECTION_TITLE}>Recent Security Activity</p>
              <p className={SECTION_SUBTITLE}>Logins, password changes, and other account events.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarRange size={15} className="text-muted shrink-0" />
            <input
              type="date"
              value={activityDateFrom}
              onChange={(e) => setActivityDateFrom(e.target.value)}
              max={activityDateTo || undefined}
              aria-label="Activity date from"
              className={`${INPUT} scheme-light dark:scheme-dark`}
              style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={activityDateTo}
              onChange={(e) => setActivityDateTo(e.target.value)}
              min={activityDateFrom || undefined}
              aria-label="Activity date to"
              className={`${INPUT} scheme-light dark:scheme-dark`}
              style={{ ...INPUT_TEXT_STYLE, width: '9.5rem' }}
            />
            {hasActivityDateFilter && (
              <Tooltip label="Clear date filter" align="end">
                <button
                  type="button"
                  onClick={clearActivityDateFilter}
                  aria-label="Clear date filter"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                >
                  <X size={15} />
                </button>
              </Tooltip>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={exportActivity}
              disabled={filteredActivity.length === 0}
              className="shrink-0 whitespace-nowrap"
            >
              Export
            </Button>
          </div>
        </div>

        {security.activityLoading ? (
          <p className="text-xs text-muted px-5 py-4">Loading activity…</p>
        ) : filteredActivity.length === 0 ? (
          <p className="text-xs text-muted px-5 py-4">
            {hasActivityDateFilter ? 'No activity in the selected date range.' : 'No recent activity.'}
          </p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {visibleActivity.map((log) => {
                const Icon = ACTIVITY_ICON[log.action] || Clock
                return (
                  <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${ACTIVITY_COLOR[log.status]}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{log.action}</p>
                      <p className="text-xs text-muted">{log.description} · {log.ip}</p>
                    </div>
                    <p className="shrink-0 text-[11px] text-muted whitespace-nowrap">{formatDateTime(log.createdAt)}</p>
                  </div>
                )
              })}
            </div>

            {filteredActivity.length > ACTIVITY_PAGE_SIZE && (
              <Pagination
                page={safeActivityPage}
                totalPages={activityTotalPages}
                onPageChange={setActivityPage}
                total={filteredActivity.length}
                label="events"
                showRange
                rangeStart={activityStart + 1}
                rangeEnd={Math.min(activityStart + ACTIVITY_PAGE_SIZE, filteredActivity.length)}
                bordered
              />
            )}
          </>
        )}
      </div>

      {/* Enable 2FA modal */}
      <Modal
        open={twoFAModalOpen}
        onClose={closeTwoFAModal}
        title={recoveryCodes ? 'Save Your Recovery Codes' : 'Enable Two-Factor Authentication'}
        footer={
          recoveryCodes ? (
            <Button variant="primary" size="md" onClick={closeTwoFAModal}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" size="md" onClick={closeTwoFAModal}>Cancel</Button>
              <Button variant="primary" size="md" onClick={confirmEnable2FA} loading={security.twoFABusy}>
                Verify & Enable
              </Button>
            </>
          )
        }
      >
        {recoveryCodes ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Store these recovery codes somewhere safe. Each one can be used once if you lose access to your authenticator app. They won't be shown again.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg p-3 font-mono text-xs text-ink">
              {recoveryCodes.map((code) => <span key={code}>{code}</span>)}
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(recoveryCodes.join('\n'))}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-dark hover:underline"
            >
              <Copy size={13} /> Copy all codes
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              We've sent a 6-digit verification code to{' '}
              <span className="font-medium text-ink">{setupData?.maskedEmail || 'your email address'}</span>.
              Enter it below to confirm.
            </p>
            <InlineError message={security.twoFAError} />
            <div>
              <label className={LABEL}>6-digit verification code</label>
              <OtpInput
                length={6}
                value={verifyCode}
                onChange={setVerifyCode}
                onComplete={confirmEnable2FA}
                disabled={security.twoFABusy || setupExpired}
                hasError={Boolean(security.twoFAError)}
                autoFocus
              />
            </div>
            {setupExpired ? (
              <button
                type="button"
                onClick={resendCode}
                disabled={security.twoFABusy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary-dark ring-1 ring-primary/25 hover:bg-primary/15 disabled:opacity-50 disabled:pointer-events-none transition-colors duration-150"
              >
                <RefreshCw size={13} /> Resend code
              </button>
            ) : (
              <p className="text-xs text-muted">
                Code expires in{' '}
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold tabular-nums transition-colors duration-300 ${
                    setupSecondsLeft <= 30
                      ? 'border-red-300/70 bg-red-50/80 text-red-600 animate-pulse dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'
                      : 'border-amber-300/70 bg-amber-50/80 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
                  }`}
                >
                  <Clock size={11} />
                  {formatCountdown(setupSecondsLeft)}
                </span>
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Disable 2FA confirm modal */}
      <Modal
        open={disable2FAModalOpen}
        onClose={closeDisable2FAModal}
        title="Disable Two-Factor Authentication"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDisable2FAModal}>Cancel</Button>
            <Button
              variant="danger"
              size="md"
              onClick={confirmDisable2FA}
              loading={security.twoFABusy}
              disabled={!disable2FAPassword}
            >
              Disable
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">
            This will make your account less secure. Enter your password to confirm.
          </p>
          <InlineError message={security.twoFAError} />
          <PasswordInput
            label="Current Password"
            value={disable2FAPassword}
            onChange={(e) => setDisable2FAPassword(e.target.value)}
          />
        </div>
      </Modal>

      {/* Sign out all others confirm modal */}
      <Modal
        open={signOutAllModalOpen}
        onClose={() => setSignOutAllModalOpen(false)}
        title="Sign Out All Other Sessions"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setSignOutAllModalOpen(false)}>Cancel</Button>
            <Button variant="danger" size="md" onClick={signOutAllOthers}>Sign Out All</Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          This will sign you out on all devices except this one. You'll need to log in again on those devices.
        </p>
      </Modal>

      {modalOpen && (
        <AvatarUploadModal
          currentUrl={profile?.avatar_url}
          onClose={() => setModalOpen(false)}
          onUpload={async (file) => {
            const result = await uploadAvatar(file)
            if (result.success) setModalOpen(false)
            return result
          }}
          onRemove={async () => {
            const result = await removeAvatar()
            if (result.success) setModalOpen(false)
            return result
          }}
        />
      )}
    </div>
  )
}

function AvatarUploadModal({ currentUrl, onClose, onUpload, onRemove }) {
  const [preview, setPreview] = useState(currentUrl)
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const MAX_SIZE_MB = 5
  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

  const processFile = (selected) => {
    if (!selected) return
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError('Please use a JPG, PNG, or WEBP image.')
      return
    }
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image must be under ${MAX_SIZE_MB}MB.`)
      return
    }
    setError('')
    setFile(selected)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result)
    reader.readAsDataURL(selected)
  }

  const handleFileInput = (e) => processFile(e.target.files?.[0])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    processFile(e.dataTransfer.files?.[0])
  }

  const handleSave = async () => {
    if (!file) return
    setBusy(true)
    const result = await onUpload(file)
    setBusy(false)
    if (!result.success) setError(result.message || 'Failed to upload photo.')
  }

  const handleRemove = async () => {
    setBusy(true)
    const result = await onRemove()
    setBusy(false)
    if (!result.success) setError(result.message || 'Failed to remove photo.')
  }

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-ink/50 px-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Update profile photo"
    >
      <div
        className="w-full max-w-sm bg-surface rounded-xl border border-border shadow-dropdown overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">Update Profile Photo</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
              {preview ? (
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <User size={34} className="text-primary-dark" />
              )}
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed
              px-4 py-6 text-center cursor-pointer transition-colors duration-150
              ${dragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60 hover:bg-bg'}`}
          >
            <Upload size={20} className="text-muted" />
            <p className="text-xs text-ink font-medium">
              Drag & drop an image, or <span className="text-primary-dark underline">browse</span>
            </p>
            <p className="text-[11px] text-muted">JPG, PNG or WEBP, up to {MAX_SIZE_MB}MB</p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-bg/50">
          <button
            type="button"
            onClick={handleRemove}
            disabled={!currentUrl || busy}
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300
              disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150"
          >
            <Trash2 size={14} />
            Remove photo
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-ink hover:bg-bg transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!file || busy}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-ink
                hover:bg-primary-dark hover:text-white transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
            >
              {busy ? 'Saving…' : 'Save Photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon: Icon, disabled, ...inputProps }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted mb-1 block">{label}</span>
      <div
        className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2
          ${disabled ? 'bg-bg' : 'bg-surface focus-within:border-primary'}`}
      >
        <Icon size={15} className="text-muted shrink-0" />
        <input
          {...inputProps}
          disabled={disabled}
          className="w-full text-sm text-ink bg-transparent outline-none border-0 disabled:text-muted"
        />
      </div>
    </label>
  )
}