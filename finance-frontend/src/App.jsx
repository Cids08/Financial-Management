import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import RequirePermission from './components/RequirePermission'
import AuthExpiredListener from './components/AuthExpiredListener'
import ForcedLogoutListener from './components/ForcedLogoutListener'
import { CompanyProvider } from './context/CompanyContext'
import DashboardLayout from './layouts/DashboardLayout'
import DashboardRouter from './pages/DashboardRouter'
import PlaceholderPage from './pages/PlaceholderPage'
import Profile from './pages/Profile'
import Users from './pages/Users'
import Roles from './pages/Roles'
import Customers from './pages/Customers'
import Suppliers from './pages/Suppliers'
import Collectors from './pages/Collectors'
import Departments from './pages/Departments'
import CashAccounts from './pages/CashAccounts'
import FixedAssets from './pages/FixedAssets'
import AccountsReceivable from './pages/AccountsReceivable'
import Collections from './pages/Collections'
import AccountsPayable from './pages/AccountsPayable'
import Disbursements from './pages/Disbursements'
import Budgets from './pages/Budgets'
import Expenses from './pages/Expenses'
import TaxObligations from './pages/Taxobligations'
import Generalledger from './pages/Generalledger'
import FinancialForecasting from './pages/FinancialForecasting'
import AIRecommendations from './pages/AIRecommendations'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Logout from './pages/Logout'
import Login from './pages/Login'

export default function App() {
  return (
    <>
      <AuthExpiredListener />
      <Routes>
      {/* Standalone — no sidebar/header/footer chrome */}
      {/* Login is the landing page */}
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/logout" element={<Logout />} />

      {/* Everything below requires an authenticated session.
          CompanyProvider is scoped here — inside ProtectedRoute — rather
          than around the whole app, because it fetches GET /api/settings
          on mount, which requires auth:sanctum. Wrapping the whole router
          meant that fetch fired on the public /login screen too, before
          any token existed, producing a 401 on page load every time. */}
      <Route element={<ProtectedRoute />}>
        <Route element={
          <CompanyProvider>
            {/* ForcedLogoutListener needs a valid token to subscribe to
                this user's private channel, so it's mounted here rather
                than alongside AuthExpiredListener above — that one has to
                run even on the public /login screen, this one can't. */}
            <ForcedLogoutListener />
            <DashboardLayout />
          </CompanyProvider>
        }>
          {/* Open to every authenticated user — DashboardRouter picks the
              right component per role (Collector/Staff get their own
              simplified view, Admin/Super Admin get the full dashboard).
              No permission gate here, matching that the module isn't
              "Admin-only", it's "role-aware". */}
          <Route path="/dashboard" element={<DashboardRouter />} />

          {/* User Management */}
          <Route path="/user-management/users" element={
            <RequirePermission permission="users.view">
              <Users crumbs={['User Management', 'Users']} />
            </RequirePermission>
          } />
          <Route path="/user-management/roles" element={
            <RequirePermission permission="roles.view">
              <Roles crumbs={['User Management', 'Roles']} />
            </RequirePermission>
          } />

          {/* Master Data */}
          <Route path="/master-data/customers" element={
            <RequirePermission permission="customers.view">
              <Customers crumbs={['Master Data', 'Customers']} />
            </RequirePermission>
          } />
          <Route path="/master-data/suppliers" element={
            <RequirePermission permission="suppliers.view">
              <Suppliers crumbs={['Master Data', 'Suppliers']} />
            </RequirePermission>
          } />
          <Route path="/master-data/collectors" element={
            <RequirePermission permission="collectors.view">
              <Collectors crumbs={['Master Data', 'Collectors']} />
            </RequirePermission>
          } />
          <Route path="/master-data/departments" element={
            <RequirePermission permission="departments.view">
              <Departments crumbs={['Master Data', 'Departments']} />
            </RequirePermission>
          } />
          <Route path="/master-data/cash-accounts" element={
            <RequirePermission permission="cash-accounts.view">
              <CashAccounts crumbs={['Master Data', 'Cash Accounts']} />
            </RequirePermission>
          } />
          <Route path="/master-data/fixed-assets" element={
            <RequirePermission permission="fixed-assets.view">
              <FixedAssets crumbs={['Master Data', 'Fixed Assets']} />
            </RequirePermission>
          } />

          {/* Financial Transactions */}
          <Route path="/transactions/receivable" element={
            <RequirePermission permission="ar.view">
              <AccountsReceivable crumbs={['Financial Transactions', 'Accounts Receivable']} />
            </RequirePermission>
          } />
          <Route path="/transactions/collections" element={
            <RequirePermission permission="collections.view">
              <Collections crumbs={['Financial Transactions', 'Collections']} />
            </RequirePermission>
          } />
          <Route path="/transactions/payable" element={
            <RequirePermission permission="ap.view">
              <AccountsPayable crumbs={['Financial Transactions', 'Accounts Payable']} />
            </RequirePermission>
          } />
          <Route path="/transactions/disbursements" element={
            <RequirePermission permission="disbursements.view">
              <Disbursements crumbs={['Financial Transactions', 'Disbursements']} />
            </RequirePermission>
          } />
          {/* /transactions/budgets has no entry in menuData.js (no sidebar
              link, and its comment there says Budgets was folded into the
              combined Disbursements module/permission) — left UNGATED
              since there's no confirmed permission slug for it. If this
              route is still meant to be reachable, decide whether it
              should share disbursements.view or get its own budgets.view
              (the routes/api.php comment mentions budgets.* permissions
              already exist in RoleSeeder even though no route uses them
              yet) and I'll wire it the same way as the others. */}
          <Route path="/transactions/budgets" element={<Budgets crumbs={['Financial Transactions', 'Budgets']} />} />
          <Route path="/transactions/expenses" element={
            <RequirePermission permission="expenses.view">
              <Expenses crumbs={['Financial Transactions', 'Expenses']} />
            </RequirePermission>
          } />
          <Route path="/transactions/tax-obligations" element={
            <RequirePermission permission="tax.view">
              <TaxObligations crumbs={['Financial Transactions', 'Tax Obligations']} />
            </RequirePermission>
          } />

          {/* Accounting */}
          <Route path="/accounting/general-ledger" element={
            <RequirePermission permission="general-ledger.view">
              <Generalledger crumbs={['Accounting', 'General Ledger']} />
            </RequirePermission>
          } />

          {/* Analytics */}
          <Route path="/analytics/forecasting" element={
            <RequirePermission permission="forecasting.view">
              <FinancialForecasting crumbs={['Analytics', 'Financial Forecasting']} />
            </RequirePermission>
          } />
          <Route path="/analytics/ai-recommendations" element={
            <RequirePermission permission="ai.view">
              <AIRecommendations crumbs={['Analytics', 'AI Financial Recommendations']} />
            </RequirePermission>
          } />

          {/* Standalone */}
          <Route path="/reports" element={
            <RequirePermission permission="reports.view">
              <Reports crumbs={['Reports']} />
            </RequirePermission>
          } />
          {/* Settings and Profile are intentionally NOT wrapped in
              RequirePermission — both are "my own account" pages, open to
              every authenticated user regardless of role, matching the
              comment already in menuData.js. The Company Branding EDIT
              form inside Settings.jsx checks settings.manage itself,
              which is the correct place for that narrower restriction. */}
          <Route path="/settings" element={<Settings crumbs={['Settings']} />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      {/* Fallback: unknown routes go to login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}