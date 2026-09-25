import { useEffect, useRef, useState } from 'react'
import { Building2, CheckCircle2, Coins, Mail, MapPin, Phone, Trash2, Upload } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import { useCompany } from '../context/CompanyContext'
import { usePermissions } from '../context/PermissionsContext'
import { currencySymbol } from '../utils/formatters'
import { compressImageToUploadable } from '../utils/fileUpload'
import AddressSelector from '../components/AddressSelector'

const CURRENCIES = [
  { code: 'PHP', label: 'Peso (PHP)' },
  { code: 'USD', label: 'Dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'JPY', label: 'Yen (JPY)' },
  { code: 'GBP', label: 'Pound (GBP)' },
  { code: 'AUD', label: 'Australian Dollar (AUD)' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)' },
]

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

export default function Settings({ title = 'Settings', crumbs = ['Settings'] }) {
  // Company Branding + Regional/Financial Defaults are admin-only on the
  // backend  -  routes/api.php gates PUT/logo endpoints with settings.manage
  // (its own dedicated permission, not borrowed from users.manage  -  that
  // was an earlier, now-reverted approach). GET /api/settings itself only
  // needs settings.view, which every role has (see RolesAndPermissionsSeeder)
  // so the sidebar logo/name still works for everyone; the edit forms here
  // are hidden entirely for anyone without settings.manage specifically.
  // Note: account security (password, 2FA, sessions, activity) lives on the
  // Profile page now, not here.
  const { hasPermission, loading: permissionsLoading } = usePermissions()
  const canManageBranding = hasPermission('settings.manage')

  const {
    name, tagline, address, email, phone, logoUrl,
    currency, baseCurrency, exchangeRates,
    fiscalYear, defaultTaxRate, defaultPenaltyRate, forecastMonths,
    loading: companyLoading, error: brandApiError,
    updateBranding, uploadLogo, removeLogo,
  } = useCompany()

  const [brandForm, setBrandForm] = useState({
    name: '', tagline: '', address: '', email: '', phone: '',
    currency: 'PHP', baseCurrency: 'PHP', exchangeRates: {},
    fiscalYear: new Date().getFullYear(), defaultTaxRate: 0, defaultPenaltyRate: 0, forecastMonths: 12,
  })
  const [brandSaved, setBrandSaved] = useState(false)
  const [defaultsSaved, setDefaultsSaved] = useState(false)
  // Per-section submit/error state. The context's shared `saving`/`error`
  // are used by both cards, so relying on them made BOTH buttons spin (and
  // showed errors in the wrong card) when saving just one.
  const [brandSubmitting, setBrandSubmitting] = useState(false)
  const [defaultsSubmitting, setDefaultsSubmitting] = useState(false)
  const [brandError, setBrandError] = useState('')
  const [defaultsError, setDefaultsError] = useState('')
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
      baseCurrency: baseCurrency || 'PHP',
      exchangeRates: exchangeRates || {},
      fiscalYear: fiscalYear ?? new Date().getFullYear(),
      defaultTaxRate: defaultTaxRate ?? 0,
      defaultPenaltyRate: defaultPenaltyRate ?? 0,
      forecastMonths: forecastMonths ?? 12,
    })
  }, [companyLoading, name, tagline, address, email, phone, currency, baseCurrency, exchangeRates, fiscalYear, defaultTaxRate, defaultPenaltyRate, forecastMonths])

  const handleBrandField = (field) => (e) =>
    setBrandForm((f) => ({ ...f, [field]: e.target.value }))

  const handleRateField = (code) => (e) =>
    setBrandForm((f) => ({ ...f, exchangeRates: { ...f.exchangeRates, [code]: e.target.value } }))

  // Only persist rates that are positive numbers; blank/0 means "same as
  // base" and is simply omitted from the map.
  const collectRates = () => {
    const rates = {}
    for (const { code } of CURRENCIES) {
      if (code === brandForm.baseCurrency) continue
      const raw = brandForm.exchangeRates?.[code]
      const num = Number(raw)
      if (raw !== '' && raw != null && Number.isFinite(num) && num > 0) rates[code] = num
    }
    return rates
  }

  // Live example of the display-currency conversion for the rate being
  // typed (uses the form values, not the saved module flags).
  const displayRate = Number(brandForm.exchangeRates?.[brandForm.currency])
  const ratePreview =
    Number.isFinite(displayRate) && displayRate > 0
      ? `${currencySymbol(brandForm.currency)}${(1000 / displayRate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : ''

  // The two sections save independently: each handler sends ONLY its own
  // fields, so saving one never persists unsaved edits from the other.
  // The backend now accepts partial updates (see UpdateSettingsRequest).
  const handleBrandingSubmit = async (e) => {
    e.preventDefault()
    setBrandSaved(false)
    setBrandError('')
    setBrandSubmitting(true)
    const result = await updateBranding({
      name: brandForm.name.trim() || 'FMS',
      tagline: brandForm.tagline.trim(),
      address: brandForm.address.trim(),
      email: brandForm.email.trim(),
      phone: brandForm.phone.trim(),
    })
    setBrandSubmitting(false)
    if (result.success) {
      setBrandSaved(true)
      setTimeout(() => setBrandSaved(false), 2500)
    } else {
      setBrandError(result.message || 'Failed to update branding.')
    }
  }

  const handleDefaultsSubmit = async (e) => {
    e.preventDefault()
    setDefaultsSaved(false)
    setDefaultsError('')
    setDefaultsSubmitting(true)
    const result = await updateBranding({
      currency: brandForm.currency,
      baseCurrency: brandForm.baseCurrency,
      exchangeRates: collectRates(),
      fiscalYear: Number(brandForm.fiscalYear),
      defaultTaxRate: Number(brandForm.defaultTaxRate),
      defaultPenaltyRate: Number(brandForm.defaultPenaltyRate),
      forecastMonths: Number(brandForm.forecastMonths),
    })
    setDefaultsSubmitting(false)
    if (result.success) {
      setDefaultsSaved(true)
      setTimeout(() => setDefaultsSaved(false), 2500)
    } else {
      setDefaultsError(result.message || 'Failed to update defaults.')
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fadeIn pb-8">
      <Breadcrumb items={crumbs} />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-xs text-muted">Manage your organization's branding and defaults.</p>
      </div>

      {/* Company Branding  -  admin-only (settings.manage). Hidden entirely for
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

          <form onSubmit={handleBrandingSubmit} className="space-y-4">
            {brandSaved && <InlineSuccess message="Branding updated." />}
            <InlineError message={brandError || brandApiError} />

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <div>
              <AddressSelector
                label="Company Address"
                value={brandForm.address}
                onChange={(newAddr) => setBrandForm((f) => ({ ...f, address: newAddr }))}
                placeholder="Select Philippine or International address..."
                disabled={companyLoading}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Company Email</label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-primary focus-within:bg-surface transition-colors duration-150">
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
                <div className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-primary focus-within:bg-surface transition-colors duration-150">
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
              <Button type="submit" variant="primary" size="md" loading={brandSubmitting} disabled={companyLoading}>
                Save Branding
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Regional & Financial Defaults  -  same gate as Company Branding. */}
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

          <form onSubmit={handleDefaultsSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {defaultsSaved && <div className="col-span-1 sm:col-span-2 lg:col-span-4"><InlineSuccess message="Defaults updated." /></div>}
            {defaultsError && <div className="col-span-1 sm:col-span-2 lg:col-span-4"><InlineError message={defaultsError} /></div>}
            <div>
              <label className={LABEL}>Currency</label>
              <select
                value={brandForm.currency}
                onChange={handleBrandField('currency')}
                className={INPUT}
                disabled={companyLoading}
              >
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Base Currency</label>
              <select
                value={brandForm.baseCurrency}
                onChange={handleBrandField('baseCurrency')}
                className={INPUT}
                disabled={companyLoading}
              >
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
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
              <label className={LABEL}>Default AR Penalty Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={brandForm.defaultPenaltyRate}
                onChange={handleBrandField('defaultPenaltyRate')}
                className={INPUT}
                disabled={companyLoading}
              />
            </div>
            <div>
              <label className={LABEL}>Forecast Horizon (months)</label>
              <input
                type="number"
                min="6"
                max="60"
                value={brandForm.forecastMonths}
                onChange={handleBrandField('forecastMonths')}
                className={INPUT}
                disabled={companyLoading}
              />
            </div>

            <div className="col-span-1 sm:col-span-2 lg:col-span-4">
              <label className={LABEL}>
                Exchange Rates <span className="font-normal">(how much 1 unit is worth in {brandForm.baseCurrency})</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {CURRENCIES.filter((c) => c.code !== brandForm.baseCurrency).map((c) => (
                  <div key={c.code} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 focus-within:border-primary focus-within:bg-surface transition-colors duration-150">
                    <span className="shrink-0 text-xs font-medium text-muted">1 {c.code} =</span>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={brandForm.exchangeRates?.[c.code] ?? ''}
                      onChange={handleRateField(c.code)}
                      placeholder="1"
                      className="w-full bg-transparent text-sm text-ink outline-none border-0 placeholder:text-muted"
                      disabled={companyLoading}
                    />
                    <span className="shrink-0 text-xs text-muted">{brandForm.baseCurrency}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted">
                Amounts are stored in {brandForm.baseCurrency} and shown in {brandForm.currency}.{' '}
                {brandForm.currency === brandForm.baseCurrency
                  ? 'Display currency equals the base, so no conversion is applied.'
                  : ratePreview
                    ? <>Example: {brandForm.baseCurrency} 1,000.00 = {ratePreview}.</>
                    : <>Enter a rate for {brandForm.currency} to convert amounts into it.</>}
              </p>
            </div>

            <div className="col-span-1 sm:col-span-2 lg:col-span-4 flex justify-end pt-1">
              <Button type="submit" variant="primary" size="md" loading={defaultsSubmitting} disabled={companyLoading}>
                Save Defaults
              </Button>
            </div>
          </form>
        </div>
      )}

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
    const result = await onUpload(await compressImageToUploadable(file))
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