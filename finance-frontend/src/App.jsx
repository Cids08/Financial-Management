import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './layouts/DashboardLayout'
import Dashboard from './pages/Dashboard'
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
    <Routes>
      {/* Standalone — no sidebar/header/footer chrome */}
      {/* Login is the landing page */}
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/logout" element={<Logout />} />

      {/* Everything below requires an authenticated session */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />

          {/* User Management */}
          <Route path="/user-management/users" element={<Users crumbs={['User Management', 'Users']} />} />
          <Route path="/user-management/roles" element={<Roles crumbs={['User Management', 'Roles']} />} />

          {/* Master Data */}
          <Route path="/master-data/customers" element={<Customers crumbs={['Master Data', 'Customers']} />} />
          <Route path="/master-data/suppliers" element={<Suppliers crumbs={['Master Data', 'Suppliers']} />} />
          <Route path="/master-data/collectors" element={<Collectors crumbs={['Master Data', 'Collectors']} />} />
          <Route path="/master-data/departments" element={<Departments crumbs={['Master Data', 'Departments']} />} />
          <Route path="/master-data/cash-accounts" element={<CashAccounts crumbs={['Master Data', 'Cash Accounts']} />} />
          <Route path="/master-data/fixed-assets" element={<FixedAssets crumbs={['Master Data', 'Fixed Assets']} />} />

          {/* Financial Transactions */}
          <Route path="/transactions/receivable" element={<AccountsReceivable crumbs={['Financial Transactions', 'Accounts Receivable']} />} />
          <Route path="/transactions/collections" element={<Collections crumbs={['Financial Transactions', 'Collections']} />} />
          <Route path="/transactions/payable" element={<AccountsPayable crumbs={['Financial Transactions', 'Accounts Payable']} />} />
          <Route path="/transactions/disbursements" element={<Disbursements crumbs={['Financial Transactions', 'Disbursements']} />} />
          <Route path="/transactions/budgets" element={<Budgets crumbs={['Financial Transactions', 'Budgets']} />} />
          <Route path="/transactions/expenses" element={<Expenses crumbs={['Financial Transactions', 'Expenses']} />} />
          <Route path="/transactions/tax-obligations" element={<TaxObligations crumbs={['Financial Transactions', 'Tax Obligations']} />} />

          {/* Accounting */}
          <Route path="/accounting/general-ledger" element={<Generalledger crumbs={['Accounting', 'General Ledger']} />} />

          {/* Analytics */}
          <Route path="/analytics/forecasting" element={<FinancialForecasting crumbs={['Analytics', 'Financial Forecasting']} />} />
          <Route path="/analytics/ai-recommendations" element={<AIRecommendations crumbs={['Analytics', 'AI Financial Recommendations']} />} />

          {/* Standalone */}
          <Route path="/reports" element={<Reports crumbs={['Reports']} />} />
          <Route path="/settings" element={<Settings crumbs={['Settings']} />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      {/* Fallback: unknown routes go to login */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}