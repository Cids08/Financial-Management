import {
  LayoutDashboard,
  Bell,
  UserCog,
  ShieldCheck,
  Database,
  Users,
  Truck,
  UserCheck,
  Building2,
  Wallet,
  Boxes,
  Tags,
  Briefcase,
  ArrowLeftRight,
  FileText,
  HandCoins,
  FileMinus,
  Send,
  PiggyBank,
  Receipt,
  Landmark,
  BookOpen,
  BookText,
  Network,
  LineChart,
  TrendingUp,
  Sparkles,
  FileBarChart,
  ClipboardList,
  Settings,
  LogOut,
} from 'lucide-react'

// Workflow order. Permissions and route paths stay attached to each leaf.
export const menuData = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'notifications', label: 'Notifications', icon: Bell, path: '/notifications' },
  { id: 'receivables', label: 'Receivables & Collections', icon: HandCoins, children: [
      { id: 'ar', label: 'Accounts Receivable', icon: FileText, path: '/transactions/receivable', permission: 'ar.manage' },
      { id: 'collections', label: 'Collections', icon: HandCoins, path: '/transactions/collections', permission: 'collections.view' },
      { id: 'collectors', label: 'Collectors', icon: UserCheck, path: '/master-data/collectors', permission: 'collectors.view' },
  ] },
  { id: 'payables', label: 'Payables & Payments', icon: Wallet, children: [
      { id: 'ap', label: 'Accounts Payable', icon: FileMinus, path: '/transactions/payable', permission: 'ap.view' },
      { id: 'disbursements', label: 'Disbursements', icon: Send, path: '/transactions/disbursements', permission: 'disbursements.view' },
      { id: 'expenses', label: 'Expenses', icon: Receipt, path: '/transactions/expenses', permission: 'expenses.view' },
  ] },
  { id: 'accounting', label: 'Accounting & Planning', icon: BookOpen, children: [
      { id: 'general-ledger', label: 'General Ledger', icon: BookText, path: '/accounting/general-ledger', permission: 'general-ledger.view' },
      { id: 'chart-of-accounts', label: 'Chart of Accounts', icon: Network, path: '/master-data/chart-of-accounts', permission: 'chart-of-accounts.manage' },
      { id: 'budgets', label: 'Budgets', icon: PiggyBank, path: '/transactions/budgets', permission: 'budgets.view' },
      { id: 'tax', label: 'Tax Obligations', icon: Landmark, path: '/transactions/tax-obligations', permission: 'tax.view' },
  ] },
  { id: 'insights', label: 'Reports & Insights', icon: FileBarChart, children: [
      { id: 'reports', label: 'Reports', icon: FileBarChart, path: '/reports', permission: 'reports.view' },
      { id: 'forecasting', label: 'Financial Forecasting', icon: TrendingUp, path: '/analytics/forecasting', permission: 'forecasting.view' },
      { id: 'ai', label: 'AI Advisor & Recommendations', icon: Sparkles, path: '/analytics/ai-recommendations', permission: 'ai.view' },
  ] },
  { id: 'master-data', label: 'Master Data', icon: Database, children: [
      { id: 'customers', label: 'Customers', icon: Users, path: '/master-data/customers', permission: 'customers.view' },
      { id: 'suppliers', label: 'Suppliers', icon: Truck, path: '/master-data/suppliers', permission: 'suppliers.view' },
      { id: 'cash-accounts', label: 'Cash Accounts', icon: Wallet, path: '/master-data/cash-accounts', permission: 'cash-accounts.manage' },
      { id: 'fixed-assets', label: 'Fixed Assets', icon: Boxes, path: '/master-data/fixed-assets', permission: 'fixed-assets.view' },
      { id: 'departments', label: 'Departments', icon: Building2, path: '/master-data/departments', permission: 'departments.manage' },
      { id: 'expense-categories', label: 'Expense Categories', icon: Tags, path: '/master-data/expense-categories', permission: 'expense-categories.manage' },
      { id: 'titles', label: 'Titles', icon: Briefcase, path: '/master-data/titles', permission: 'users.view' },
  ] },
  { id: 'administration', label: 'Administration', icon: UserCog, children: [
      { id: 'users', label: 'Users', icon: Users, path: '/user-management/users', permission: 'users.view' },
      { id: 'roles', label: 'Roles', icon: ShieldCheck, path: '/user-management/roles', permission: 'roles.view' },
      { id: 'audit-logs', label: 'Audit Logs', icon: ClipboardList, path: '/system/audit-logs', permission: 'audit-logs.view' },
  ] },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings', permission: 'settings.manage' },
  { id: 'logout', label: 'Logout', icon: LogOut, path: '/logout', isLogout: true },
]

// Collectors work from their assigned-invoice queue and personal collector profile.
// Filtering below still requires the same module permissions as the full menu.
export const collectorMenuData = [
  menuData[0], menuData[1],
  { ...menuData[2].children.find(item => item.id === 'collections'), label: 'My Collections' },
  { ...menuData[2].children.find(item => item.id === 'collectors'), label: 'My Collector Profile' },
  menuData.find(item => item.id === 'logout'),
]
