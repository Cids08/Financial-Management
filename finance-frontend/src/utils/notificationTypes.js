import { Bell, Wallet, Receipt, PiggyBank, TrendingUp, Sparkles, CheckCircle2, AlertTriangle, Info } from 'lucide-react'

// Mirrors the notifications table's type CHECK constraint, which only
// allows: 'Info', 'Success', 'Warning', 'Error'.
//
// The DB type column is severity-based, not module-based — so the old
// module-specific keys (collection, expense, disbursement, budget_over,
// budget_warning) can never match anything and have been removed.
//
// Routing by severity is coarse — Success goes to /transactions/collections
// as the most common success notification, Warning goes to /transactions/budgets.
// If you later need per-module routing, add a separate `module` column to
// the notifications table (not constrained by a CHECK) and route on that
// instead of `type`.
//
// The remaining module-specific keys (receivable, payable, budget,
// forecast, ai_recommendation) are kept for any legacy notifications
// already stored in the DB with those type values.
export const NOTIFICATION_TYPE_META = {
  // Severity types — matches the DB CHECK constraint
  Success: {
    icon:  CheckCircle2,
    route: '/transactions/collections',
    label: 'Success',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg:    'bg-emerald-50 dark:bg-emerald-500/10',
  },
  Warning: {
    icon:  AlertTriangle,
    route: '/transactions/budgets',
    label: 'Warning',
    color: 'text-amber-600 dark:text-amber-400',
    bg:    'bg-amber-50 dark:bg-amber-500/10',
  },
  Info: {
    icon:  Info,
    route: '/reports',
    label: 'Info',
    color: 'text-blue-600 dark:text-blue-400',
    bg:    'bg-blue-50 dark:bg-blue-500/10',
  },
  Error: {
    icon:  Bell,
    route: '/reports',
    label: 'Error',
    color: 'text-red-600 dark:text-red-400',
    bg:    'bg-red-50 dark:bg-red-500/10',
  },

  // Legacy module-specific keys — kept for notifications already in the DB.
  // These will never be written by new code since the DB constraint blocks them.
  receivable: {
    icon:  Wallet,
    route: '/transactions/receivable',
    label: 'Accounts Receivable',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg:    'bg-emerald-50 dark:bg-emerald-500/10',
  },
  payable: {
    icon:  Receipt,
    route: '/transactions/payable',
    label: 'Accounts Payable',
    color: 'text-amber-600 dark:text-amber-400',
    bg:    'bg-amber-50 dark:bg-amber-500/10',
  },
  budget: {
    icon:  PiggyBank,
    route: '/transactions/budgets',
    label: 'Budgets',
    color: 'text-blue-600 dark:text-blue-400',
    bg:    'bg-blue-50 dark:bg-blue-500/10',
  },
  forecast: {
    icon:  TrendingUp,
    route: '/analytics/forecasting',
    label: 'Forecasting',
    color: 'text-violet-600 dark:text-violet-400',
    bg:    'bg-violet-50 dark:bg-violet-500/10',
  },
  ai_recommendation: {
    icon:  Sparkles,
    route: '/analytics/ai-recommendations',
    label: 'AI Recommendation',
    color: 'text-cyan-600 dark:text-cyan-400',
    bg:    'bg-cyan-50 dark:bg-cyan-500/10',
  },
}

export const DEFAULT_NOTIFICATION_TYPE_META = {
  icon:  Bell,
  route: '/reports',
  label: 'General',
  color: 'text-slate-600 dark:text-slate-400',
  bg:    'bg-slate-100 dark:bg-slate-800',
}

export function notificationTypeMeta(type, item = null) {
  const base = NOTIFICATION_TYPE_META[type] ?? DEFAULT_NOTIFICATION_TYPE_META

  if (item && (item.title || item.message)) {
    const text = `${item.title ?? ''} ${item.message ?? ''}`.toLowerCase()

    if (text.includes('collection') || text.includes('collected') || text.includes('receipt') || text.includes('invoice')) {
      return {
        ...base,
        route: '/transactions/collections',
      }
    }
    if (text.includes('expense')) {
      return {
        ...base,
        route: '/transactions/expenses',
      }
    }
    if (text.includes('disbursement')) {
      return {
        ...base,
        route: '/transactions/disbursements',
      }
    }
    if (text.includes('budget')) {
      return {
        ...base,
        route: '/transactions/budgets',
      }
    }
    if (text.includes('payable') || text.includes('bill') || text.includes('supplier')) {
      return {
        ...base,
        route: '/transactions/payable',
      }
    }
    if (text.includes('receivable')) {
      return {
        ...base,
        route: '/transactions/receivable',
      }
    }
    if (text.includes('forecast')) {
      return {
        ...base,
        route: '/analytics/forecasting',
      }
    }
  }

  return base
}