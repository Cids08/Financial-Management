import { useState } from 'react'
import { LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, Sun, Moon } from 'lucide-react'
import Button from '../components/Button'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../context/ThemeContext'
import logo from '../assets/logo.svg'

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
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative blurred blobs — glassmorphism needs something behind
          the glass to actually blur, otherwise backdrop-blur is invisible
          against a flat background. */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 w-md h-112 rounded-full bg-primary-dark/30 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-amber-300/20 dark:bg-amber-500/10 blur-3xl" />

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg
          border border-white/40 dark:border-white/10 bg-white/30 dark:bg-white/5 backdrop-blur-md
          text-muted hover:text-ink transition-colors duration-150"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/40 dark:border-white/10
        bg-white/40 dark:bg-surface/30 backdrop-blur-xl shadow-2xl shadow-black/10 p-8">
        <div className="mx-auto mb-4 w-40 h-40 rounded-2xl overflow-hidden ring-1 ring-white/50 dark:ring-white/10 shadow-lg">
          <img src={logo} alt="Alibaton Construction Incorporated" className="h-full w-full object-cover" />
        </div>

        <h1 className="text-lg font-bold text-ink text-center">Sign in to your account</h1>
        <p className="mt-1.5 text-sm text-muted text-center">
          Enter your credentials to access the Financial Management System.
        </p>

        {error && (
          <div className="flex items-center gap-2 mt-5 px-3 py-2 rounded-lg bg-red-50/70 border border-red-200/70 text-xs text-red-600 backdrop-blur-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted mb-1 block">Email</span>
            <div className="flex items-center gap-2 rounded-lg border border-white/50 dark:border-white/10
              px-3 py-2 bg-white/30 dark:bg-white/5 backdrop-blur-sm
              focus-within:border-primary focus-within:bg-white/60 dark:focus-within:bg-white/10
              transition-colors duration-150">
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
            <div className="flex items-center gap-2 rounded-lg border border-white/50 dark:border-white/10
              px-3 py-2 bg-white/30 dark:bg-white/5 backdrop-blur-sm
              focus-within:border-primary focus-within:bg-white/60 dark:focus-within:bg-white/10
              transition-colors duration-150">
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