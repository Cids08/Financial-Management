import { useState } from 'react'
import { LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, ShieldCheck, Sun, Moon } from 'lucide-react'
import Button from '../components/Button'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../context/ThemeContext'

export default function Login() {
  const { login, loading, error } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [form, setForm] = useState({ email: '', password: '', remember: false })
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = (field) => (e) =>
    setForm((f) => ({
      ...f,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  const handleSubmit = (e) => {
    e.preventDefault()
    login(form)
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 relative">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-ink hover:bg-bg transition-colors duration-150"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="w-full max-w-sm rounded-xl border border-border bg-surface shadow-card p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 text-primary-dark">
          <ShieldCheck size={26} />
        </div>

        <h1 className="text-lg font-bold text-ink text-center">Sign in to your account</h1>
        <p className="mt-1.5 text-sm text-muted text-center">
          Enter your credentials to access the Financial Management System.
        </p>

        {error && (
          <div className="flex items-center gap-2 mt-5 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted mb-1 block">Email</span>
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-bg focus-within:border-primary focus-within:bg-surface transition-colors duration-150">
              <Mail size={15} className="text-muted shrink-0" />
              <input
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={handleChange('email')}
                placeholder="you@company.com"
                className="w-full text-sm text-ink bg-transparent outline-none border-0 appearance-none focus:outline-none focus:ring-0 focus:shadow-none focus:border-0"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted mb-1 block">Password</span>
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-bg focus-within:border-primary focus-within:bg-surface transition-colors duration-150">
              <Lock size={15} className="text-muted shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange('password')}
                placeholder="••••••••"
                className="w-full text-sm text-ink bg-transparent outline-none border-0 appearance-none focus:outline-none focus:ring-0 focus:shadow-none focus:border-0"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="text-muted hover:text-ink transition-colors duration-150"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>

          <div className="flex items-center justify-between text-xs">
            <a href="/forgot-password" className="text-primary-dark hover:underline">
              Forgot password?
            </a>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            icon={LogIn}
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  )
}