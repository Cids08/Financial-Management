import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Pencil, Archive, RotateCcw, HandCoins, Clock3, Wallet, Info, Printer, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Paperclip } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import CollectionEfficiencyPanel from '../components/CollectionEfficiencyPanel'
import CollectionProofHistoryModal from '../components/CollectionProofHistoryModal'
import { useCollectionUpdates } from '../hooks/useCollectionUpdates'
import { formatCurrency } from '../utils/formatters'
import { apiFetch } from '../utils/api'

const STATUS_OPTIONS = ['Pending', 'Confirmed', 'Cancelled']
const PAGE_SIZE = 10

const STATUS_STYLES = {
  Pending:   'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Confirmed: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  Cancelled: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
}

const PAYMENT_METHODS = ['Cash', 'Check', 'Bank Transfer', 'GCash', 'Credit Card']

const EMPTY_FORM = {
  ar_id:            '',
  collector_id:     '',
  receipt_number:   '',
  collection_date:  '',
  amount_received:  '',
  payment_method:   'Cash',
  reference_number: '',
  cash_account_id:  '',
  status:           'Pending',
  remarks:          '',
}

const PANEL     = 'rounded-xl border border-border bg-surface shadow-card'
const PANEL_PAD = 'p-4'
const INPUT     = `w-full h-9 px-3 rounded-lg border border-border bg-bg text-sm text-ink
  placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
  transition-all duration-150`
const LABEL = 'block text-xs font-medium text-muted mb-1.5'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-medium text-ink text-right">{value ?? '—'}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lookup hook
// Each endpoint may return a different primary key name:
//   AR records   → ar_id   (AccountsReceivable uses ar_id, not id)
//   Collectors   → collector_id
//   Cash accounts→ id
//   Users        → user_id or id
// We normalise everything to a plain `_key` field so the rest of the
// component doesn't need to care about the source shape.
// ---------------------------------------------------------------------------
function normaliseKey(item, possibleKeys) {
  for (const k of possibleKeys) {
    if (item[k] !== undefined) return item[k]
  }
  return undefined
}

function useLookups() {
  const [arRecords,    setArRecords]    = useState([])
  const [collectors,   setCollectors]   = useState([])
  const [cashAccounts, setCashAccounts] = useState([])
  const [users,        setUsers]        = useState([])
  const [lookupsReady, setLookupsReady] = useState(false)
  const [lookupErrors, setLookupErrors] = useState([])

  useEffect(() => {
    const errors = []
    Promise.all([
      // AR — primary key is ar_id
      apiFetch('/api/accounts-receivable?per_page=500')
        .then((r) => r.json())
        .then((j) => {
          if (!j.success) throw new Error(j.message || 'Failed to load AR records.')
          const data = Array.isArray(j.data) ? j.data : j.data?.data ?? []
          // Normalise: expose _key = ar_id so dropdowns are consistent
          setArRecords(data.map((a) => ({ ...a, _key: a.ar_id ?? a.id })))
        })
        .catch((e) => errors.push(`AR records: ${e.message}`)),

      // Collectors — primary key is collector_id
      apiFetch('/api/collectors?per_page=500')
        .then((r) => r.json())
        .then((j) => {
          if (!j.success) throw new Error(j.message || 'Failed to load collectors.')
          const data = Array.isArray(j.data) ? j.data : j.data?.data ?? []
          setCollectors(data.map((c) => ({ ...c, _key: c.collector_id ?? c.id })))
        })
        .catch((e) => errors.push(`collectors: ${e.message}`)),

      // Cash accounts — primary key is id
      apiFetch('/api/cash-accounts?per_page=500')
        .then((r) => r.json())
        .then((j) => {
          if (!j.success) throw new Error(j.message || 'Failed to load cash accounts.')
          const data = Array.isArray(j.data) ? j.data : j.data?.data ?? []
          setCashAccounts(data.map((a) => ({ ...a, _key: a.id })))
        })
        .catch((e) => errors.push(`cash accounts: ${e.message}`)),

      // Users — primary key is user_id or id
      apiFetch('/api/users?per_page=500')
        .then((r) => r.json())
        .then((j) => {
          if (!j.success) throw new Error(j.message || 'Failed to load users.')
          const data = Array.isArray(j.data) ? j.data : j.data?.data ?? []
          setUsers(data.map((u) => ({ ...u, _key: u.user_id ?? u.id })))
        })
        .catch((e) => errors.push(`users: ${e.message}`)),
    ]).finally(() => {
      if (errors.length) setLookupErrors(errors)
      setLookupsReady(true)
    })
  }, [])

  // Lookup helpers — all use _key for matching
  const arInfo        = (id) => arRecords.find((a) => Number(a._key) === Number(id))
  const collectorName = (id) => {
    const c = collectors.find((c) => Number(c._key) === Number(id))
    return c ? `${c.first_name} ${c.last_name}` : '—'
  }
  const accountName   = (id) => cashAccounts.find((a) => Number(a._key) === Number(id))?.account_name ?? '—'
  const userName      = (id) => {
    const u = users.find((u) => Number(u._key) === Number(id))
    return u ? `${u.first_name} ${u.last_name}` : '—'
  }

  return { arRecords, collectors, cashAccounts, users, lookupsReady, lookupErrors, arInfo, collectorName, accountName, userName }
}

// ---------------------------------------------------------------------------
// Collections hook
// ---------------------------------------------------------------------------
function useCollections() {
  const [collections, setCollections] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [meta,        setMeta]        = useState(null)
  const [trashed,     setTrashed]     = useState(false)

  const fetchCollections = (opts = {}) => {
    const params = new URLSearchParams({
      per_page: 500,
      ...(opts.trashed ?? trashed ? { trashed: 1 } : {}),
    })
    setLoading(true)
    setError('')
    apiFetch(`/api/collections?${params}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) throw new Error(json.message || 'Failed to load collections.')
        setCollections(json.data)
        setMeta(json.meta ?? null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCollections() }, [trashed])

  return { collections, loading, error, meta, trashed, setTrashed, refetch: fetchCollections }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function Collections({ title = 'Collections', crumbs = ['Financial Transactions', 'Collections'] }) {
  const {
    arRecords, collectors, cashAccounts, lookupsReady, lookupErrors,
    arInfo, collectorName, accountName, userName,
  } = useLookups()

  const { collections, loading, error, meta, trashed, setTrashed, refetch } = useCollections()

  useCollectionUpdates(refetch)

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modalMode,    setModalMode]    = useState(null)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [formError,    setFormError]    = useState('')
  const [fieldErrors,  setFieldErrors]  = useState({})
  const [dateErrors,   setDateErrors]   = useState({ collection_date: '' })
  const [submitting,   setSubmitting]   = useState(false)

  const validateDate = (field, value) => {
    if (!value) {
      setDateErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    const d = new Date(value)
    const min = new Date('2017-01-01')
    const max = new Date(`${new Date().getFullYear() + 1}-12-31`)
    if (isNaN(d.getTime())) {
      setDateErrors((e) => ({ ...e, [field]: 'Invalid date.' }))
    } else if (d < min || d > max) {
      setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
    } else {
      setDateErrors((e) => ({ ...e, [field]: '' }))
    }
  }
  const [detailRecord, setDetailRecord] = useState(null)
  const [confirmTarget,setConfirmTarget]= useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelRemarks,setCancelRemarks]= useState('')
  const [actionError,  setActionError]  = useState('')
  const [actioning,    setActioning]    = useState(false)
  const [proofTarget,  setProofTarget]  = useState(null)

  const filtered = useMemo(() => collections.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    const info = arInfo(c.ar_id)
    const q    = search.toLowerCase()
    if (search &&
      !c.receipt_number?.toLowerCase().includes(q) &&
      !info?.customer_name?.toLowerCase().includes(q) &&
      !collectorName(c.collector_id)?.toLowerCase().includes(q)
    ) return false
    return true
  }), [collections, search, statusFilter, arRecords, collectors])

  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [search, statusFilter, trashed])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page])
  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, filtered.length)

  const stats = useMemo(() => ({
    total:     collections.length,
    collected: collections.filter((c) => c.status === 'Confirmed').reduce((s, c) => s + c.amount_received, 0),
    pending:   collections.filter((c) => c.status === 'Pending').length,
  }), [collections])

  // -------------------------------------------------------------------------
  // Modal helpers
  // -------------------------------------------------------------------------
  const openAdd = () => {
    setForm({
      ...EMPTY_FORM,
      // Use _key (normalised) for the initial value so the dropdown
      // matches on first render — arRecords[0]._key is ar_id for AR.
      ar_id:           arRecords[0]?._key    ?? '',
      collector_id:    collectors[0]?._key   ?? '',
      cash_account_id: cashAccounts[0]?._key ?? '',
    })
    setFormError('')
    setFieldErrors({})
    setDateErrors({ collection_date: '' })
    setModalMode('add')
  }

  const openEdit = (c) => {
    setForm({
      ar_id:            c.ar_id,
      collector_id:     c.collector_id,
      receipt_number:   c.receipt_number   ?? '',
      collection_date:  c.collection_date  ?? '',
      amount_received:  c.amount_received  ?? '',
      payment_method:   c.payment_method   ?? 'Cash',
      reference_number: c.reference_number ?? '',
      cash_account_id:  c.cash_account_id,
      status:           c.status,
      remarks:          c.remarks          ?? '',
    })
    setFormError('')
    setFieldErrors({})
    setDateErrors({ collection_date: '' })
    setModalMode(c)
  }

  const closeModal  = () => { setModalMode(null); setFormError(''); setFieldErrors({}); setDateErrors({ collection_date: '' }) }
  const openDetail  = (c) => setDetailRecord(c)
  const closeDetail = () => setDetailRecord(null)
  const openConfirm = (c) => { setConfirmTarget(c); setActionError('') }
  const closeConfirm= () => { setConfirmTarget(null); setActionError('') }
  const openCancel  = (c) => { setCancelTarget(c); setCancelRemarks(''); setActionError('') }
  const closeCancel = () => { setCancelTarget(null); setCancelRemarks(''); setActionError('') }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!form.ar_id) errors.ar_id = 'Please select an invoice.'
    if (!form.collector_id) errors.collector_id = 'Please select a collector.'
    if (!form.cash_account_id) errors.cash_account_id = 'Please select a cash account.'
    if (!form.receipt_number.trim()) errors.receipt_number = 'Receipt number is required.'
    if (!form.collection_date) {
      errors.collection_date = 'Collection date is required.'
    } else if (form.collection_date < '2017-01-01') {
      errors.collection_date = 'Date is out of range.'
    }

    const amt = Number(form.amount_received)
    if (!form.amount_received) {
      errors.amount_received = 'Amount received is required.'
    } else if (amt <= 0) {
      errors.amount_received = 'Amount received must be greater than zero.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setFormError('')
    try {
      const isAdd = modalMode === 'add'
      const res  = await apiFetch(
        isAdd ? '/api/collections' : `/api/collections/${modalMode.id}`,
        { method: isAdd ? 'POST' : 'PUT', body: JSON.stringify(payload) }
      )
      const json = await res.json()
      if (!json.success) {
        setFormError(json.errors ? Object.values(json.errors)[0]?.[0] : json.message || 'Something went wrong.')
        return
      }
      closeModal()
      refetch()
    } catch (err) {
      setFormError(err.message || 'Network error.')
    } finally {
      setSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Archive / restore
  // -------------------------------------------------------------------------
  const handleArchive = async (c) => {
    const url = c.deleted_at
      ? `/api/collections/${c.id}/restore`
      : `/api/collections/${c.id}/archive`
    try {
      const res  = await apiFetch(url, { method: 'PATCH' })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      refetch()
    } catch (err) {
      alert(err.message)
    }
  }

  // -------------------------------------------------------------------------
  // Confirm / cancel
  // -------------------------------------------------------------------------
  const handleConfirm = async () => {
    if (!confirmTarget) return
    setActioning(true)
    setActionError('')
    try {
      const res  = await apiFetch(`/api/collections/${confirmTarget.id}/confirm`, { method: 'PATCH' })
      const json = await res.json()
      if (!json.success) throw new Error(Object.values(json.errors ?? {})[0]?.[0] || json.message || 'Failed to confirm.')
      closeConfirm()
      refetch()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActioning(false)
    }
  }

  const handleCancel = async () => {
    if (!cancelTarget) return
    setActioning(true)
    setActionError('')
    try {
      const res  = await apiFetch(`/api/collections/${cancelTarget.id}/cancel`, {
        method: 'PATCH',
        body:   JSON.stringify({ remarks: cancelRemarks }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(Object.values(json.errors ?? {})[0]?.[0] || json.message || 'Failed to cancel.')
      closeCancel()
      refetch()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActioning(false)
    }
  }

  // -------------------------------------------------------------------------
  // Print
  // -------------------------------------------------------------------------
  const handlePrint = (c) => {
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) return
    const info = arInfo(c.ar_id)
    const rows = [
      ['Invoice',         c.invoice_number  || info?.invoice_number  || '—'],
      ['Customer',        info?.customer_name || '—'],
      ['Collector',       c.collector_name  || collectorName(c.collector_id)],
      ['Collection Date', formatDate(c.collection_date)],
      ['Amount Received', formatCurrency(c.amount_received)],
      ['Payment Method',  c.payment_method],
      ['Deposited To',    c.cash_account_name || accountName(c.cash_account_id)],
      ['Reference No.',   c.reference_number || '—'],
      ['Status',          c.status],
      ...(c.remarks ? [['Remarks', c.remarks]] : []),
    ]
    win.document.write(`<html><head><title>${c.receipt_number}</title><style>
      *{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;padding:48px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1a1a;padding-bottom:20px;margin-bottom:24px}
      .header h1{margin:0 0 4px;font-size:22px}.header p{margin:0;color:#666;font-size:14px}
      .status{display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;background:#f3f3f3}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      td{padding:10px 4px;border-bottom:1px solid #eee;font-size:14px}
      td:first-child{color:#666;width:40%}td:last-child{font-weight:600;text-align:right}
      .footer{margin-top:32px;font-size:12px;color:#999;text-align:center}
      @media print{body{padding:24px}}
    </style></head><body>
      <div class="header"><div><h1>Official Receipt ${c.receipt_number}</h1><p>${info?.customer_name || ''}</p></div><span class="status">${c.status}</span></div>
      <table>${rows.map(([l, v]) => `<tr><td>${l}</td><td>${v}</td></tr>`).join('')}</table>
      <div class="footer">Printed on ${formatDateTime(new Date().toISOString())}</div>
    </body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  const statCards = [
    { key: 'total',     label: 'Total Collections', value: stats.total,                  icon: HandCoins, iconBg: 'bg-primary/15',                        iconColor: 'text-primary-dark',                          isActive: statusFilter === 'all'       && !trashed, onClick: () => { setStatusFilter('all');       setTrashed(false) } },
    { key: 'collected', label: 'Confirmed Amount',  value: formatCurrency(stats.collected), icon: Wallet,    iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Confirmed'  && !trashed, onClick: () => { setStatusFilter('Confirmed'); setTrashed(false) } },
    { key: 'pending',   label: 'Pending',           value: stats.pending,                  icon: Clock3,    iconBg: 'bg-amber-50 dark:bg-amber-500/10',     iconColor: 'text-amber-600 dark:text-amber-400',     isActive: statusFilter === 'Pending'   && !trashed, onClick: () => { setStatusFilter('Pending');   setTrashed(false) } },
    { key: 'archived',  label: 'Archived',          value: '—',                            icon: Archive,   iconBg: 'bg-slate-100 dark:bg-slate-800',       iconColor: 'text-slate-500 dark:text-slate-400',     isActive: trashed,                                  onClick: () => { setTrashed(true); setStatusFilter('all') } },
  ]

  const isModalOpen = modalMode !== null
  const isEditing   = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Record customer payments received against outstanding invoices.</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openAdd} disabled={!lookupsReady}>
          Add Collection
        </Button>
      </div>

      {lookupErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          Some dropdowns may be incomplete: {lookupErrors.join(' · ')}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button key={card.key} type="button" onClick={card.onClick}
              className={`${PANEL} ${PANEL_PAD} flex items-center gap-3 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
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

      <CollectionEfficiencyPanel />

      {/* Search / filter */}
      <div className={`${PANEL} ${PANEL_PAD} flex flex-col gap-3 lg:flex-row lg:items-center`}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by receipt no., customer, or collector..."
            className={`${INPUT} pl-9`} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${INPUT} lg:w-56! shrink-0`}>
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className={PANEL}>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-t-xl">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Receipt</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Invoice / Customer</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Collector</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Amount</th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">Loading collections…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No collections match your filters.</td></tr>
              ) : paginated.map((c) => {
                const info = arInfo(c.ar_id)
                return (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg transition-colors duration-150">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{c.receipt_number}</p>
                      <p className="text-xs text-muted">{formatDate(c.collection_date)} · {c.cash_account_name || accountName(c.cash_account_id)}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink">{c.invoice_number || info?.invoice_number}</p>
                      <p className="text-xs text-muted">{info?.customer_name}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{c.collector_name || collectorName(c.collector_id)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(c.amount_received)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[c.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label="View full record" align="start">
                          <button type="button" onClick={() => openDetail(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"><Info size={15} /></button>
                        </Tooltip>
                        <Tooltip label="Print receipt" align="start">
                          <button type="button" onClick={() => handlePrint(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"><Printer size={15} /></button>
                        </Tooltip>
                        <Tooltip label="Proof of receipt" align="start">
                          <button type="button" onClick={() => setProofTarget(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"><Paperclip size={15} /></button>
                        </Tooltip>
                        {c.status === 'Pending' && (
                          <Tooltip label="Confirm collection" align="start">
                            <button type="button" onClick={() => openConfirm(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400 transition-colors duration-150"><CheckCircle2 size={15} /></button>
                          </Tooltip>
                        )}
                        {c.status === 'Pending' && (
                          <Tooltip label="Cancel collection" align="start">
                            <button type="button" onClick={() => openCancel(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors duration-150"><XCircle size={15} /></button>
                          </Tooltip>
                        )}
                        {c.status !== 'Confirmed' && (
                          <Tooltip label="Edit collection" align="start">
                            <button type="button" onClick={() => openEdit(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"><Pencil size={15} /></button>
                          </Tooltip>
                        )}
                        {c.status !== 'Confirmed' && (
                          <Tooltip label={c.deleted_at ? 'Restore collection' : 'Archive collection'} align="end">
                            <button type="button" onClick={() => handleArchive(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              {c.deleted_at ? <RotateCcw size={15} /> : <Archive size={15} />}
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted">Showing {rangeStart}–{rangeEnd} of {filtered.length} collections</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Previous page">
                <ChevronLeft size={15} />
              </button>
              <span className="px-2 text-xs font-medium text-ink whitespace-nowrap">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Next page">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal open={isModalOpen} onClose={closeModal} title={isEditing ? 'Edit Collection' : 'Add Collection'}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeModal} disabled={submitting}>Cancel</Button>
            <Button variant="primary" size="md" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Collection'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{formError}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Invoice — uses _key (= ar_id) as option value */}
            <div>
              <label className={LABEL}>Invoice <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={form.ar_id}
                onChange={(e) => { setForm((f) => ({ ...f, ar_id: e.target.value })); setFieldErrors((fe) => ({ ...fe, ar_id: '' })) }}
                className={`${INPUT} ${fieldErrors.ar_id ? 'border-red-400 dark:border-red-500' : ''}`}
              >
                <option value="">Select invoice…</option>
                {arRecords.map((a) => (
                  <option key={a._key} value={a._key}>
                    {a.invoice_number} — {a.customer_name}
                  </option>
                ))}
              </select>
              {fieldErrors.ar_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.ar_id}</p>}
            </div>

            {/* Collector — uses _key (= collector_id) as option value */}
            <div>
              <label className={LABEL}>Collector <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={form.collector_id}
                onChange={(e) => { setForm((f) => ({ ...f, collector_id: e.target.value })); setFieldErrors((fe) => ({ ...fe, collector_id: '' })) }}
                className={`${INPUT} ${fieldErrors.collector_id ? 'border-red-400 dark:border-red-500' : ''}`}
              >
                <option value="">Select collector…</option>
                {collectors.map((c) => (
                  <option key={c._key} value={c._key}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
              {fieldErrors.collector_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.collector_id}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Receipt Number <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="text"
                value={form.receipt_number}
                onChange={(e) => { setForm((f) => ({ ...f, receipt_number: e.target.value })); setFieldErrors((fe) => ({ ...fe, receipt_number: '' })) }}
                className={`${INPUT} ${fieldErrors.receipt_number ? 'border-red-400 dark:border-red-500' : ''}`}
                placeholder="OR-10021"
              />
              {fieldErrors.receipt_number && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.receipt_number}</p>}
            </div>
            <div>
              <label className={LABEL}>Collection Date <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="date"
                min="2017-01-01"
                max={`${new Date().getFullYear() + 1}-12-31`}
                value={form.collection_date}
                onChange={(e) => { setForm((f) => ({ ...f, collection_date: e.target.value })); setFieldErrors((fe) => ({ ...fe, collection_date: '' })) }}
                onBlur={(e) => validateDate('collection_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${dateErrors.collection_date || fieldErrors.collection_date ? 'border-red-400 dark:border-red-500' : ''}`}
              />
              {(dateErrors.collection_date || fieldErrors.collection_date) && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{dateErrors.collection_date || fieldErrors.collection_date}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Amount Received <span className="text-red-500 dark:text-red-400">*</span></label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={form.amount_received}
                onChange={(e) => {
                  const val = e.target.value
                  setForm((f) => ({ ...f, amount_received: val }))
                  setFieldErrors((fe) => ({ ...fe, amount_received: '' }))
                  if (val === '') {
                    setFieldErrors((fe) => ({ ...fe, amount_received: '' }))
                  } else if (Number(val) < 0) {
                    setFieldErrors((fe) => ({ ...fe, amount_received: 'Amount received cannot be negative.' }))
                  } else if (Number(val) === 0) {
                    setFieldErrors((fe) => ({ ...fe, amount_received: 'Amount received must be greater than zero.' }))
                  }
                }}
                className={`${INPUT} ${fieldErrors.amount_received ? 'border-red-400 dark:border-red-500' : ''}`}
                placeholder="0.00"
              />
              {fieldErrors.amount_received && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.amount_received}</p>}
            </div>
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className={INPUT}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Cash account — uses _key (= id) as option value */}
            <div>
              <label className={LABEL}>Deposit To (Cash Account) <span className="text-red-500 dark:text-red-400">*</span></label>
              <select
                value={form.cash_account_id}
                onChange={(e) => { setForm((f) => ({ ...f, cash_account_id: e.target.value })); setFieldErrors((fe) => ({ ...fe, cash_account_id: '' })) }}
                className={`${INPUT} ${fieldErrors.cash_account_id ? 'border-red-400 dark:border-red-500' : ''}`}
              >
                <option value="">Select account…</option>
                {cashAccounts.map((a) => (
                  <option key={a._key} value={a._key}>
                    {a.account_name}
                  </option>
                ))}
              </select>
              {fieldErrors.cash_account_id && <p className="mt-1 text-xs text-red-500 dark:text-red-400">{fieldErrors.cash_account_id}</p>}
            </div>
            <div>
              <label className={LABEL}>Reference Number</label>
              <input type="text" value={form.reference_number} onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))} className={INPUT} placeholder="REF-COL-001" />
            </div>
          </div>

          <div>
            <label className={LABEL}>Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={INPUT}
              disabled={isEditing && modalMode?.status === 'Confirmed'}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {isEditing && modalMode?.status === 'Confirmed' && (
              <p className="mt-1 text-xs text-muted">Confirmed collections cannot be edited directly.</p>
            )}
          </div>

          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} placeholder="Optional notes" />
          </div>

          {isEditing && (
            <div className="rounded-lg border border-border bg-bg px-3 py-2.5">
              <p className="text-xs font-medium text-muted mb-1">Record Info (read-only)</p>
              <DetailRow label="Created by"   value={modalMode.created_by_name  || userName(modalMode.created_by)} />
              <DetailRow label="Created at"   value={formatDateTime(modalMode.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(modalMode.updated_at)} />
              {modalMode.deleted_at && (
                <>
                  <DetailRow label="Archived by" value={modalMode.deleted_by_name || userName(modalMode.deleted_by)} />
                  <DetailRow label="Archived at" value={formatDateTime(modalMode.deleted_at)} />
                </>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detailRecord} onClose={closeDetail} title="Collection Details"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeDetail}>Close</Button>
            {detailRecord && <Button variant="primary" size="md" icon={Printer} onClick={() => handlePrint(detailRecord)}>Print Receipt</Button>}
          </>
        }
      >
        {detailRecord && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{detailRecord.receipt_number}</p>
                <p className="text-xs text-muted">{arInfo(detailRecord.ar_id)?.customer_name}</p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[detailRecord.status] ?? 'bg-slate-100 text-slate-600'}`}>{detailRecord.status}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Invoice"         value={detailRecord.invoice_number || arInfo(detailRecord.ar_id)?.invoice_number} />
                <DetailRow label="Collector"       value={detailRecord.collector_name || collectorName(detailRecord.collector_id)} />
                <DetailRow label="Collection Date" value={formatDate(detailRecord.collection_date)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Amount Received" value={formatCurrency(detailRecord.amount_received)} />
                <DetailRow label="Payment Method"  value={detailRecord.payment_method} />
                <DetailRow label="Deposited To"    value={detailRecord.cash_account_name || accountName(detailRecord.cash_account_id)} />
                <DetailRow label="Reference No."   value={detailRecord.reference_number} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Remarks" value={detailRecord.remarks || '—'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Created by"  value={detailRecord.created_by_name  || userName(detailRecord.created_by)} />
                <DetailRow label="Created at"  value={formatDateTime(detailRecord.created_at)} />
                <DetailRow label="Updated at"  value={formatDateTime(detailRecord.updated_at)} />
                {detailRecord.deleted_at && (
                  <>
                    <DetailRow label="Archived by" value={detailRecord.deleted_by_name || userName(detailRecord.deleted_by)} />
                    <DetailRow label="Archived at" value={formatDateTime(detailRecord.deleted_at)} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm modal */}
      <Modal open={!!confirmTarget} onClose={closeConfirm} title="Confirm Collection"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeConfirm} disabled={actioning}>Back</Button>
            <Button variant="primary"   size="md" onClick={handleConfirm} disabled={actioning}>
              {actioning ? 'Confirming…' : 'Confirm Collection'}
            </Button>
          </>
        }
      >
        {confirmTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Confirming this collection will update the invoice balance and credit the cash account. This cannot be undone.</p>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Receipt"         value={confirmTarget.receipt_number} />
                <DetailRow label="Invoice"         value={confirmTarget.invoice_number || arInfo(confirmTarget.ar_id)?.invoice_number} />
                <DetailRow label="Collector"       value={confirmTarget.collector_name || collectorName(confirmTarget.collector_id)} />
                <DetailRow label="Collection Date" value={formatDate(confirmTarget.collection_date)} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Amount Received" value={formatCurrency(confirmTarget.amount_received)} />
                <DetailRow label="Payment Method"  value={confirmTarget.payment_method} />
                <DetailRow label="Deposit To"      value={confirmTarget.cash_account_name || accountName(confirmTarget.cash_account_id)} />
              </div>
            </div>
            {actionError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{actionError}</div>
            )}
          </div>
        )}
      </Modal>

      {/* Cancel modal */}
      <Modal open={!!cancelTarget} onClose={closeCancel} title="Cancel Collection"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeCancel} disabled={actioning}>Back</Button>
            <Button variant="danger"    size="md" onClick={handleCancel} disabled={actioning}>
              {actioning ? 'Cancelling…' : 'Cancel Collection'}
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">This will mark the collection as cancelled. The invoice balance will not be affected.</p>
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Receipt"         value={cancelTarget.receipt_number} />
                <DetailRow label="Invoice"         value={cancelTarget.invoice_number || arInfo(cancelTarget.ar_id)?.invoice_number} />
                <DetailRow label="Amount Received" value={formatCurrency(cancelTarget.amount_received)} />
                <DetailRow label="Collection Date" value={formatDate(cancelTarget.collection_date)} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Reason for cancellation <span className="text-muted">(optional)</span></label>
              <input type="text" value={cancelRemarks} onChange={(e) => setCancelRemarks(e.target.value)}
                className={INPUT} placeholder="e.g. Duplicate entry, incorrect amount..." maxLength={500} />
            </div>
            {actionError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{actionError}</div>
            )}
          </div>
        )}
      </Modal>

      {/* Proof of receipt history modal */}
      <CollectionProofHistoryModal
        open={!!proofTarget}
        onClose={() => setProofTarget(null)}
        collection={proofTarget}
        onUploaded={refetch}
      />
    </div>
  )
}