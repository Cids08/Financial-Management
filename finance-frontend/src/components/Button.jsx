import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

const variantStyles = {
  primary: `bg-primary text-[#111827] shadow-sm
    hover:bg-primary-dark hover:-translate-y-0.5 hover:shadow-md
    active:translate-y-0 active:shadow-sm`,
  secondary: `bg-surface text-ink border border-border shadow-sm
    hover:bg-bg hover:-translate-y-0.5 hover:shadow-md
    active:translate-y-0 active:shadow-sm active:bg-border/50`,
  ghost: 'bg-transparent text-muted hover:bg-bg hover:text-ink',
  dark: `bg-slate-900 text-white shadow-sm
    hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-md
    active:translate-y-0 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white`,
  danger: `bg-red-600 text-white shadow-sm
    hover:bg-red-700 hover:-translate-y-0.5 hover:shadow-md
    active:translate-y-0 active:bg-red-800`,
  outline: `bg-transparent text-primary-dark border border-primary/40
    hover:bg-primary/10 hover:border-primary/70 active:bg-primary/15`,
}

const sizeStyles = {
  xs: 'text-xs px-2.5 py-1 gap-1',
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-sm px-5 py-2.5 gap-2',
}

// Square, label-less buttons (e.g. a lone icon in a table row) — pairs well
// with the Tooltip component to communicate what the icon does.
const iconOnlySizeStyles = {
  xs: 'p-1',
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-2.5',
}

const iconPixelSize = {
  xs: 14,
  sm: 15,
  md: 16,
  lg: 18,
}

const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    icon: Icon,
    iconPosition = 'left',
    iconOnly = false,
    loading = false,
    fullWidth = false,
    disabled = false,
    type = 'button',
    className = '',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading
  const iconSize = iconPixelSize[size]

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-semibold rounded-lg
        transition-all duration-150 ease-in-out-smooth
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:hover:translate-y-0
        active:scale-[0.98]
        ${fullWidth ? 'w-full' : ''}
        ${variantStyles[variant]}
        ${iconOnly ? iconOnlySizeStyles[size] : sizeStyles[size]}
        ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 size={iconSize} strokeWidth={2} className="animate-spin" />
      ) : (
        <>
          {Icon && iconPosition === 'left' && (
            <Icon size={iconSize} strokeWidth={2.25} className="shrink-0" />
          )}
          {!iconOnly && children}
          {Icon && iconPosition === 'right' && (
            <Icon size={iconSize} strokeWidth={2.25} className="shrink-0" />
          )}
        </>
      )}
    </button>
  )
})

export default Button