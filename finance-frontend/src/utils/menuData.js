import {
  LayoutDashboard,
  UserCog,
  ShieldCheck,
  Database,
  Users,
  Truck,
  UserCheck,
  Building2,
  Wallet,
  Boxes,
  ArrowLeftRight,
  FileText,
  HandCoins,
  FileMinus,
  Send,
  Receipt,
  Landmark,
  BookOpen,
  BookText,
  LineChart,
  TrendingUp,
  Sparkles,
  FileBarChart,
  Settings,
  LogOut,
} from 'lucide-react'

// Each item: id, label, icon, path, and optional children for nested menus.
// `permission` is checked against a flat permission_name array (see
// src/utils/permissions.js + src/context/PermissionsContext.jsx, sourced
// from GET /api/me/permissions) before this data ever reaches the
// sidebar — items with no `permission` field are always visible to any
// authenticated user.
//
// Permission slugs below match routes/api.php exactly as of the current
// RolesAndPermissionsSeeder.php ("v3" naming): hyphenated for
// cash-accounts/fixed-assets/expense-categories/service-areas/
// general-ledger, and SHORT forms for tax (not tax_obligations) and ai
// (not ai_decision_support). If routes/api.php changes again, re-derive
// this list from it directly — that's the only naming drift that's
// actually reliable in this project's history.
export const menuData = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    permission: 'dashboard.view',
    // Every role (including staff/collector) has dashboard.view — this
    // just keeps the sidebar item consistent with routes/api.php's gate
    // on GET /dashboard, not a role restriction. The CONTENT shown at
    // /dashboard differs by role — that's DashboardController's job on
    // the backend, not something this menu entry controls.
  },
  {
    id: 'user-management',
    label: 'User Management',
    icon: UserCog,
    children: [
      { id: 'users', label: 'Users', icon: Users, path: '/user-management/users', permission: 'users.view' },
      { id: 'roles', label: 'Roles', icon: ShieldCheck, path: '/user-management/roles', permission: 'roles.view' },
    ],
  },
  {
    id: 'master-data',
    label: 'Master Data',
    icon: Database,
    children: [
      { id: 'customers', label: 'Customers', icon: Users, path: '/master-data/customers', permission: 'customers.view' },
      { id: 'suppliers', label: 'Suppliers', icon: Truck, path: '/master-data/suppliers', permission: 'suppliers.view' },
      { id: 'collectors', label: 'Collectors', icon: UserCheck, path: '/master-data/collectors', permission: 'collectors.view' },
      { id: 'departments', label: 'Departments', icon: Building2, path: '/master-data/departments', permission: 'departments.view' },
      { id: 'cash-accounts', label: 'Cash Accounts', icon: Wallet, path: '/master-data/cash-accounts', permission: 'cash-accounts.view' },
      { id: 'fixed-assets', label: 'Fixed Assets', icon: Boxes, path: '/master-data/fixed-assets', permission: 'fixed-assets.view' },
    ],
  },
  {
    id: 'financial-transactions',
    label: 'Financial Transactions',
    icon: ArrowLeftRight,
    children: [
      { id: 'ar', label: 'Accounts Receivable', icon: FileText, path: '/transactions/receivable', permission: 'ar.view' },
      { id: 'collections', label: 'Collections', icon: HandCoins, path: '/transactions/collections', permission: 'collections.view' },
      { id: 'ap', label: 'Accounts Payable', icon: FileMinus, path: '/transactions/payable', permission: 'ap.view' },
      // Disbursements covers Budgets too (one combined module, permission
      // = disbursements.view — reverted from a brief split back to
      // combined). Route group itself isn't built yet.
      { id: 'disbursements', label: 'Disbursements', icon: Send, path: '/transactions/disbursements', permission: 'disbursements.view' },
      { id: 'expenses', label: 'Expenses', icon: Receipt, path: '/transactions/expenses', permission: 'expenses.view' },
      { id: 'tax', label: 'Tax Obligations', icon: Landmark, path: '/transactions/tax-obligations', permission: 'tax.view' },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting',
    icon: BookOpen,
    children: [
      { id: 'general-ledger', label: 'General Ledger', icon: BookText, path: '/accounting/general-ledger', permission: 'general-ledger.view' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: LineChart,
    children: [
      { id: 'forecasting', label: 'Financial Forecasting', icon: TrendingUp, path: '/analytics/forecasting', permission: 'forecasting.view' },
      { id: 'ai', label: 'AI Financial Recommendations', icon: Sparkles, path: '/analytics/ai-recommendations', permission: 'ai.view' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: FileBarChart,
    path: '/reports',
    permission: 'reports.view',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/settings',
    // No `permission` field, on purpose — Settings is "my account"
    // (password, 2FA, sessions, activity, deactivate), not a module.
    // It needs to be visible to every authenticated user the same way
    // Logout is, regardless of what's actually seeded for settings.view
    // in the DB for any given role. The only thing genuinely gated is
    // the Company Branding EDIT form *inside* the page, which checks
    // settings.manage directly in Settings.jsx — that's the correct
    // place for that restriction, not this sidebar entry.
  },
  {
    id: 'logout',
    label: 'Logout',
    icon: LogOut,
    path: '/logout',
    isLogout: true,
  },
]