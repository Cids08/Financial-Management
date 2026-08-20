import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Lock,
  ShieldCheck,
  Smartphone,
  Monitor,
  LogOut,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  UserX,
  KeyRound,
  Clock,
  Building2,
  Upload,
  Trash2,
  Copy,
  Mail,
  Phone,
  MapPin,
  Coins,
} from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { useCompany } from '../context/CompanyContext'
import { useAccountSecurity } from '../hooks/useAccountSecurity'
import { usePermissions } from '../context/PermissionsContext'

const ACTIVITY_ICON = {
  Login: CheckCircle2,
  'Failed Login': AlertTriangle,
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
}

const CURRENCIES = ['PHP', 'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'SGD']

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
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
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

export default function Settings({ title = 'Settings', crumbs = ['Settings'] }) {
  // Company Branding + Regional/Financial Defaults are admin-only on the
  // backend — routes/api.php gates PUT/logo endpoints with settings.manage
  // (its own dedicated permission, not borrowed from users.manage — that
  // was an earlier, now-reverted approach). GET /api/settings itself only
  // needs settings.view, which every role has (see RolesAndPermissionsSeeder)
  // so the sidebar logo/name still works for everyone; the edit forms here
  // are hidden entirely for anyone without settings.manage specifically.
  const { hasPermission, loading: permissionsLoading } = usePermissions()
  const canManageBranding = hasPermission('settings.manage')

  /* Company Branding + regional/financial defaults (settings table) */
  const {
    name, tagline, address, email, phone, logoUrl,
    currency, fiscalYear, defaultTaxRate, forecastMonths,
    loading: companyLoading, saving: brandSaving, error: brandApiError,
    updateBranding, uploadLogo, removeLogo,
  } = useCompany()

  const [brandForm, setBrandForm] = useState({
    name: '', tagline: '', address: '', email: '', phone: '',
    currency: 'PHP', fiscalYear: new Date().getFullYear(), defaultTaxRate: 0, forecastMonths: 12,
  })
  const [brandSaved, setBrandSaved] = useState(false)
  const [logoModalOpen, setLogoModalOpen] = useState(false)

  useEffect(() => {
    if (companyLoading) return
    setBrandForm({
      name: name || '',
      tagline: tagline || '',
      address: address || '',
      email: email || '',
      phone: phone || '',
      currency: currency || 'PHP',
      fiscalYear: fiscalYear ?? new Date().getFullYear(),
      defaultTaxRate: defaultTaxRate ?? 0,
      forecastMonths: forecastMonths ?? 12,
    })
  }, [companyLoading, name, tagline, address, email, phone, currency, fiscalYear, defaultTaxRate, forecastMonths])

  const handleBrandField = (field) => (e) =>
    setBrandForm((f) => ({ ...f, [field]: e.target.value }))

  const handleBrandSubmit = async (e) => {
    e.preventDefault()
    setBrandSaved(false)
    const result = await updateBranding({
      name: brandForm.name.trim() || 'FMS',
      tagline: brandForm.tagline.trim(),
      address: brandForm.address.trim(),
      email: brandForm.email.trim(),
      phone: brandForm.phone.trim(),
      currency: brandForm.currency,
      fiscalYear: Number(brandForm.fiscalYear),
      defaultTaxRate: Number(brandForm.defaultTaxRate),
      forecastMonths: Number(brandForm.forecastMonths),
    })
    if (result.success) {
      setBrandSaved(true)
      setTimeout(() => setBrandSaved(false), 2500)
    }
  }

  /* Account security (password, 2FA, sessions, activity, deactivate) */
  const security = useAccountSecurity()

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

  /* Two-factor authentication */
  const [twoFAModalOpen, setTwoFAModalOpen] = useState(false)
  const [disable2FAModalOpen, setDisable2FAModalOpen] = useState(false)
  const [setupData, setSetupData] = useState(null) // { secret, qrCodeUrl }
  const [verifyCode, setVerifyCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState(null)

  const handleToggle2FA = async () => {
    if (security.twoFAEnabled) {
      setDisable2FAModalOpen(true)
      return
    }
    setVerifyCode('')
    setRecoveryCodes(null)
    const result = await security.initiateTwoFactor()
    if (result.success) {
      setSetupData(result)
      setTwoFAModalOpen(true)
    }
  }

  const confirmEnable2FA = async () => {
    const result = await security.confirmTwoFactor(verifyCode)
    if (result.success) {
      setRecoveryCodes(result.recoveryCodes || [])
    }
  }

  const closeTwoFAModal = () => {
    setTwoFAModalOpen(false)
    setSetupData(null)
    setRecoveryCodes(null)
    setVerifyCode('')
  }

  const confirmDisable2FA = async () => {
    const result = await security.disableTwoFactor()
    if (result.success) setDisable2FAModalOpen(false)
  }

  /* Active sessions */
  const [signOutAllModalOpen, setSignOutAllModalOpen] = useState(false)

  const signOutAllOthers = async () => {
    const result = await security.revokeOtherSessions()
    if (result.success) setSignOutAllModalOpen(false)
  }

  /* Danger zone */
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false)
  const [deactivateConfirmText, setDeactivateConfirmText] = useState('')

  const canDeactivate = deactivateConfirmText.trim().toUpperCase() === 'DEACTIVATE'

  const handleDeactivate = async () => {
    const result = await security.deactivateAccount()
    if (result.success) {
      setDeactivateModalOpen(false)
      // Session tokens were revoked server-side; redirect to login.
      window.location.href = '/login'
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fadeIn pb-8">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">Manage your account security and access.</p>
      </div>

      {/* Company Branding — admin-only (users.manage). Hidden entirely for
          everyone else, rather than shown and then 403'd on submit. While
          permissions are still loading, nothing renders here yet to avoid
          a flash of the form for someone who then loses access to it. */}
      {!permissionsLoading && canManageBranding && (
        <div className={`${PANEL} ${PANEL_PAD}`}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
              <Building2 size={17} />
            </div>
            <div>
              <p className={SECTION_TITLE}>Company Branding</p>
              <p className={SECTION_SUBTITLE}>Shown in the sidebar across the app.</p>
            </div>
          </div>

          <form onSubmit={handleBrandSubmit} className="space-y-4 max-w-md">
            {brandSaved && <InlineSuccess message="Branding updated." />}
            <InlineError message={brandApiError} />

            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-primary overflow-hidden">
                {companyLoading ? (
                  <div className="h-full w-full animate-pulse bg-black/10" />
                ) : logoUrl ? (
                  <img src={logoUrl} alt={name} className="h-full w-full object-cover" />
                ) : (
                  <Building2 size={22} className="text-[#111827]" />
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={companyLoading}
                onClick={() => setLogoModalOpen(true)}
              >
                Change Logo
              </Button>
            </div>

            <div>
              <label className={LABEL}>Company Name</label>
              <input
                type="text"
                value={brandForm.name}
                onChange={handleBrandField('name')}
                className={INPUT}
                placeholder="FMS"
                disabled={companyLoading}
              />
            </div>

            <div>
              <label className={LABEL}>Tagline</label>
              <input
                type="text"
                value={brandForm.tagline}
                onChange={handleBrandField('tagline')}
                className={INPUT}
                placeholder="Enterprise Suite"
                disabled={companyLoading}
              />
            </div>

            <div>
              <label className={LABEL}>Company Address</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-primary focus-within:bg-white transition-colors duration-150">
                <MapPin size={15} className="text-muted shrink-0" />
                <input
                  type="text"
                  value={brandForm.address}
                  onChange={handleBrandField('address')}
                  placeholder="123 Construction Ave, Quezon City"
                  className="w-full text-sm text-ink bg-transparent outline-none border-0"
                  disabled={companyLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Company Email</label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-primary focus-within:bg-white transition-colors duration-150">
                  <Mail size={15} className="text-muted shrink-0" />
                  <input
                    type="email"
                    value={brandForm.email}
                    onChange={handleBrandField('email')}
                    placeholder="finance@alibaton.com"
                    className="w-full text-sm text-ink bg-transparent outline-none border-0"
                    disabled={companyLoading}
                  />
                </div>
              </div>
              <div>
                <label className={LABEL}>Company Phone</label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-primary focus-within:bg-white transition-colors duration-150">
                  <Phone size={15} className="text-muted shrink-0" />
                  <input
                    type="text"
                    value={brandForm.phone}
                    onChange={handleBrandField('phone')}
                    placeholder="+63 2 8XXX XXXX"
                    className="w-full text-sm text-ink bg-transparent outline-none border-0"
                    disabled={companyLoading}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" size="md" loading={brandSaving} disabled={companyLoading}>
                Save Branding
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Regional & Financial Defaults — same gate as Company Branding. */}
      {!permissionsLoading && canManageBranding && (
        <div className={`${PANEL} ${PANEL_PAD}`}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
              <Coins size={17} />
            </div>
            <div>
              <p className={SECTION_TITLE}>Regional & Financial Defaults</p>
              <p className={SECTION_SUBTITLE}>Used across budgets, forecasts, and reports.</p>
            </div>
          </div>

          <form onSubmit={handleBrandSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
            <div>
              <label className={LABEL}>Currency</label>
              <select
                value={brandForm.currency}
                onChange={handleBrandField('currency')}
                className={INPUT}
                disabled={companyLoading}
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Fiscal Year</label>
              <input
                type="number"
                value={brandForm.fiscalYear}
                onChange={handleBrandField('fiscalYear')}
                className={INPUT}
                disabled={companyLoading}
              />
            </div>
            <div>
              <label className={LABEL}>Default Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={brandForm.defaultTaxRate}
                onChange={handleBrandField('defaultTaxRate')}
                className={INPUT}
                disabled={companyLoading}
              />
            </div>
            <div>
              <label className={LABEL}>Forecast Horizon (months)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={brandForm.forecastMonths}
                onChange={handleBrandField('forecastMonths')}
                className={INPUT}
                disabled={companyLoading}
              />
            </div>

            <div className="sm:col-span-2 flex justify-end pt-1">
              <Button type="submit" variant="primary" size="md" loading={brandSaving} disabled={companyLoading}>
                Save Defaults
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Change Password — every authenticated user, no permission needed */}
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

        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
          <InlineError message={security.passwordError} />
          <InlineSuccess message={pwSuccess} />

          <PasswordInput
            label="Current Password"
            value={pwForm.current}
            onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
          />
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
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60
              ${security.twoFAEnabled ? 'bg-primary' : 'bg-border'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200
                ${security.twoFAEnabled ? 'translate-x-5.5' : 'translate-x-0.5'}`}
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
          <div className="space-y-2 mt-2">
            {security.sessions.map((s) => {
              const deviceLabel = s.device || 'Unknown device'
              const isMobile = deviceLabel.toLowerCase().includes('iphone') || deviceLabel.toLowerCase().includes('android')
              const DeviceIcon = isMobile ? Smartphone : Monitor
              const isCurrent = s.id === security.currentTokenId
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
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
                      <p className="flex items-center gap-1 truncate text-xs text-muted">
                        <MapPin size={11} /> {s.location || 'Unknown location'} · {s.ip || 'Unknown IP'}
                      </p>
                      <p className="flex items-center gap-1 truncate text-[11px] text-muted mt-0.5">
                        <Clock size={11} /> Active {timeAgo(s.lastActive)}
                      </p>
                    </div>
                  </div>

                  {!isCurrent && (
                    <Tooltip label="Sign out this device">
                      <button
                        type="button"
                        onClick={() => security.revokeSession(s.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors duration-150"
                      >
                        <LogOut size={15} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Security Activity */}
      <div className={PANEL}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
            <Clock size={17} />
          </div>
          <div>
            <p className={SECTION_TITLE}>Recent Security Activity</p>
            <p className={SECTION_SUBTITLE}>Logins, password changes, and other account events.</p>
          </div>
        </div>

        {security.activityLoading ? (
          <p className="text-xs text-muted px-5 py-4">Loading activity…</p>
        ) : security.activityLog.length === 0 ? (
          <p className="text-xs text-muted px-5 py-4">No recent activity.</p>
        ) : (
          <div className="divide-y divide-border">
            {security.activityLog.map((log) => {
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
        )}
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-500/20 dark:bg-red-500/5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <UserX size={17} />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Danger Zone</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">Deactivating your account will sign you out everywhere.</p>
          </div>
        </div>
        <Button variant="danger" size="sm" onClick={() => setDeactivateModalOpen(true)}>
          Deactivate Account
        </Button>
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
            <p className="text-sm text-ink">Scan this code with your authenticator app (Google Authenticator, Authy, etc.):</p>
            <div className="flex justify-center">
              {setupData?.qrCodeUrl ? (
                <div className="flex h-36 w-36 items-center justify-center rounded-lg border border-border bg-white p-3">
                  <QRCodeSVG
                    value={setupData.qrCodeUrl}
                    size={128}
                    bgColor="#ffffff"
                    fgColor="#111827"
                    level="M"
                  />
                </div>
              ) : (
                <div className="flex h-36 w-36 items-center justify-center rounded-lg border border-dashed border-border bg-bg text-xs text-muted text-center px-2">
                  Generating code…
                </div>
              )}
            </div>
            {setupData?.secret && (
              <p className="text-center text-[11px] text-muted">
                Can't scan it? Enter this key manually: <span className="font-mono text-ink">{setupData.secret}</span>
              </p>
            )}
            <InlineError message={security.twoFAError} />
            <div>
              <label className={LABEL}>6-digit verification code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className={`${INPUT} tracking-[0.4em] text-center font-mono`}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Disable 2FA confirm modal */}
      <Modal
        open={disable2FAModalOpen}
        onClose={() => setDisable2FAModalOpen(false)}
        title="Disable Two-Factor Authentication"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setDisable2FAModalOpen(false)}>Cancel</Button>
            <Button variant="danger" size="md" onClick={confirmDisable2FA} loading={security.twoFABusy}>Disable</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">
            This will make your account less secure. Are you sure you want to disable two-factor authentication?
          </p>
          <InlineError message={security.twoFAError} />
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

      {/* Deactivate account modal */}
      <Modal
        open={deactivateModalOpen}
        onClose={() => { setDeactivateModalOpen(false); setDeactivateConfirmText('') }}
        title="Deactivate Account"
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => { setDeactivateModalOpen(false); setDeactivateConfirmText('') }}>
              Cancel
            </Button>
            <Button variant="danger" size="md" disabled={!canDeactivate} loading={security.deactivating} onClick={handleDeactivate}>
              Deactivate
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink">
            This will deactivate your account and sign you out everywhere. This action may need an administrator to reverse.
          </p>
          <InlineError message={security.deactivateError} />
          <div>
            <label className={LABEL}>Type DEACTIVATE to confirm</label>
            <input
              type="text"
              value={deactivateConfirmText}
              onChange={(e) => setDeactivateConfirmText(e.target.value)}
              placeholder="DEACTIVATE"
              className={INPUT}
            />
          </div>
        </div>
      </Modal>

      {canManageBranding && (
        <LogoUploadModal
          open={logoModalOpen}
          currentUrl={logoUrl}
          onClose={() => setLogoModalOpen(false)}
          onUpload={async (file) => {
            const result = await uploadLogo(file)
            if (result.success) setLogoModalOpen(false)
            return result
          }}
          onRemove={async () => {
            const result = await removeLogo()
            if (result.success) setLogoModalOpen(false)
            return result
          }}
        />
      )}
    </div>
  )
}

function LogoUploadModal({ open, currentUrl, onClose, onUpload, onRemove }) {
  const [preview, setPreview] = useState(currentUrl)
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const MAX_SIZE_MB = 2
  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

  useEffect(() => {
    if (open) {
      setPreview(currentUrl)
      setFile(null)
      setError('')
    }
  }, [open, currentUrl])

  const processFile = (selected) => {
    if (!selected) return
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError('Please use a JPG, PNG, WEBP, or SVG image.')
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

  const handleSave = async () => {
    if (!file) return
    setBusy(true)
    const result = await onUpload(file)
    setBusy(false)
    if (!result.success) setError(result.message || 'Failed to upload logo.')
  }

  const handleRemove = async () => {
    setBusy(true)
    const result = await onRemove()
    setBusy(false)
    if (!result.success) setError(result.message || 'Failed to remove logo.')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Update Company Logo"
      maxWidth="max-w-sm"
      footer={
        <>
          <button
            type="button"
            onClick={handleRemove}
            disabled={!currentUrl || busy}
            className="mr-auto flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700
              disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150"
          >
            <Trash2 size={14} /> Remove logo
          </button>
          <Button variant="secondary" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" disabled={!file || busy} loading={busy} onClick={handleSave}>
            Save Logo
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-primary">
            {preview ? (
              <img src={preview} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <Building2 size={28} className="text-[#111827]" />
            )}
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files?.[0]) }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed
            px-4 py-6 text-center cursor-pointer transition-colors duration-150
            ${dragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60 hover:bg-bg'}`}
        >
          <Upload size={20} className="text-muted" />
          <p className="text-xs text-ink font-medium">
            Drag & drop an image, or <span className="text-primary-dark underline">browse</span>
          </p>
          <p className="text-[11px] text-muted">JPG, PNG, WEBP or SVG, up to {MAX_SIZE_MB}MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            onChange={(e) => processFile(e.target.files?.[0])}
            className="hidden"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}