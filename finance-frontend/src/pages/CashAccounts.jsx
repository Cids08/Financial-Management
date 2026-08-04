import { useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, Wallet, PiggyBank, Landmark, CreditCard, Eye, EyeOff, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import { formatCurrency } from '../utils/formatters'
import { useCashAccounts } from '../hooks/UseCashAccounts'

const ACCOUNT_TYPES = ['Checking', 'Savings', 'Petty Cash', 'Money Market']

const EMPTY_FORM = { account_name: '', bank_name: '', account_number: '', account_type: ACCOUNT_TYPES[0], current_balance: '', status: 'Active' }

const PANEL = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Inactive: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

const TYPE_ICON = {
  Checking: CreditCard,
  Savings: PiggyBank,
  'Petty Cash': Wallet,
  'Money Market': Landmark,
}

// Keeps spacing/formatting but replaces all but the last 4 characters with asterisks
function maskAccountNumber(value) {
  if (!value) return ''
  const visibleCount = 4
  const chars = value.split('')
  let visibleLeft = visibleCount
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i] === ' ') continue
    if (visibleLeft > 0) {
      visibleLeft--
    } else {
      chars[i] = '•'
    }
  }
  return chars.join('')
}

export default function CashAccounts({ title = 'Cash Accounts', crumbs = ['Master Data', 'Cash Accounts'] }) {
  const {
    accounts, meta, loading, saving, error,
    search, setSearch,
    typeFilter, setTypeFilter,
    showArchived, setShowArchived,
    page, setPage,
    createAccount, updateAccount, archiveAccount, restoreAccount,
  } = useCashAccounts()

  const [modalMode, setModalMode] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const [revealedIds, setRevealedIds] = useState(new Set())
  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // "This page" totals only — see Collectors.jsx for the same caveat.
  // meta.total (used in the Total Accounts card) IS global/accurate.
  const totalBalanceThisPage = accounts.filter((a) => a.status === 'Active').reduce((sum, a) => sum + a.current_balance, 0)
  const inactiveThisPage = accounts.filter((a) => a.status === 'Inactive').length

  const openAdd = () => { setForm(EMPTY_FORM); setFormError(''); setModalMode('add') }
  const openEdit = (a) => {
    setForm({
      account_name: a.account_name,
      bank_name: a.bank_name || '',
      account_number: a.account_number,
      account_type: a.account_type,
      current_balance: a.current_balance,
      status: a.status,
    })
    setFormError('')
    setModalMode(a)
  }
  const closeModal = () => { setModalMode(null); setFormError('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.account_name.trim() || !form.account_number.trim()) {
      setFormError('Account name and account number are required.')
      return
    }

    const payload = {
      account_name: form.account_name,
      bank_name: form.bank_name || null,
      account_number: form.account_number,
      account_type: form.account_type,
      current_balance: Number(form.current_balance) || 0,
      status: form.status,
    }

    const result = modalMode === 'add'
      ? await createAccount(payload)
      : await updateAccount(modalMode.cash_account_id, payload)

    if (!result.success) {
      setFormError(result.message)
      return
    }
    closeModal()
  }

  const statCards = [
    { key: 'total', label: 'Total Accounts', value: meta.total, icon: Wallet, iconBg: 'bg-primary/15', iconColor: 'text-primary-dark', isActive: typeFilter === 'all' && !showArchived, onClick: () => { setTypeFilter('all'); setShowArchived(false) } },
    { key: 'balance', label: 'Balance (this page)', value: formatCurrency(totalBalanceThisPage), icon: PiggyBank, iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: false, onClick: () => { setTypeFilter('all'); setShowArchived(false) } },
    { key: 'inactive', label: 'Inactive (this page)', value: inactiveThisPage, icon: Landmark, iconBg: 'bg-red-50 dark:bg-red-500/10', iconColor: 'text-red-600 dark:text-red-400', isActive: false, onClick: () => setShowArchived(false) },
    { key: 'archived', label: 'Archived', value: showArchived ? meta.total : '—', icon: Archive, iconBg: 'bg-slate-100 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400', isActive: showArchived, onClick: () => setShowArchived(true) },
  ]

  const isModalOpen = modalMode !== null
  const isEditing = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Manage bank and cash accounts used for collections and disbursements.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd}>Add Cash Account</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left cursor-pointer
                transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0
                ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={18} className={card.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">{card.label}</p>
                <p className="text-lg font-bold text-ink">{card.value}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by account or bank name..." className={`${INPUT} pl-9`} />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={INPUT}>
          <option value="all">All Types</option>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-border accent-primary" />
          Show archived
        </label>
      </div>

      <div className={PANEL}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Account</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Type</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Balance</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                  <Loader2 size={16} className="inline animate-spin mr-2" /> Loading cash accounts…
                </td></tr>
              )}
              {!loading && accounts.map((a) => {
                const TypeIcon = TYPE_ICON[a.account_type] || Wallet
                return (
                  <tr key={a.cash_account_id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary-dark">
                          <TypeIcon size={15} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate font-medium text-ink">{a.account_name}</p>
                            <span className="shrink-0 text-[10px] font-mono text-muted bg-bg border border-border rounded px-1 py-0.5">{a.account_code}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted">
                            <span className="truncate">
                              {a.bank_name} &middot; <span className="font-mono">{revealedIds.has(a.cash_account_id) ? a.account_number : maskAccountNumber(a.account_number)}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleReveal(a.cash_account_id)}
                              aria-label={revealedIds.has(a.cash_account_id) ? 'Hide account number' : 'Show account number'}
                              className="shrink-0 text-muted hover:text-ink transition-colors duration-150"
                            >
                              {revealedIds.has(a.cash_account_id) ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{a.account_type}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(a.current_balance)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="Edit account" align="start">
                          <button type="button" onClick={() => openEdit(a)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                            <Pencil size={15} />
                          </button>
                        </Tooltip>
                        <Tooltip label={showArchived ? 'Restore account' : 'Archive account'} align="end">
                          <button
                            type="button"
                            onClick={() => (showArchived ? restoreAccount(a.cash_account_id) : archiveAccount(a.cash_account_id))}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"
                          >
                            {showArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && accounts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">No cash accounts match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted">
            <span>Page {meta.current_page} of {meta.last_page} &middot; {meta.total} total</span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-bg disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150">
                <ChevronLeft size={14} />
              </button>
              <button type="button" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-bg disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={isEditing ? 'Edit Cash Account' : 'Add Cash Account'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Account'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}
          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-muted">
              Reference code: <span className="font-mono text-ink">{modalMode.account_code}</span> (auto-generated, not editable)
            </div>
          )}
          <div>
            <label className={LABEL}>Account Name</label>
            <input type="text" value={form.account_name} onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))} className={INPUT} placeholder="BDO Operating Account" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Bank Name</label>
              <input type="text" value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} className={INPUT} placeholder="BDO Unibank" />
            </div>
            <div>
              <label className={LABEL}>Account Number</label>
              <input type="text" value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} className={INPUT} placeholder="0012 3456 7890" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Account Type</label>
              <select value={form.account_type} onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value }))} className={INPUT}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Current Balance</label>
              <input type="number" value={form.current_balance} onChange={(e) => setForm((f) => ({ ...f, current_balance: e.target.value }))} className={INPUT} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className={LABEL}>Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>
    </div>
  )
}