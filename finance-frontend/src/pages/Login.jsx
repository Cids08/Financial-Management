import { useState } from 'react'
import { LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, Sun, Moon, ShieldCheck, ArrowLeft } from 'lucide-react'
import Button from '../components/Button'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../context/ThemeContext'
import logo from '../assets/logo.svg'
import logoDark from '../assets/logo-dark.svg'
import loginBg from '../assets/login-bg.jpg'

export default function Login() {
  const {
    login, loading, error, retryAfter, accountLockedFor,
    twoFactorPending, verifyTwoFactor, resendTwoFactor, cancelTwoFactor,
  } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [form, setForm] = useState({ email: '', password: '', remember: false, website: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  // Timestamp when the login form mounted — sent alongside the submit so
  // the backend honeypot middleware can reject submissions that arrive
  // faster than a human could realistically fill the form.
  const [formRenderedAt] = useState(() => Math.floor(Date.now() / 1000))

  const handleChange = (field) => (e) =>
    setForm((f) => ({
      ...f,
      [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  const handleSubmit = (e) => {
    e.preventDefault()
    // Guards against double-submission (fast double-click, or hitting
    // Enter again while a slow/hanging request from a flaky connection
    // is still in flight). The Button below is visually disabled while
    // loading too, but that disable only takes effect after a re-render,
    // which can lag behind a fast repeat click/keypress — this check
    // closes that gap at the handler level. useAuth's login() also
    // guards against stale in-flight requests independently, so even if
    // a duplicate slips through here, an old response can't clobber a
    // newer one's state.
    if (loading) return
    login({ ...form, form_rendered_at: formRenderedAt })
  }

  const handleVerify = (e) => {
    e.preventDefault()
    verifyTwoFactor(code)
  }

  const handleResend = async () => {
    setResendMessage('')
    setCode('')
    const result = await resendTwoFactor()
    if (result.success) {
      setResendMessage('A new code has been sent.')
      setTimeout(() => setResendMessage(''), 3000)
    }
  }

  const handleBack = () => {
    setCode('')
    setResendMessage('')
    cancelTwoFactor()
  }

  // accountLockedFor runs up to 15 minutes — "127s" reads badly at that
  // length, so format as mm:ss once it's over a minute. The short
  // retryAfter (IP throttle, ~60s max) stays as plain seconds elsewhere.
  const formatLockout = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Company cover photo — a wide banner with logo/tagline/contact
          details baked into the bottom third, so object-position is
          pushed toward the top to keep the sky + equipment cluster in
          frame and crop out that dense text band instead of squashing
          the whole banner in. */}
      <div
        className="absolute inset-0 bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${loginBg})`, backgroundPosition: 'center 15%' }}
        aria-hidden="true"
      />
      {/* Scrim over the photo so the frosted-glass card keeps enough
          contrast regardless of theme or how bright the underlying photo
          is — a hazy sky can wash out light-mode text just as easily as
          a dark photo can bury dark-mode text, so this needs to be dark
          enough to hold contrast either way, not tuned to one specific
          photo's brightness. */}
      <div className="absolute inset-0 bg-black/55 dark:bg-black/70" aria-hidden="true" />

      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-16 w-md h-112 rounded-full bg-primary-dark/25 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-amber-300/15 dark:bg-amber-500/10 blur-3xl" />

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg
          border border-white/40 dark:border-white/10 bg-white/70 dark:bg-white/10 backdrop-blur-md
          text-ink hover:text-primary-dark transition-colors duration-150"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Card opacity bumped up from the original /40·/30 — against a
          photo background (vs. a flat gradient) the card needs to hold
          its own contrast regardless of what's directly behind it, so
          it's less see-through than a typical glass card would be. */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/40 dark:border-white/10
        bg-white/70 dark:bg-surface/70 backdrop-blur-xl shadow-2xl shadow-black/20 p-8">
        <div className="mx-auto mb-4 w-40 h-40 rounded-2xl overflow-hidden ring-1 ring-white/50 dark:ring-white/10 shadow-lg">
          <img src={theme === 'dark' ? logoDark : logo} alt="Alibaton Construction Incorporated" className="h-full w-full object-cover" />
        </div>

        {!twoFactorPending ? (
          <>
            <h1 className="text-lg font-bold text-ink text-center">Sign in to your account</h1>
            <p className="mt-1.5 text-sm text-muted text-center">
              Enter your credentials to access the Financial Management System.
            </p>

            {accountLockedFor > 0 && (
              <div className="flex items-start gap-2 mt-5 px-3 py-2 rounded-lg bg-amber-50/70 border border-amber-200/70 text-xs text-amber-700 backdrop-blur-sm dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <Lock size={14} className="shrink-0 mt-0.5" />
                <span>
                  Too many failed attempts. Your account is locked for{' '}
                  <span className="font-semibold tabular-nums">{formatLockout(accountLockedFor)}</span>.
                </span>
              </div>
            )}

            {error && !accountLockedFor && (
              <div className="flex items-center gap-2 mt-5 px-3 py-2 rounded-lg bg-red-50/70 border border-red-200/70 text-xs text-red-600 backdrop-blur-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                <AlertCircle size={14} className="shrink-0" />
                <span>
                  {retryAfter > 0
                    ? `Too many attempts. Try again in ${retryAfter}s.`
                    : error}
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/*
                Honeypot field. Deliberately NOT type="hidden" — some bots
                skip those. Hidden via off-screen positioning instead, and
                excluded from tab order / screen readers so real users and
                assistive tech never encounter it.
              */}
              <div
                className="absolute left-[-9999px] w-px h-px overflow-hidden"
                aria-hidden="true"
              >
                <label htmlFor="website">Website</label>
                <input
                  type="text"
                  id="website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={handleChange('website')}
                />
              </div>

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
                disabled={loading || retryAfter > 0 || accountLockedFor > 0}
              >
                {accountLockedFor > 0
                  ? `Locked — ${formatLockout(accountLockedFor)}`
                  : retryAfter > 0
                    ? `Try again in ${retryAfter}s`
                    : loading
                      ? 'Signing in…'
                      : 'Sign In'}
              </Button>
            </form>
          </>
        ) : (
          <>
            <div className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
              <ShieldCheck size={17} />
            </div>
            <h1 className="text-lg font-bold text-ink text-center">Enter verification code</h1>
            <p className="mt-1.5 text-sm text-muted text-center">
              We've sent a 6-digit code to{' '}
              <span className="font-medium text-ink">{twoFactorPending.maskedEmail}</span>.
            </p>

            {error && (
              <div className="flex items-center gap-2 mt-5 px-3 py-2 rounded-lg bg-red-50/70 border border-red-200/70 text-xs text-red-600 backdrop-blur-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                <AlertCircle size={14} className="shrink-0" />
                <span>
                  {retryAfter > 0
                    ? `Too many attempts. Try again in ${retryAfter}s.`
                    : error}
                </span>
              </div>
            )}
            {resendMessage && (
              <div className="mt-5 px-3 py-2 rounded-lg bg-emerald-50/70 border border-emerald-200/70 text-xs text-emerald-700 backdrop-blur-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                {resendMessage}
              </div>
            )}

            <form onSubmit={handleVerify} className="mt-6 space-y-4">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full h-11 rounded-lg border border-white/50 dark:border-white/10
                  bg-white/30 dark:bg-white/5 backdrop-blur-sm text-center font-mono text-lg tracking-[0.4em]
                  text-ink focus:outline-none focus:border-primary focus:bg-white/60 dark:focus:bg-white/10
                  transition-colors duration-150"
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                disabled={loading || code.length !== 6 || retryAfter > 0}
              >
                {retryAfter > 0
                  ? `Try again in ${retryAfter}s`
                  : loading
                    ? 'Verifying…'
                    : 'Verify & Sign In'}
              </Button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink transition-colors duration-150"
                >
                  <ArrowLeft size={12} /> Back
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="text-xs font-medium text-primary-dark hover:underline disabled:opacity-50 disabled:pointer-events-none"
                >
                  Didn't get a code? Resend
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}