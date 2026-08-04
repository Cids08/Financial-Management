import { useState, useEffect, useRef } from 'react'
import { User, Mail, Phone, Briefcase, Camera, Save, X, Upload, Trash2, AlertCircle } from 'lucide-react'
import { useProfile } from '../hooks/useProfile'

export default function Profile() {
  const { profile, loading, saving, error, updateProfile, uploadAvatar, removeAvatar } = useProfile()

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

  // Populate the form once the profile has loaded (or changes, e.g. after avatar update).
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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 lg:px-0">
        <p className="text-sm text-muted">Loading profile…</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 lg:px-0">
      <h1 className="text-xl font-bold text-ink mb-1">My Profile</h1>
      <p className="text-sm text-muted mb-6">Manage your personal account information.</p>

      {error && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs text-ink">
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
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-ink text-white
                flex items-center justify-center hover:bg-ink/80 transition-colors duration-150"
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
        className="w-full max-w-sm bg-white rounded-xl border border-border shadow-dropdown overflow-hidden"
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

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-bg/50">
          <button
            type="button"
            onClick={handleRemove}
            disabled={!currentUrl || busy}
            className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700
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
          ${disabled ? 'bg-bg' : 'bg-white focus-within:border-primary'}`}
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