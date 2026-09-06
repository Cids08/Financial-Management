import { useEffect, useState } from 'react'
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import Button from './Button'
import { apiFetch } from '../utils/api'
import { clearToken } from '../utils/authToken'

export default function MustChangePasswordListener() {
  const [visible, setVisible] = useState(false)
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [showPasswords, setShowPasswords] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(true)
    window.addEventListener('auth:must-change-password', handler)
    return () => window.removeEventListener('auth:must-change-password', handler)
  }, [])

  if (!visible) return null

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (form.next !== form.confirm) {
      setError('New password and confirmation do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await apiFetch('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Could not update password.')
      }

      window.location.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    clearToken()
    window.location.href = '/'
  }

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-surface p-6 shadow-2xl border border-white/10">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
          <Lock size={18} />
        </div>
        <h2 className="text-lg font-bold text-ink text-center">Change your password</h2>
        <p className="mt-1.5 text-sm text-muted text-center">
          For security, you must set your own password before continuing.
        </p>

        {error && (
          <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-lg bg-red-50/70 border border-red-200/70 text-xs text-red-600">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-muted mb-1 block">Current (temporary) password</span>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2">
              <Lock size={15} className="text-muted shrink-0" />
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                value={form.current}
                onChange={handleChange('current')}
                className="w-full text-sm bg-transparent outline-none border-0"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted mb-1 block">New password</span>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2">
              <Lock size={15} className="text-muted shrink-0" />
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                minLength={8}
                value={form.next}
                onChange={handleChange('next')}
                className="w-full text-sm bg-transparent outline-none border-0"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted mb-1 block">Confirm new password</span>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-2">
              <Lock size={15} className="text-muted shrink-0" />
              <input
                type={showPasswords ? 'text' : 'password'}
                required
                value={form.confirm}
                onChange={handleChange('confirm')}
                className="w-full text-sm bg-transparent outline-none border-0"
              />
              <button
                type="button"
                onClick={() => setShowPasswords((v) => !v)}
                className="text-muted hover:text-ink"
              >
                {showPasswords ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          <Button type="submit" variant="primary" size="md" className="w-full" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </Button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-xs text-muted hover:text-ink text-center pt-1"
          >
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  )
}