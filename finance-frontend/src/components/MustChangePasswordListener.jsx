import { useEffect, useState } from 'react'
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2, KeyRound, LogOut } from 'lucide-react'
import Button from './Button'
import { apiFetch } from '../utils/api'
import { clearToken } from '../utils/authToken'

export default function MustChangePasswordListener() {
  const [visible, setVisible] = useState(false)
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = () => {
      setVisible(true)
      setSuccess(false)
      setError(null)
    }
    window.addEventListener('auth:must-change-password', handler)
    return () => window.removeEventListener('auth:must-change-password', handler)
  }, [])

  if (!visible) return null

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    if (error) setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (form.next.length < 8) {
      setError('New password must be at least 8 characters long.')
      return
    }

    if (form.current && form.next === form.current) {
      setError('New password cannot be the same as your temporary password.')
      return
    }

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

      setSuccess(true)
      setTimeout(() => {
        setVisible(false)
        setSuccess(false)
        setForm({ current: '', next: '', confirm: '' })
        window.location.reload()
      }, 1500)
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
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/70 backdrop-blur-md px-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface p-7 shadow-2xl border border-slate-200 dark:border-white/10">
        
        {/* Header Icon */}
        <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <KeyRound size={22} />
        </div>

        <h2 className="text-xl font-bold text-ink text-center tracking-tight">
          Change Your Password
        </h2>
        <p className="mt-1.5 text-xs text-muted text-center leading-relaxed max-w-xs mx-auto">
          Welcome! As a new user, you are required to replace your temporary password before accessing the system.
        </p>

        {success ? (
          <div className="mt-6 flex flex-col items-center justify-center py-6 text-center space-y-2">
            <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={26} />
            </div>
            <p className="text-sm font-semibold text-ink">Password Changed Successfully!</p>
            <p className="text-xs text-muted">Entering the system...</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-start gap-2.5 mt-4 p-3 rounded-lg bg-red-50/80 dark:bg-red-500/10 border border-red-200/80 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {/* Current Password */}
              <div>
                <label className="text-xs font-semibold text-muted block mb-1.5">
                  Current (Temporary) Password
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 px-3.5 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <Lock size={15} className="text-muted shrink-0" />
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    required
                    placeholder="Enter temporary password"
                    value={form.current}
                    onChange={handleChange('current')}
                    className="w-full text-sm bg-transparent outline-none border-0 text-ink placeholder:text-muted/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="text-muted hover:text-ink transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="text-xs font-semibold text-muted block mb-1.5">
                  New Password
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 px-3.5 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <Lock size={15} className="text-muted shrink-0" />
                  <input
                    type={showNext ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={form.next}
                    onChange={handleChange('next')}
                    className="w-full text-sm bg-transparent outline-none border-0 text-ink placeholder:text-muted/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNext((v) => !v)}
                    className="text-muted hover:text-ink transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showNext ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="text-xs font-semibold text-muted block mb-1.5">
                  Confirm New Password
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 px-3.5 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <Lock size={15} className="text-muted shrink-0" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required
                    placeholder="Repeat new password"
                    value={form.confirm}
                    onChange={handleChange('confirm')}
                    className="w-full text-sm bg-transparent outline-none border-0 text-ink placeholder:text-muted/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="text-muted hover:text-ink transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full py-2.5 font-medium shadow-sm"
                  disabled={loading}
                >
                  {loading ? 'Updating password…' : 'Set New Password & Continue'}
                </Button>
              </div>

              {/* Sign out fallback */}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted hover:text-ink text-center pt-1 transition-colors"
              >
                <LogOut size={13} />
                <span>Sign out instead</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}