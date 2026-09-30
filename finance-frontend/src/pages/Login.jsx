import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowUpRight, LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, Sun, Moon, ShieldCheck, ArrowLeft, ShieldOff, AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import Button from '../components/Button'
import OtpInput from '../components/OtpInput'
import { useAuth } from '../hooks/useAuth'
import { useCountdown, formatCountdown } from '../hooks/useCountdown'
import { useTheme } from '../context/ThemeContext'

function BrandMark() {
  return (
    <svg viewBox="100 65 280 235" fill="currentColor" className="h-9 w-9" aria-hidden="true">
      <path d="M235 83 155 281h49l17-42c7-18 18-35 29-51L235 83ZM265 83l-15 105c11 16 22 33 29 51l17 42h49L265 83Z" />
      <path d="m250 220-22 61h44l-22-61ZM120 267c55-57 128-86 205-84 23 1 32 7 35 29 2 20-2 37-5 56-2-34-15-63-50-67-65-8-127 20-185 66Z" />
    </svg>
  )
}

function AuthErrorMessage({ retryAfter, message }) {
  return (
    <span>
      <span role="alert">{retryAfter > 0 ? 'Too many attempts.' : message}</span>
      {retryAfter > 0 && <span aria-live="off"> Try again in {retryAfter}s.</span>}
    </span>
  )
}

export default function Login() {
  const {
    login, loading, error, retryAfter, accountLockedFor,
    twoFactorPending, verifyTwoFactor, resendTwoFactor, cancelTwoFactor,
  } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  // Set by SingleTabSessionGuard when another tab superseded this one's
  // login. Read here so the sign-in page can explain why the session ended.
  const authNotice = location.state?.authNotice
  const [form, setForm] = useState({ email: '', password: '', website: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  // Timestamp when the login form mounted  -  sent alongside the submit so
  // the backend honeypot middleware can reject submissions that arrive
  // faster than a human could realistically fill the form.
  const [formRenderedAt] = useState(() => Math.floor(Date.now() / 1000))

  // Seconds left before the emailed code expires; when it hits 0 we swap
  // the countdown for a Resend button instead of letting the user submit a
  // code the backend will reject as expired.
  const codeSecondsLeft = useCountdown(twoFactorPending?.codeExpiresAt)
  const codeExpired = codeSecondsLeft <= 0

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    // Guards against double-submission (fast double-click, or hitting
    // Enter again while a slow/hanging request from a flaky connection
    // is still in flight). The Button below is visually disabled while
    // loading too, but that disable only takes effect after a re-render,
    // which can lag behind a fast repeat click/keypress  -  this check
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

  // accountLockedFor runs up to 15 minutes  -  "127s" reads badly at that
  // length, so format as mm:ss once it's over a minute. The short
  // retryAfter (IP throttle, ~60s max) stays as plain seconds elsewhere.
  const formatLockout = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[0.95fr_1.05fr]">
      <aside className="relative hidden min-h-screen overflow-hidden bg-black p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-black"><BrandMark /></div>
          <div>
            <p className="text-lg font-bold tracking-[0.14em]">ALIBATON</p>
            <p className="mt-0.5 text-[10px] tracking-[0.16em] text-white/60">CONSTRUCTION INCORPORATED</p>
          </div>
        </div>

        <div className="relative z-10 my-auto py-16">
          <p className="mb-6 flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-primary">
            <span className="h-px w-8 bg-primary" /> FINANCIAL MANAGEMENT
          </p>
          <h2 className="max-w-lg text-5xl font-semibold leading-[1.1] tracking-tight xl:text-6xl">
            A clearer view.<br /><span className="text-primary">A stronger<br />business.</span>
          </h2>
          <p className="mt-6 max-w-sm text-sm leading-7 text-white/60">
            Bring your projects, payments, and people together. Stay in control of what moves your business forward.
          </p>

          <div className="relative mt-12 h-36 max-w-sm border-b border-white/15" aria-hidden="true">
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2].map((line) => <div key={line} className="border-t border-dashed border-white/10" />)}
            </div>
            <div className="relative flex h-full items-end gap-3 px-2">
              <div className="h-[24%] flex-1 rounded-t-lg bg-white/10" />
              <div className="h-[39%] flex-1 rounded-t-lg bg-white/15" />
              <div className="h-[34%] flex-1 rounded-t-lg bg-white/20" />
              <div className="h-[57%] flex-1 rounded-t-lg bg-primary/40" />
              <div className="h-[72%] flex-1 rounded-t-lg bg-primary/65" />
              <div className="relative h-full flex-1 rounded-t-lg bg-primary">
                <ArrowUpRight size={24} className="absolute left-1/2 top-4 -translate-x-1/2 text-black" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-white/50">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Built on precision. Driven by progress.
        </div>
        <div className="pointer-events-none absolute -right-48 -top-48 h-[480px] w-[480px] rounded-full border border-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-32 -top-32 h-[352px] w-[352px] rounded-full border border-white/5" aria-hidden="true" />
      </aside>

      <main className="flex min-h-screen flex-col px-6 py-6 sm:px-12 lg:px-16 xl:px-24">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 lg:invisible">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-black"><BrandMark /></div>
            <span className="text-sm font-bold tracking-[0.12em] text-ink">ALIBATON</span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:border-primary hover:text-primary-dark"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        <div className="mx-auto my-auto w-full max-w-sm py-14 sm:max-w-md">

        {!twoFactorPending ? (
          <>
            <p className="mb-3 text-[11px] font-bold tracking-[0.18em] text-primary-dark">WELCOME BACK</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Sign in to your<br />workspace.</h1>
            <p className="mt-4 text-sm leading-6 text-muted">
              Enter your credentials to manage your finances.
            </p>

            {accountLockedFor > 0 && (
              <div className="flex items-start gap-2.5 mt-5 px-4 py-3 rounded-xl bg-status-danger-bg border border-status-danger-border text-xs leading-5 text-status-danger">
                <Lock size={14} className="shrink-0 mt-0.5" />
                <span>
                  <span role="alert">Too many failed attempts. Your account is locked.</span>{' '}
                  <span aria-live="off">Try again in <span className="font-semibold tabular-nums">{formatLockout(accountLockedFor)}</span>.</span>
                </span>
              </div>
            )}

            {authNotice === 'signedOutElsewhere' && (
              <div role="status" className="flex items-start gap-2.5 mt-5 px-4 py-3 rounded-xl bg-status-info-bg border border-status-info-border text-xs leading-5 text-status-info">
                <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                <span>
                  You were signed out because you signed in from another tab
                  in this browser. Only one signed-in tab is allowed at a time.
                </span>
              </div>
            )}

            {authNotice === 'signedOutByServer' && (
              <div role="status" className="flex items-start gap-2.5 mt-5 px-4 py-3 rounded-xl bg-status-info-bg border border-status-info-border text-xs leading-5 text-status-info">
                <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                <span>
                  Your session was ended. This happens when you sign in on
                  another device, or when your session expires. If this wasn't
                  you, change your password.
                </span>
              </div>
            )}

            {error && !accountLockedFor && (() => {
              // Detect message type to show the right visual treatment
              const isWarning = error.toLowerCase().includes('remaining')
              const isInactive = error.toLowerCase().includes('not active')
              const isExpired = error.toLowerCase().includes('expired') || error.toLowerCase().includes('sign in again')

              if (isWarning) {
                return (
                  <div className="flex items-start gap-2.5 mt-5 px-4 py-3 rounded-xl bg-status-danger-bg border border-status-danger-border text-xs leading-5 text-status-danger">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <AuthErrorMessage retryAfter={retryAfter} message={error} />
                  </div>
                )
              }

              if (isInactive) {
                return (
                  <div role="alert" className="flex items-start gap-2.5 mt-5 px-4 py-3 rounded-xl bg-status-info-bg border border-status-info-border text-xs leading-5 text-status-info">
                    <ShieldOff size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )
              }

              // Generic wrong credentials / expired 2FA session / other
              return (
                <div className="flex items-start gap-2.5 mt-5 px-4 py-3 rounded-xl bg-status-danger-bg border border-status-danger-border text-xs leading-5 text-status-danger">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <AuthErrorMessage
                    retryAfter={retryAfter}
                    message={isExpired ? error : 'Incorrect email or password. Please try again.'}
                  />
                </div>
              )
            })()}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              {/*
                Honeypot field. Deliberately NOT type="hidden"  -  some bots
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
                <span className="text-xs font-semibold text-ink mb-2 block">Email address</span>
                <div className="flex items-center gap-3 rounded-xl border border-border
                  px-4 py-3.5 bg-bg
                  focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 focus-within:bg-surface
                  transition-all duration-150">
                  <Mail size={16} className="text-muted shrink-0" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={handleChange('email')}
                    placeholder="you@company.com"
                    className="min-w-0 w-full text-sm text-ink bg-transparent outline-none border-0 appearance-none focus:outline-none focus:ring-0 focus:shadow-none focus:border-0"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-ink mb-2 block">Password</span>
                <div className="flex items-center gap-3 rounded-xl border border-border
                  px-4 py-3.5 bg-bg
                  focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 focus-within:bg-surface
                  transition-all duration-150">
                  <Lock size={16} className="text-muted shrink-0" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={form.password}
                    onChange={handleChange('password')}
                    placeholder="••••••••"
                    className="min-w-0 w-full text-sm text-ink bg-transparent outline-none border-0 appearance-none focus:outline-none focus:ring-0 focus:shadow-none focus:border-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="text-muted hover:text-ink transition-colors duration-150 p-1 rounded"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <Button
                type="submit"
                variant="primary"
                size="md"
                icon={LogIn}
                className="mt-2 w-full h-12 rounded-xl text-sm font-semibold"
                loading={loading}
                loadingVariant="spinner"
                disabled={loading || retryAfter > 0 || accountLockedFor > 0}
              >
                {accountLockedFor > 0
                  ? `Locked  -  ${formatLockout(accountLockedFor)}`
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
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary-dark">
              <ShieldCheck size={23} />
            </div>
            <p className="mb-3 text-[11px] font-bold tracking-[0.18em] text-primary-dark">ONE MORE STEP</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Check your inbox.</h1>
            <p className="mt-4 text-sm leading-6 text-muted">
              We've sent a 6-digit code to{' '}
              <span className="font-medium text-ink">{twoFactorPending.maskedEmail}</span>.
            </p>

            {error && (
              <div className="flex items-center gap-2.5 mt-5 px-4 py-3 rounded-xl bg-status-danger-bg border border-status-danger-border text-xs leading-5 text-status-danger">
                <AlertCircle size={14} className="shrink-0" />
                <AuthErrorMessage retryAfter={retryAfter} message={error} />
              </div>
            )}
            {resendMessage && (
              <div role="status" className="mt-5 px-4 py-3 rounded-xl bg-status-success-bg border border-status-success-border text-xs leading-5 text-status-success">
                {resendMessage}
              </div>
            )}

            <form onSubmit={handleVerify} className="mt-8 space-y-5">
              <OtpInput
                length={6}
                value={code}
                onChange={setCode}
                onComplete={(completedCode) => verifyTwoFactor(completedCode)}
                disabled={loading || retryAfter > 0 || codeExpired}
                hasError={Boolean(error)}
                autoFocus
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full h-12 rounded-xl text-sm font-semibold"
                loading={loading}
                loadingVariant="spinner"
                disabled={loading || code.length !== 6 || retryAfter > 0 || codeExpired}
              >
                {retryAfter > 0
                  ? `Try again in ${retryAfter}s`
                  : loading
                    ? 'Verifying…'
                    : 'Verify & Sign In'}
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-xs font-medium text-muted hover:text-ink transition-colors duration-150"
                >
                  <ArrowLeft size={12} /> Back
                </button>
                {codeExpired ? (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-primary/25 hover:bg-primary/15 disabled:opacity-50 disabled:pointer-events-none transition-colors duration-150"
                  >
                    <RefreshCw size={13} /> Resend code
                  </button>
                ) : (
                  <span className="text-xs text-muted">
                    Code expires in{' '}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold tabular-nums transition-colors duration-300 ${
                        codeSecondsLeft <= 30
                          ? 'border-status-warning-border bg-status-warning-bg text-status-warning'
                          : 'border-border bg-bg text-ink'
                      }`}
                    >
                      <Clock size={11} />
                      {formatCountdown(codeSecondsLeft)}
                    </span>
                  </span>
                )}
              </div>
            </form>
          </>
        )}
          <div className="mt-8 flex items-center gap-2 border-t border-border pt-6 text-xs text-muted">
            <Lock size={13} className="shrink-0" /> Authorized personnel only.
          </div>
        </div>
        <p className="text-center text-[11px] text-muted">Alibaton Construction Incorporated</p>
      </main>
    </div>
  )
}
