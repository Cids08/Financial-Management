import { Bell, Wallet, Receipt, PiggyBank, TrendingUp, Sparkles } from 'lucide-react'

// Mirrors DashboardService::routeForNotificationType() on the backend.
// Extracted into its own file so the header bell (Notification.jsx) and
// the full Notifications page don't each keep their own copy — that
// duplication was flagged earlier and was already a real risk (a new
// notification `type` only getting added in one of the two places).
//
// If the /notifications and /dashboard endpoints ever start returning a
// precomputed `route` per notification, prefer that over this local map
// and delete it instead of keeping both in sync by hand.
export const NOTIFICATION_TYPE_META = {
  receivable: { icon: Wallet, route: '/transactions/receivable', label: 'Accounts Receivable', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  payable: { icon: Receipt, route: '/transactions/payable', label: 'Accounts Payable', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
  budget: { icon: PiggyBank, route: '/transactions/budgets', label: 'Budgets', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
  forecast: { icon: TrendingUp, route: '/analytics/forecasting', label: 'Forecasting', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10' },
  ai_recommendation: { icon: Sparkles, route: '/analytics/ai-recommendations', label: 'AI Recommendation', color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-500/10' },
}

export const DEFAULT_NOTIFICATION_TYPE_META = {
  icon: Bell,
  route: '/reports',
  label: 'General',
  color: 'text-slate-600 dark:text-slate-400',
  bg: 'bg-slate-100 dark:bg-slate-800',
}

export function notificationTypeMeta(type) {
  return NOTIFICATION_TYPE_META[type] ?? DEFAULT_NOTIFICATION_TYPE_META
}