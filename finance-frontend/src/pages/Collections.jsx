import PendingDepositNotice from '../components/PendingDepositNotice'
import DetailRow from '../components/DetailRow'
import DepositBatchesModal from '../components/DepositBatchesModal'
import RecordDepositModal from '../components/RecordDepositModal'
import RowActions from '../components/RowActions'
import DocumentAction from '../components/DocumentAction'
import KpiValue from '../components/KpiValue'
import { TableSkeleton, ContentSkeleton } from '../components/LoadingSkeleton'
import ResponsiveTable from '../components/ResponsiveTable'
import { useEffect, useMemo, useState } from 'react'
import { Search, Pencil, Archive, RotateCcw, HandCoins, Clock3, Wallet, Info, Printer, CheckCircle2, XCircle, Paperclip, X, RefreshCw, Users, AlertCircle, Lock, Upload } from 'lucide-react'
import Breadcrumb from '../components/Breadcrumb'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Tooltip from '../components/Tooltip'
import Pagination from '../components/Pagination'
import CollectionEfficiencyPanel from '../components/CollectionEfficiencyPanel'
import CollectionProofHistoryModal from '../components/CollectionProofHistoryModal'
import { useCollectionUpdates } from '../hooks/useCollectionUpdates'
import { useDataUpdates } from '../hooks/useDataUpdates'
import { useHighlightRow } from '../hooks/useHighlightRow'
import { useProfile } from '../hooks/useProfile'
import { useCompany } from '../context/CompanyContext'
import DeletePermanentButton from '../components/DeletePermanentButton'
import RetentionCountdown from '../components/RetentionCountdown'
// NOTE: the shared formatters.formatDateTime renders en-US, while this page's
// local formatDateTime below renders en-PH. Keep the local one so existing
// timestamps on this page keep their current format.
import { formatCurrency } from '../utils/formatters'
import { printSlip } from '../utils/printSlip'
import { printDuplicateReceipt } from '../utils/printReceipt'
import { money, SIGNATURE_PRESETS } from '../utils/print'
import { MIN_COLLECTION_AMOUNT, minHint, formatBaseAmount } from '../utils/business'
import { apiFetch } from '../utils/api'
import { useSearchParams } from 'react-router-dom'
import { usePrivacy } from '../context/PrivacyContext'
import { usePermissions } from '../context/PermissionsContext'
import { compressImageToUploadable, cannotFitHostLimit } from '../utils/fileUpload'

const collectionStage = c => c.collection_stage || (c.status === 'Pending' ? (c.deposit_date ? 'Deposited' : 'Collected') : c.status)
const STATUS_OPTIONS = ['Awaiting Collection', 'Collected', 'Deposited', 'Confirmed', 'Cancelled']
const PAGE_SIZE = 10

const STATUS_LABELS = {
  Collected: 'Collected - not deposited',
  Deposited: 'Deposited - awaiting confirmation',
  'Awaiting Collection': 'Awaiting Collection',
  Pending:               'Unconfirmed receipts',
  Confirmed:             'Confirmed',
  Cancelled:             'Cancelled',
}

const STATUS_STYLES = {
  Collected: 'bg-status-warning-bg text-status-warning',
  Deposited: 'bg-primary/10 text-primary-dark',
  Pending:                 'bg-status-warning-bg text-status-warning',
  'Awaiting Confirmation': 'bg-status-warning-bg text-status-warning',
  Confirmed:               'bg-status-success-bg text-status-success',
  Cancelled:               'bg-status-neutral-bg text-status-neutral',
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

function getNextReferenceNo(collections = []) {
  const existingRefs = new Set(
    collections.map((c) => (c.reference_number || '').trim().toLowerCase())
  )
  let maxNum = 0
  collections.forEach((c) => {
    const match = (c.reference_number || '').match(/REF-COL-(\d+)/i)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  })
  let nextNum = maxNum > 0 ? maxNum + 1 : (collections.length + 1)
  while (existingRefs.has(`ref-col-${String(nextNum).padStart(3, '0')}`)) {
    nextNum++
  }
  return `REF-COL-${String(nextNum).padStart(3, '0')}`
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
      // AR  -  primary key is ar_id (server-scoped to the collector's own
      // assigned invoices for Collector-role users)
      apiFetch('/api/accounts-receivable?per_page=500')
        .then((r) => r.json())
        .then((j) => {
          if (!j.success) throw new Error(j.message || 'Failed to load AR records.')
          const data = Array.isArray(j.data) ? j.data : j.data?.data ?? []
          // Normalise: expose _key = ar_id so dropdowns are consistent
          setArRecords(data.map((a) => ({ ...a, _key: a.ar_id ?? a.id })))
        })
        .catch((e) => errors.push(`AR records: ${e.message}`)),

      // Collectors / cash accounts / users for the form's dropdowns.
      // The dedicated /api/collections/lookups endpoint returns exactly
      // these under collections.view — cash-accounts.view and
      // collectors.view aren't granted to Collector-role users, so the
      // master-data endpoints would 403 and leave the dropdowns empty.
      apiFetch('/api/collections/lookups')
        .then((r) => r.json())
        .then((j) => {
          if (!j.success) throw new Error(j.message || 'Failed to load form lookups.')
          const d = j.data || {}
          setCollectors((d.collectors || []).map((c) => ({ ...c, _key: c.id })))
          setCashAccounts((d.cash_accounts || []).map((a) => ({ ...a, _key: a.id })))
          setUsers((d.users || []).map((u) => ({ ...u, _key: u.id })))
        })
        .catch((e) => errors.push(`lookups: ${e.message}`)),
    ]).finally(() => {
      if (errors.length) setLookupErrors(errors)
      setLookupsReady(true)
    })
  }, [])

  // Lookup helpers  -  all use _key for matching
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
// Assigned Invoice Queue — live-updates via the accounts-receivable data
// channel so the queue refreshes the moment an admin assigns a new
// collector on the AR page (no polling). Kept in sync by useDataUpdates.
// ---------------------------------------------------------------------------
const QUEUE_EXCLUDE_STATUSES = new Set(['Paid'])

// Matches the overdue definition used on the Collector dashboard stat card
// (CollectorDashboard.jsx): an invoice is overdue if its status is 'Overdue',
// or it's open (not Paid/Cancelled) and its due date is before today.
// Used to power the ?overdue=1 deep-link so the "Overdue Invoices" card
// actually opens a filtered queue instead of a text search that can't match.
const isOverdueAR = (r) =>
  r.status === 'Overdue' ||
  (r.status !== 'Paid' && r.status !== 'Cancelled' && r.due_date && new Date(r.due_date) < new Date(new Date().toDateString()))

function useAssignedInvoices() {
  const [invoices,      setInvoices]      = useState([])
  const [queueLoading,  setQueueLoading]  = useState(true)
  const [queueError,    setQueueError]    = useState('')
  const [lastFetched,   setLastFetched]   = useState(null)

  const fetchQueue = () => {
    setQueueError('')
    apiFetch('/api/accounts-receivable?per_page=500')
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error(j.message || 'Failed to load invoice queue.')
        const data = Array.isArray(j.data) ? j.data : j.data?.data ?? []
        // Only show invoices that have a collector assigned AND are not paid
        const queue = data.filter(
          (a) => a.collector_id && !QUEUE_EXCLUDE_STATUSES.has(a.status) && !a.is_archived
        )
        setInvoices(queue)
        setLastFetched(new Date())
      })
      .catch((e) => setQueueError(e.message))
      .finally(() => setQueueLoading(false))
  }

  useEffect(() => {
    fetchQueue()
  }, [])

  return { invoices, queueLoading, queueError, lastFetched, refetchQueue: fetchQueue }
}

// ---------------------------------------------------------------------------
// Collections hook
// ---------------------------------------------------------------------------
function useCollections() {
  const [liveCollections,   setLiveCollections]   = useState([])
  const [trashedCollections, setTrashedCollections] = useState([])
  const [trashedTotal,      setTrashedTotal]      = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [trashed,     setTrashed]     = useState(false)

  // Live and archived rows are fetched together (the same dual-fetch the
  // Users page already does) so the stat cards keep describing the LIVE
  // records while the table shows the trash. With a single fetch of
  // whichever view was open, opening Archived made "All Records",
  // "Collected" and "Pending" count archived rows, and the Archived card
  // had no count to show at all (it rendered a dash).
  const fetchCollections = () => {
    setLoading(true)
    setError('')
    Promise.all([
      apiFetch('/api/collections?per_page=500').then((res) => res.json()),
      apiFetch('/api/collections?per_page=500&trashed=1').then((res) => res.json()),
    ])
      .then(([liveJson, trashedJson]) => {
        if (!liveJson.success) throw new Error(liveJson.message || 'Failed to load collections.')
        if (!trashedJson.success) throw new Error(trashedJson.message || 'Failed to load archived collections.')
        setLiveCollections(liveJson.data)
        setTrashedCollections(trashedJson.data)
        // meta.total is the exact archived count even past per_page.
        setTrashedTotal(trashedJson.meta?.total ?? trashedJson.data.length)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  // Both sets are loaded on mount; toggling views never refetches.
  useEffect(() => { fetchCollections() }, [])

  const collections = trashed ? trashedCollections : liveCollections

  return { collections, liveCollections, trashedTotal, loading, error, trashed, setTrashed, refetch: fetchCollections }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function Collections({ title = 'Collections', crumbs = ['Financial Transactions', 'Collections'] }) {
  const {
    arRecords, collectors, cashAccounts, lookupsReady, lookupErrors,
    arInfo, collectorName, accountName, userName,
  } = useLookups()

  const { collections, liveCollections, trashedTotal, loading, error, trashed, setTrashed, refetch } = useCollections()
  const { invoices: assignedInvoices, queueLoading, queueError, lastFetched, refetchQueue } = useAssignedInvoices()

  useCollectionUpdates(() => { refetch(); refetchQueue() })

  // AR invoice changes (new assignment, status change, edit) refresh the
  // assigned-invoice queue live  -  replaced the old 15s setInterval poll.
  useDataUpdates(['accounts-receivable', 'collections'], () => { refetch(); refetchQueue() })

  usePrivacy()

  const { profile } = useProfile()
  const company = useCompany()
  const { hasPermission } = usePermissions()
  const canConfirm = hasPermission('collections.confirm')
  const isAdmin = profile?.role === 'Admin' || profile?.role === 'Super Admin' || profile?.role_slug === 'admin' || profile?.role_slug === 'super-admin'
  const canViewAuditLogs = isAdmin || hasPermission('audit-logs.view') || hasPermission('audit_logs.view')
  const isCollectorUser = profile?.role_slug === 'collector' || profile?.role?.toLowerCase() === 'collector'
  const userCollectorId = profile?.collector_id ? String(profile.collector_id) : null

  // Invoices filtered if logged-in user is a collector
  const availableArRecords = useMemo(() => {
    if (isCollectorUser && userCollectorId) {
      return arRecords.filter((a) => String(a.collector_id) === String(userCollectorId))
    }
    return arRecords
  }, [arRecords, isCollectorUser, userCollectorId])

  const [search,          setSearch]          = useState('')
  const [statusFilter,    setStatusFilter]    = useState('all')
  const [overdueOnly,     setOverdueOnly]     = useState(false)
  const [collectorFilter, setCollectorFilter] = useState('all')
  const [sortBy,          setSortBy]          = useState('date') // 'date' | 'collector' | 'amount'
  const [sortDir,         setSortDir]         = useState('desc') // 'asc' | 'desc'
  const [modalMode,       setModalMode]       = useState(null)
  const [isCollectLocked, setIsCollectLocked] = useState(false)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [formError,    setFormError]    = useState('')
  const [fieldErrors,  setFieldErrors]  = useState({})
  const [dateErrors,   setDateErrors]   = useState({ collection_date: '' })
  const [submitting,   setSubmitting]   = useState(false)

  // Auto-populate first options as soon as lookups finish loading if currently adding
  useEffect(() => {
    if (modalMode === 'add' && !isCollectLocked) {
      const defaultArId = (isCollectorUser && userCollectorId)
        ? (availableArRecords[0]?._key ?? '')
        : (arRecords[0]?._key ?? '')
      const defaultCollectorId = (isCollectorUser && userCollectorId)
        ? userCollectorId
        : (collectors[0]?._key ?? '')

      setForm((f) => ({
        ...f,
        ar_id: (f.ar_id && f.ar_id !== 'undefined') ? f.ar_id : defaultArId,
        collector_id: (isCollectorUser && userCollectorId)
          ? userCollectorId
          : ((f.collector_id && f.collector_id !== 'undefined') ? f.collector_id : defaultCollectorId),
        cash_account_id: (f.cash_account_id && f.cash_account_id !== 'undefined') ? f.cash_account_id : (cashAccounts[0]?._key ?? ''),
      }))
    }
  }, [arRecords, availableArRecords, collectors, cashAccounts, modalMode, isCollectLocked, isCollectorUser, userCollectorId])

  const validateDate = (field, value) => {
    if (!value) {
      setDateErrors((e) => ({ ...e, [field]: '' }))
      return
    }
    const d = new Date(value)
    const min = new Date('2017-01-01')
    const todayStr = new Date().toISOString().split('T')[0]
    if (isNaN(d.getTime())) {
      setDateErrors((e) => ({ ...e, [field]: 'Invalid date.' }))
    } else if (field === 'collection_date' && value > todayStr) {
      setDateErrors((e) => ({ ...e, [field]: 'Collection date cannot be in the future.' }))
    } else if (d < min) {
      setDateErrors((e) => ({ ...e, [field]: 'Date is out of range.' }))
    } else {
      setDateErrors((e) => ({ ...e, [field]: '' }))
    }
  }
  const [detailRecord, setDetailRecord] = useState(null)
  const [batchRevision, setBatchRevision] = useState(0)
  const [batchOpen, setBatchOpen] = useState(false)
  const [depositTarget, setDepositTarget] = useState(null)
  const [checkCleared, setCheckCleared] = useState(false)
  const [verifyTarget, setVerifyTarget] = useState(null)
  const [receiptVerified, setReceiptVerified] = useState(false)
  const [confirmTarget,setConfirmTarget]= useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelRemarks,setCancelRemarks]= useState('')
  const [actioning,    setActioning]    = useState(false)
  const [actionError,  setActionError]  = useState('')
  const [proofTarget,  setProofTarget]  = useState(null)
  const [proofFile,    setProofFile]    = useState(null)
  const [auditLogs,    setAuditLogs]    = useState([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [auditLogsError,   setAuditLogsError]   = useState(null)

  const filtered = useMemo(() => collections.filter((c) => {
    if (statusFilter === 'In deposit batch') {
      if (c.status !== 'Pending' || !c.deposit_batch_id) return false
    } else if (statusFilter !== 'all' && (['Collected','Deposited'].includes(statusFilter) ? collectionStage(c) !== statusFilter : c.status !== statusFilter)) return false
    if (collectorFilter !== 'all' && String(c.collector_id) !== String(collectorFilter)) return false
    const info = arInfo(c.ar_id)
    const q    = search.toLowerCase()
    if (search &&
      !c.receipt_number?.toLowerCase().includes(q) &&
      !info?.customer_name?.toLowerCase().includes(q) &&
      !collectorName(c.collector_id)?.toLowerCase().includes(q)
    ) return false
    return true
  }), [collections, search, statusFilter, collectorFilter, arRecords, collectors])

  // Queue rows prepended to the main table — only visible when no status
  // filter (or when explicitly filtering for 'Awaiting Collection') and not trashed.
  // Each item is tagged _isQueue so the table can render it with an Awaiting badge + Collect button.
  const mergedRows = useMemo(() => {
    let list

    if (trashed) {
      list = [...filtered]
    } else if (statusFilter !== 'all' && statusFilter !== 'Awaiting Collection') {
      // Filtered views (Pending/Confirmed/Cancelled) are collections only.
      // Copy before sorting -  filtered is a memoized array, never mutate it.
      list = [...filtered]
    } else {
      const q = search.toLowerCase()
      const queueRows = assignedInvoices
        .filter((ar) => {
          if (isCollectorUser && userCollectorId && String(ar.collector_id) !== String(userCollectorId)) {
            return false
          }
          if (collectorFilter !== 'all' && String(ar.collector_id) !== String(collectorFilter)) {
            return false
          }
          const bal = Number(ar.balance ?? ar.remaining_balance ?? 0)
          if (bal <= 0) return false // fully paid — skip
          if (overdueOnly && !isOverdueAR(ar)) return false
          if (!search) return true
          return (
            ar.invoice_number?.toLowerCase().includes(q) ||
            ar.customer_name?.toLowerCase().includes(q) ||
            (ar.collector_name || collectorName(ar.collector_id))?.toLowerCase().includes(q)
          )
        })
        .map((ar) => ({ ...ar, _isQueue: true, _qKey: `q-${ar.ar_id ?? ar.id}` }))

      list = statusFilter === 'Awaiting Collection' ? queueRows : [...queueRows, ...filtered]
    }

    if (sortBy === 'collector') {
      list.sort((a, b) => {
        const nameA = (a.collector_name || collectorName(a.collector_id) || '').toLowerCase()
        const nameB = (b.collector_name || collectorName(b.collector_id) || '').toLowerCase()
        return sortDir === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
      })
    } else if (sortBy === 'amount') {
      list.sort((a, b) => {
        const amtA = Number(a._isQueue ? (a.balance ?? a.remaining_balance ?? 0) : (a.amount_received ?? 0))
        const amtB = Number(b._isQueue ? (b.balance ?? b.remaining_balance ?? 0) : (b.amount_received ?? 0))
        return sortDir === 'asc' ? amtA - amtB : amtB - amtA
      })
    } else if (sortBy === 'date') {
      list.sort((a, b) => {
        // Keep queue items prominent at the top unless sorting explicitly
        if (a._isQueue !== b._isQueue) return a._isQueue ? -1 : 1
        const dateA = a._isQueue ? (a.due_date || a.invoice_date || '') : (a.collection_date || '')
        const dateB = b._isQueue ? (b.due_date || b.invoice_date || '') : (b.collection_date || '')
        return sortDir === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA)
      })
    }

    return list
  }, [assignedInvoices, filtered, statusFilter, overdueOnly, collectorFilter, sortBy, sortDir, trashed, search, collectors, isCollectorUser, userCollectorId])

  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [search, statusFilter, collectorFilter, sortBy, sortDir, trashed, overdueOnly])

  // Global search / General Ledger jump navigates here with a highlightId
  // (and, since this table is filtered client-side over the fetched page, a
  // highlightSearch seed) whenever a collection record is clicked elsewhere.
  const { highlightedId, highlightSearch } = useHighlightRow()
  useEffect(() => {
    if (highlightSearch == null) return
    setSearch(highlightSearch)
    setStatusFilter('all')
    setTrashed(false)
    setOverdueOnly(false)
    setPage(1)
  }, [highlightSearch])

  const totalPages = Math.max(1, Math.ceil(mergedRows.length / PAGE_SIZE))
  const paginated  = useMemo(() => mergedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [mergedRows, page])
  const rangeStart = mergedRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(page * PAGE_SIZE, mergedRows.length)

  const stats = useMemo(() => {
    const awaitingCount = assignedInvoices.filter((ar) => {
      if (isCollectorUser && userCollectorId && String(ar.collector_id) !== String(userCollectorId)) return false
      if (collectorFilter !== 'all' && String(ar.collector_id) !== String(collectorFilter)) return false
      return Number(ar.balance ?? ar.remaining_balance ?? 0) > 0
    }).length

    // Always the live set: cards describe working records, never the trash.
    const relevantCollections = liveCollections.filter((c) => {
      if (collectorFilter !== 'all' && String(c.collector_id) !== String(collectorFilter)) return false
      return true
    })

    return {
      total:     relevantCollections.length,
      awaiting:  awaitingCount,
      collected: relevantCollections.filter((c) => c.status === 'Confirmed').reduce((s, c) => s + c.amount_received, 0),
      pending:   relevantCollections.filter((c) => c.status === 'Pending').length,
    }
  }, [liveCollections, assignedInvoices, isCollectorUser, userCollectorId, collectorFilter])

  // -------------------------------------------------------------------------
  // Modal helpers
  // -------------------------------------------------------------------------
  const openAdd = () => {
    setIsCollectLocked(false)
    const defaultArId = (isCollectorUser && userCollectorId)
      ? (availableArRecords[0]?._key ?? '')
      : (arRecords[0]?._key ?? '')
    const defaultCollectorId = (isCollectorUser && userCollectorId)
      ? userCollectorId
      : (collectors[0]?._key ?? '')

    setForm({
      ...EMPTY_FORM,
      // Use _key (normalised) for the initial value so the dropdown
      // matches on first render  -  arRecords[0]._key is ar_id for AR.
      ar_id:           defaultArId,
      collector_id:    defaultCollectorId,
      cash_account_id: cashAccounts[0]?._key ?? '',
      reference_number: getNextReferenceNo(liveCollections),
    })
    setFormError('')
    setFieldErrors({})
    setDateErrors({ collection_date: '' })
    setProofFile(null)
    setModalMode('add')
  }

  // Pre-fills the Add Collection form directly from an assigned AR invoice row.
  // The invoice and collector are locked to prevent accidental alterations.
  const openCollect = (ar) => {
    const bal = Number(ar.balance ?? ar.remaining_balance ?? 0)
    setIsCollectLocked(true)
    setForm({
      ...EMPTY_FORM,
      ar_id:            String(ar.ar_id ?? ar.id ?? ''),
      collector_id:     String(ar.collector_id ?? ''),
      cash_account_id:  cashAccounts[0]?._key ?? '',
      reference_number: getNextReferenceNo(liveCollections),
      collection_date:  new Date().toISOString().split('T')[0],
      amount_received:  bal > 0 ? String(bal) : '',
    })
    setFormError('')
    setFieldErrors({})
    setDateErrors({ collection_date: '' })
    setProofFile(null)
    setModalMode('add')
  }

  // Deep-link handling:
  // 1. /?new=1 opens the create form directly
  // 2. /?status=Awaiting+Collection (or Pending, Confirmed) sets the status filter
  // 3. /?search=... sets the search query
  // 4. /?overdue=1 (used by the Collector dashboard's "Overdue Invoices" card)
  //    filters the awaiting-collection queue down to past-due invoices.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    let shouldUpdateParams = false
    const next = new URLSearchParams(searchParams)

    if (searchParams.get('new') === '1') {
      openAdd()
      next.delete('new')
      shouldUpdateParams = true
    }

    const overdueParam = searchParams.get('overdue')
    if (overdueParam === '1') {
      setOverdueOnly(true)
      setStatusFilter('Awaiting Collection')
      setTrashed(false)
    }

    const statusParam = searchParams.get('status')
    if (statusParam) {
      if (statusParam === 'Awaiting Confirmation') setStatusFilter('Pending')
      else setStatusFilter(statusParam)
      setTrashed(false)
    }

    const searchParam = searchParams.get('search')
    if (searchParam) {
      setSearch(searchParam)
    }

    if (shouldUpdateParams) {
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const openEdit = (c) => {
    if (!c || ['Confirmed', 'Cancelled'].includes(c.status)) return
    setIsCollectLocked(false)
    setForm({
      ar_id:            c.ar_id ?? '',
      collector_id:     c.collector_id ?? '',
      receipt_number:   c.receipt_number   ?? '',
      collection_date:  c.collection_date  ?? '',
      amount_received:  c.amount_received  ?? '',
      payment_method:   c.payment_method   ?? 'Cash',
      reference_number: c.reference_number ?? '',
      cash_account_id:  c.cash_account_id ?? '',
      status:           c.status,
      remarks:          c.remarks          ?? '',
    })
    setFormError('')
    setFieldErrors({})
    setDateErrors({ collection_date: '' })
    setProofFile(null)
    setModalMode(c)
  }

  const closeModal  = () => { setModalMode(null); setIsCollectLocked(false); setFormError(''); setFieldErrors({}); setDateErrors({ collection_date: '' }); setProofFile(null) }
  const openDetail  = (c) => {
    setDetailRecord(c)
    setAuditLogs([])
    setAuditLogsError(null)
    if (!canViewAuditLogs) {
      setAuditLogsLoading(false)
      return
    }
    setAuditLogsLoading(true)
    apiFetch(`/api/audit-logs?module=Collections&record_id=${c.id}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setAuditLogs(json.data ?? [])
        else setAuditLogsError(json.message)
      })
      .catch((err) => setAuditLogsError(err.message))
      .finally(() => setAuditLogsLoading(false))
  }
  const closeDetail = () => { setDetailRecord(null); setAuditLogs([]); setAuditLogsError(null) }
  const openConfirm = (c) => { setCheckCleared(false); setConfirmTarget(c); setActionError('') }
  const closeConfirm = () => { setConfirmTarget(null); setActionError('') }
  const openCancel  = (c) => { setCancelTarget(c); setCancelRemarks(''); setActionError('') }
  const closeCancel = () => { setCancelTarget(null); setCancelRemarks(''); setActionError('') }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = {}

    const arId = Number(form.ar_id)
    if (!form.ar_id || isNaN(arId) || arId <= 0) {
      errors.ar_id = 'Please select an invoice.'
    }

    const collectorId = Number(form.collector_id)
    if (!form.collector_id || isNaN(collectorId) || collectorId <= 0) {
      errors.collector_id = 'Please select a collector.'
    }

    const cashAccId = Number(form.cash_account_id)
    if (!form.cash_account_id || isNaN(cashAccId) || cashAccId <= 0) {
      errors.cash_account_id = 'Please select a cash account.'
    }

    if (!form.receipt_number?.trim()) {
      errors.receipt_number = 'Receipt number is required.'
    }

    const todayStr = new Date().toISOString().split('T')[0]
    if (!form.collection_date) {
      errors.collection_date = 'Collection date is required.'
    } else if (form.collection_date < '2017-01-01') {
      errors.collection_date = 'Date is out of range.'
    } else if (form.collection_date > todayStr) {
      errors.collection_date = 'Collection date cannot be in the future.'
    }

    const amt = Number(form.amount_received)
    const selectedAr = arInfo(arId)
    const maxBalance = selectedAr ? Number(selectedAr.balance ?? selectedAr.remaining_balance ?? Infinity) : Infinity

    if (!form.amount_received) {
      errors.amount_received = 'Amount received is required.'
    } else if (isNaN(amt) || amt < MIN_COLLECTION_AMOUNT) {
      errors.amount_received = `Amount received must be at least ${formatBaseAmount(MIN_COLLECTION_AMOUNT)}.`
    } else if (amt > maxBalance) {
      errors.amount_received = `Amount received exceeds invoice remaining balance of ${formatBaseAmount(maxBalance)}.`
    }

    if (form.reference_number && form.reference_number.trim()) {
      const trimmedRef = form.reference_number.trim().toLowerCase()
      const dup = liveCollections.find((c) => {
        if (modalMode !== 'add' && c.id === modalMode?.id) return false
        return (c.reference_number || '').trim().toLowerCase() === trimmedRef
      })
      if (dup) {
        errors.reference_number = `Reference number is already used by collection receipt ${dup.receipt_number}.`
      }
    }

    const isAdd = modalMode === 'add'
    if (isAdd) {
      if (!proofFile) {
        errors.proof = 'Proof of receipt / payment (deposit slip, bank transfer screenshot, or check image) is strictly required before submitting for confirmation.'
      } else {
        const hostError = cannotFitHostLimit(proofFile)
        if (hostError) {
          errors.proof = hostError
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setFormError('')
    setSubmitting(true)
    try {
      if (isAdd) {
        const formData = new FormData()
        formData.append('ar_id', String(arId))
        formData.append('collector_id', String(collectorId))
        formData.append('cash_account_id', String(cashAccId))
        formData.append('receipt_number', form.receipt_number.trim())
        formData.append('collection_date', form.collection_date)
        formData.append('amount_received', String(form.amount_received))
        formData.append('payment_method', form.payment_method)
        if (form.reference_number?.trim()) {
          formData.append('reference_number', form.reference_number.trim())
        }
        if (form.remarks?.trim()) {
          formData.append('remarks', form.remarks.trim())
        }
        if (proofFile) {
          const compressed = await compressImageToUploadable(proofFile)
          formData.append('proof', compressed)
        }

        const res = await apiFetch('/api/collections', {
          method: 'POST',
          body: formData,
        })
        const json = await res.json()
        if (!json.success) {
          if (json.errors) {
            const fe = {}
            for (const [k, v] of Object.entries(json.errors)) {
              fe[k] = Array.isArray(v) ? v[0] : v
            }
            setFieldErrors(fe)
          }
          setFormError(json.errors ? Object.values(json.errors)[0]?.[0] : json.message || 'Something went wrong.')
          return
        }
        closeModal()
        refetch()
      } else {
        const payload = {
          ar_id: arId,
          collector_id: collectorId,
          cash_account_id: cashAccId,
          receipt_number: form.receipt_number.trim(),
          collection_date: form.collection_date,
          amount_received: Number(form.amount_received),
          payment_method: form.payment_method,
          reference_number: form.reference_number?.trim() || null,
          remarks: form.remarks?.trim() || null,
        }
        const res = await apiFetch(`/api/collections/${modalMode.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!json.success) {
          if (json.errors) {
            const fe = {}
            for (const [k, v] of Object.entries(json.errors)) {
              fe[k] = Array.isArray(v) ? v[0] : v
            }
            setFieldErrors(fe)
          }
          setFormError(json.errors ? Object.values(json.errors)[0]?.[0] : json.message || 'Something went wrong.')
          return
        }
        closeModal()
        refetch()
      }
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
  const handleVerifyReceipt = async () => {
    if (!verifyTarget || actioning || !receiptVerified) return
    setActioning(true); setActionError('')
    try {
      const res = await apiFetch('/api/collections/' + verifyTarget.id + '/verify-receipt', {
        method: 'PATCH', body: JSON.stringify({ receipt_verified: receiptVerified, check_cleared: checkCleared }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(Object.values(json.errors ?? {})[0]?.[0] || json.message || 'Unable to verify receipt.')
      setVerifyTarget(null); refetch()
    } catch (error) { setActionError(error.message) }
    finally { setActioning(false) }
  }

  const handleConfirm = async () => {
    if (!confirmTarget || actioning || !confirmTarget.deposit_date || !confirmTarget.has_proof || (confirmTarget.payment_method === 'Check' && !checkCleared)) return
    setActioning(true)
    setActionError('')
    try {
      const res  = await apiFetch(`/api/collections/${confirmTarget.id}/confirm`, { method: 'PATCH', body: JSON.stringify({check_cleared:checkCleared}) })
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
  // Print (BIR-compliant 2-Up Duplicate Receipt: Customer Copy + Collector Copy)
  // -------------------------------------------------------------------------
  const handlePrint = (c) => {
    const info = arInfo(c.ar_id)
    const customer = c.customer_name || info?.customer_name || '—'
    const collector = c.collector_name || collectorName(c.collector_id) || profile?.name
    const invoiceNo = c.invoice_number || info?.invoice_number || '—'
    const accName = c.cash_account_name || accountName(c.cash_account_id) || '—'

    printDuplicateReceipt({
      company,
      profile,
      collection: c,
      customerName: customer,
      collectorName: collector,
      invoiceNumber: invoiceNo,
      accountName: accName,
    })
  }

  const statCards = [
    { key: 'total',     label: 'All Records',          value: stats.total + stats.awaiting,                  icon: HandCoins, iconBg: 'bg-primary/15',                        iconColor: 'text-primary-dark',                          isActive: statusFilter === 'all'                 && !trashed, onClick: () => { setStatusFilter('all');                 setTrashed(false); setOverdueOnly(false) } },
    { key: 'awaiting',  label: 'Awaiting Collection',  value: stats.awaiting,                             icon: Users,     iconBg: 'bg-violet-50 dark:bg-violet-500/10',     iconColor: 'text-violet-600 dark:text-violet-400',     isActive: statusFilter === 'Awaiting Collection' && !trashed, onClick: () => { setStatusFilter('Awaiting Collection'); setTrashed(false); setOverdueOnly(false) } },
    { key: 'collected', label: 'Confirmed Amount',     value: formatCurrency(stats.collected),              icon: Wallet,    iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', isActive: statusFilter === 'Confirmed'            && !trashed, onClick: () => { setStatusFilter('Confirmed');           setTrashed(false); setOverdueOnly(false) } },
    { key: 'pending',   label: 'Unconfirmed Receipts', value: stats.pending,                             icon: Clock3,    iconBg: 'bg-amber-50 dark:bg-amber-500/10',     iconColor: 'text-amber-600 dark:text-amber-400',     isActive: statusFilter === 'Pending'             && !trashed, onClick: () => { setStatusFilter('Pending');             setTrashed(false); setOverdueOnly(false) } },
    { key: 'archived',  label: 'Archived',             value: trashedTotal,                               icon: Archive,   iconBg: 'bg-slate-100 dark:bg-slate-800',       iconColor: 'text-slate-500 dark:text-slate-400',     isActive: trashed,                                            onClick: () => { setTrashed(true);                   setStatusFilter('all'); setOverdueOnly(false) } },
  ]

  const isModalOpen = modalMode !== null
  const isEditing   = modalMode !== null && modalMode !== 'add'

  return (
    <div className="space-y-5 animate-fadeIn">
      <Breadcrumb items={crumbs} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-xs text-muted">Customer collections automatically synced from assigned accounts receivable invoices.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isCollectorUser && (hasPermission('collections.manage') || canConfirm) && <Button onClick={() => setBatchOpen(true)}>Deposit Batches</Button>}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-border bg-surface text-muted shadow-sm">
            <span className="h-2 w-2 rounded-full bg-status-success animate-pulse" />
            Live Synced
          </span>
        </div>
      </div>

      {isAdmin && canConfirm && <PendingDepositNotice revision={batchRevision} onReview={() => setBatchOpen(true)} />}

      {lookupErrors.length > 0 && (
        <div className="rounded-lg border border-status-warning-border bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
          Some dropdowns may be incomplete: {lookupErrors.join(' · ')}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <button key={card.key} type="button" onClick={card.onClick}
              className={`${PANEL} ${PANEL_PAD} flex items-center gap-2.5 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${card.isActive ? 'ring-2 ring-primary/50 border-primary/50' : ''}`}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon size={15} className={card.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">{card.label}</p>
                <p className="text-lg font-bold text-ink"><KpiValue loading={loading || queueLoading}>{card.value}</KpiValue></p>
              </div>
            </button>
          )
        })}
      </div>

      <CollectionEfficiencyPanel />

      {/* Search / filter */}
      <div className={`${PANEL} ${PANEL_PAD}`}>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <div className="relative flex-1 min-w-0">
            <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Search</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setOverdueOnly(false); setSearch(e.target.value) }}
                placeholder="Search by receipt no., customer, or collector..."
                className={`${INPUT} pl-9 pr-9`}
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setOverdueOnly(false); setSearch('') }}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-border hover:text-ink transition-colors duration-150"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="w-full sm:w-64 shrink-0">
            <label htmlFor="collection-status-filter" className="mb-2 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Status</label>
            <select id="collection-status-filter"
              value={statusFilter}
              onChange={(e) => { setOverdueOnly(false); setStatusFilter(e.target.value) }}
              className={INPUT}
            >
              <option value="all">All Statuses</option>
              <optgroup label="Collection stages">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
              </optgroup>
              <optgroup label="Quick filters">
                <option value="Pending">All unconfirmed receipts</option>
                <option value="In deposit batch">In deposit batch</option>
              </optgroup>
            </select>
          </div>
          {!isCollectorUser && (
            <div className="w-full sm:w-52 shrink-0">
              <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Collector</label>
              <select
                value={collectorFilter}
                onChange={(e) => setCollectorFilter(e.target.value)}
                className={INPUT}
              >
                <option value="all">All Collectors</option>
                {collectors.map((col) => (
                  <option key={col._key} value={col._key}>
                    {col.first_name} {col.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              iconPosition="left"
              onClick={() => { refetch(); refetchQueue() }}
              title="Refresh collections and assigned invoice queue"
            >
              Refresh
            </Button>
            {(search || statusFilter !== 'all' || collectorFilter !== 'all') && (
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                iconPosition="left"
                onClick={() => { setSearch(''); setStatusFilter('all'); setCollectorFilter('all'); setOverdueOnly(false) }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={PANEL}>
        <div className="overflow-hidden rounded-t-xl">
          <ResponsiveTable minTableWidth={640} className="w-full text-xs">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                <th
                  onClick={() => {
                    if (sortBy === 'date') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                    else { setSortBy('date'); setSortDir('desc') }
                  }}
                  className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap cursor-pointer hover:text-ink transition-colors select-none"
                  title="Click to sort by date"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>Receipt / Date</span>
                    {sortBy === 'date' && <span className="text-primary font-bold">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Invoice / Customer</th>
                <th
                  onClick={() => {
                    if (sortBy === 'collector') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                    else { setSortBy('collector'); setSortDir('asc') }
                  }}
                  className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap cursor-pointer hover:text-ink transition-colors select-none"
                  title="Click to sort by collector"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>Collector</span>
                    {sortBy === 'collector' && <span className="text-primary font-bold">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th
                  onClick={() => {
                    if (sortBy === 'amount') setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                    else { setSortBy('amount'); setSortDir('desc') }
                  }}
                  className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap cursor-pointer hover:text-ink transition-colors select-none"
                  title="Click to sort by amount"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>Amount</span>
                    {sortBy === 'amount' && <span className="text-primary font-bold">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </div>
                </th>
                <th className="text-left font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Status</th>
                <th className="text-right font-semibold text-muted text-xs uppercase tracking-wide px-4 py-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton columns={6} />
              ) : mergedRows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">No collections match your filters.</td></tr>
              ) : paginated.map((row) => {
                // ── Queue row (AR invoice awaiting collection) ─────────────
                if (row._isQueue) {
                  // Render every counted queue record for all authorized viewers.
                  const ar = row
                  const bal = Number(ar.balance ?? ar.remaining_balance ?? 0)
                  const isOverdue = isOverdueAR(ar)
                  return (
                    <tr key={ar._qKey} className="border-b border-border last:border-0 bg-violet-50/20 dark:bg-violet-500/[0.04] hover:bg-violet-50/40 dark:hover:bg-violet-500/[0.08] transition-colors duration-150">
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                          Pending Collection
                        </span>
                        <p className="text-xs text-muted mt-1">
                          {isOverdue
                            ? <span className="text-status-danger font-medium">Due {formatDate(ar.due_date)} · Overdue</span>
                            : ar.due_date ? `Due ${formatDate(ar.due_date)}` : 'No due date'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="font-medium text-ink">{ar.invoice_number}</p>
                        <p className="text-xs text-muted">{ar.customer_name ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-sm text-ink">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                          {ar.collector_name || collectorName(ar.collector_id)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-semibold tabular-nums">
                        <span className={isOverdue ? 'text-status-danger' : 'text-ink'}>
                          {formatCurrency(bal)}
                        </span>
                        <p className="text-[10px] text-muted font-normal">balance to collect</p>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
                          Awaiting Collection
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={!hasPermission('collections.manage')}
                          onClick={() => openCollect(ar)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-black hover:bg-primary-hover active:scale-95 transition-all duration-150 shadow-sm"
                        >
                          <HandCoins size={13} />
                          Collect
                        </button>
                      </td>
                    </tr>
                  )
                }
                // ── Regular collection row ─────────────────────────────────
                const c = row
                const info = arInfo(c.ar_id)
                return (
                  <tr key={c.id} data-row-id={c.id} className={`border-b border-border last:border-0 transition-colors duration-150 ${highlightedId === c.id ? 'bg-primary/10' : 'hover:bg-bg'}`}>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-ink">{c.receipt_number}</p>

                      </div>
                      <p className="text-xs text-muted">{formatDate(c.collection_date)} · {c.cash_account_name || accountName(c.cash_account_id)}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <p className="text-ink">{c.invoice_number || info?.invoice_number}</p>
                      <p className="text-xs text-muted">{info?.customer_name}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink">{c.collector_name || collectorName(c.collector_id)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-medium tabular-nums text-ink">{formatCurrency(c.amount_received)}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[collectionStage(c)] ?? 'bg-slate-100 text-slate-600'}`}>
                        {c.deposit_batch_id && c.status === 'Pending' ? 'In deposit batch' : STATUS_LABELS[collectionStage(c)] || collectionStage(c)}
                      </span>
                      {c.receipt_journal_entry_id && c.status === 'Pending' && <p className="mt-1 text-xs text-status-success">Receipt verified - Undeposited Funds</p>}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <RowActions>
                        {c.status === 'Pending' && !c.receipt_journal_entry_id && !c.deposit_batch_id && !c.deleted_at && isAdmin && canConfirm && (
                          <Button size="sm" variant="secondary" disabled={Number(c.created_by) === Number(profile?.id)} onClick={() => { setVerifyTarget(c); setReceiptVerified(false); setCheckCleared(false); setActionError('') }}>Verify receipt</Button>
                        )}
                        {c.status === 'Pending' && !c.deposit_batch_id && !c.deposit_date && isAdmin && canConfirm && !c.deleted_at && <Button size="sm" variant="secondary" onClick={() => openCancel(c)}>Cancel receipt</Button>}
                        {c.status === 'Pending' && !c.deposit_batch_id && !c.deposit_date && hasPermission('collections.manage') && !c.deleted_at && <Button size="sm" onClick={() => setDepositTarget(c)}>Record Deposit</Button>}
                        {c.status === 'Pending' && !c.deposit_batch_id && !!c.deposit_date && canConfirm && (
                          <div className="flex items-center gap-1 mr-1 pr-1 border-r border-border shrink-0">
                            {profile?.id && c.created_by && Number(c.created_by) === Number(profile.id) ? (
                              <Tooltip label="Separation of duties: You cannot confirm a collection you recorded yourself.">
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600/50 text-white cursor-not-allowed opacity-60 shrink-0"
                                >
                                  <Lock size={13} strokeWidth={2.25} />
                                  Confirm
                                </button>
                              </Tooltip>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openConfirm(c)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-all duration-150 active:scale-95 shrink-0"
                              >
                                <CheckCircle2 size={13} strokeWidth={2.25} />
                                Confirm
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openCancel(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 shadow-sm transition-all duration-150 active:scale-95 shrink-0"
                            >
                              <XCircle size={13} strokeWidth={2.25} />
                              Reject
                            </button>
                          </div>
                        )}
                        <Tooltip label="View full record" align="start">
                          <button type="button" onClick={() => openDetail(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"><Info size={15} /></button>
                        </Tooltip>
                        {!c.deleted_at && (
                        <Tooltip label="Print receipt" align="start">
                          <button type="button" onClick={() => handlePrint(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"><Printer size={15} /></button>
                        </Tooltip>
                        )}
                        <DocumentAction label={c.receipt_number} onClick={() => setProofTarget(c)} />
                        {c.status === 'Pending' && !c.receipt_journal_entry_id && !c.deleted_at && (
                          <Tooltip label="Edit collection" align="start">
                            <button type="button" onClick={() => openEdit(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150"><Pencil size={15} /></button>
                          </Tooltip>
                        )}
                        {isAdmin && (c.deleted_at || ['Confirmed', 'Cancelled'].includes(c.status)) && (
                          <Tooltip label={c.deleted_at ? 'Restore collection' : 'Archive collection'} align="end">
                            <button type="button" onClick={() => handleArchive(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink transition-colors duration-150">
                              {c.deleted_at ? <RotateCcw size={15} /> : <Archive size={15} />}
                            </button>
                          </Tooltip>
                        )}
                        {c.deleted_at && (
                          <>
                          <RetentionCountdown deletedAt={c.deleted_at} compact />
                          {isAdmin && (
                            <DeletePermanentButton
                              endpoint={`/api/collections/${c.id}/permanent`}
                              label="collection"
                              name={c.customer_name || ''}
                              onDeleted={refetch}
                            />
                          )}
                          </>
                        )}
                      </RowActions>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </ResponsiveTable>
        </div>

        {!loading && mergedRows.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            total={mergedRows.length}
            label="records"
            showRange
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            bordered
          />
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal open={isModalOpen} onClose={closeModal} title={isEditing ? 'Edit Collection' : 'Add Collection'} size="lg"
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
            <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{formError}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Invoice  -  uses _key (= ar_id) as option value */}
            <div>
              <label className={LABEL}>Invoice <span className="text-status-danger">*</span></label>
              <select
                value={form.ar_id}
                disabled={isCollectLocked || (modalMode !== null && modalMode !== 'add')}
                onChange={(e) => {
                  const arId = e.target.value
                  const selectedAr = arInfo(arId)
                  setForm((f) => ({
                    ...f,
                    ar_id: arId,
                    collector_id: (isCollectorUser && userCollectorId)
                      ? userCollectorId
                      : ((selectedAr?.collector_id && selectedAr.collector_id > 0) ? String(selectedAr.collector_id) : f.collector_id),
                  }))
                  setFieldErrors((fe) => ({ ...fe, ar_id: '', collector_id: '' }))
                }}
                className={`${INPUT} ${(isCollectLocked || (modalMode !== null && modalMode !== 'add')) ? 'opacity-70 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : ''} ${fieldErrors.ar_id ? 'border-status-danger-border' : ''}`}
              >
                <option value="">Select invoice…</option>
                {availableArRecords.map((a) => {
                  const bal = a.balance ?? a.remaining_balance
                  return (
                    <option key={a._key} value={a._key}>
                      {a.invoice_number} — {a.customer_name} {bal !== undefined ? `(Bal: ${formatBaseAmount(bal)})` : ''}
                    </option>
                  )
                })}
              </select>
              {(isCollectLocked || (modalMode !== null && modalMode !== 'add')) && (
                <p className="mt-1 text-[11px] text-muted">Locked to selected invoice.</p>
              )}
              {fieldErrors.ar_id && <p className="mt-1 text-xs text-status-danger">{fieldErrors.ar_id}</p>}
            </div>

            {/* Collector  -  uses _key (= collector_id) as option value */}
            <div>
              <label className={LABEL}>Collector <span className="text-status-danger">*</span></label>
              <select
                value={form.collector_id}
                disabled={isCollectLocked || (isCollectorUser && !!userCollectorId)}
                onChange={(e) => { setForm((f) => ({ ...f, collector_id: e.target.value })); setFieldErrors((fe) => ({ ...fe, collector_id: '' })) }}
                className={`${INPUT} ${(isCollectLocked || (isCollectorUser && userCollectorId)) ? 'opacity-70 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : ''} ${fieldErrors.collector_id ? 'border-status-danger-border' : ''}`}
              >
                <option value="">Select collector…</option>
                {collectors.map((c) => (
                  <option key={c._key} value={c._key}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
              {isCollectLocked ? (
                <p className="mt-1 text-[11px] text-muted">Locked to assigned collector.</p>
              ) : (isCollectorUser && userCollectorId) ? (
                <p className="mt-1 text-[11px] text-muted">Auto-locked to your collector profile.</p>
              ) : null}
              {fieldErrors.collector_id && <p className="mt-1 text-xs text-status-danger">{fieldErrors.collector_id}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Booklet / Issued Receipt Number <span className="text-status-danger">*</span></label>
              <input
                type="text"
                value={form.receipt_number}
                readOnly={modalMode !== 'add'}
                onChange={(e) => { setForm((f) => ({ ...f, receipt_number: e.target.value })); setFieldErrors((fe) => ({ ...fe, receipt_number: '' })) }}
                className={`${INPUT} ${fieldErrors.receipt_number ? 'border-status-danger-border' : ''}`}
                placeholder="OR-10021"
              />
              <p className="mt-1 text-xs text-muted">Use the exact pre-numbered receipt given to the customer. Do not generate a second number. Saved receipt numbers cannot be replaced.</p>
              {fieldErrors.receipt_number && <p className="mt-1 text-xs text-status-danger">{fieldErrors.receipt_number}</p>}
            </div>
            <div>
              <label className={LABEL}>Collection Date <span className="text-status-danger">*</span></label>
              <input
                type="date"
                min="2017-01-01"
                max={new Date().toISOString().split('T')[0]}
                value={form.collection_date}
                onChange={(e) => { setForm((f) => ({ ...f, collection_date: e.target.value })); setFieldErrors((fe) => ({ ...fe, collection_date: '' })) }}
                onBlur={(e) => validateDate('collection_date', e.target.value)}
                className={`${INPUT} scheme-light dark:scheme-dark ${dateErrors.collection_date || fieldErrors.collection_date ? 'border-status-danger-border' : ''}`}
              />
              {(dateErrors.collection_date || fieldErrors.collection_date) && <p className="mt-1 text-xs text-status-danger">{dateErrors.collection_date || fieldErrors.collection_date}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              {(() => {
                const currentAr = arInfo(form.ar_id)
                const currentBal = currentAr ? Number(currentAr.balance ?? currentAr.remaining_balance ?? 0) : null
                return (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-muted">Amount Received <span className="text-status-danger">*</span></label>
                      {currentBal !== null && (
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted">
                            Highest allowed: <span className="font-medium tabular-nums text-ink">{formatBaseAmount(currentBal)}</span>
                          </span>
                          {currentBal > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setForm((f) => ({ ...f, amount_received: String(currentBal) }))
                                setFieldErrors((fe) => ({ ...fe, amount_received: '' }))
                              }}
                              className="text-[11px] font-medium text-primary hover:underline"
                            >
                              Pay Full
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min={MIN_COLLECTION_AMOUNT}
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
                        } else if (Number(val) < MIN_COLLECTION_AMOUNT) {
                          setFieldErrors((fe) => ({ ...fe, amount_received: `Amount received must be at least ${formatBaseAmount(MIN_COLLECTION_AMOUNT)}.` }))
                        } else if (currentBal !== null && Number(val) > currentBal) {
                          setFieldErrors((fe) => ({
                            ...fe,
                            amount_received: `Amount exceeds invoice balance (${formatBaseAmount(currentBal)}).`,
                          }))
                        }
                      }}
                      className={`${INPUT} ${fieldErrors.amount_received ? 'border-status-danger-border' : ''}`}
                      placeholder={minHint(MIN_COLLECTION_AMOUNT)}
                    />
                    {fieldErrors.amount_received && <p className="mt-1 text-xs text-status-danger">{fieldErrors.amount_received}</p>}
                  </>
                )
              })()}
            </div>
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} className={INPUT}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Cash account  -  uses _key (= id) as option value */}
            <div>
              <label className={LABEL}>Deposit To (Cash Account) <span className="text-status-danger">*</span></label>
              <select
                value={form.cash_account_id}
                onChange={(e) => { setForm((f) => ({ ...f, cash_account_id: e.target.value })); setFieldErrors((fe) => ({ ...fe, cash_account_id: '' })) }}
                className={`${INPUT} ${fieldErrors.cash_account_id ? 'border-status-danger-border' : ''}`}
              >
                <option value="">Select account…</option>
                {cashAccounts.map((a) => (
                  <option key={a._key} value={a._key}>
                    {a.account_name}
                  </option>
                ))}
              </select>
              {fieldErrors.cash_account_id && <p className="mt-1 text-xs text-status-danger">{fieldErrors.cash_account_id}</p>}
              {cashAccounts.length === 0 && (
                <p className="mt-1 text-xs text-status-warning">
                  No cash accounts found. Please add a cash account in Master Data &gt; Cash Accounts first.
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={LABEL}>Reference Number</label>
                {modalMode === 'add' && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextRef = getNextReferenceNo(collections)
                      setForm((f) => ({ ...f, reference_number: nextRef }))
                      setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                    }}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Auto-generate
                  </button>
                )}
              </div>
              <input
                type="text"
                value={form.reference_number}
                onChange={(e) => {
                  const val = e.target.value
                  setForm((f) => ({ ...f, reference_number: val }))
                  const trimmed = val.trim().toLowerCase()
                  if (trimmed) {
                    const dup = liveCollections.find((c) => {
                      if (modalMode !== 'add' && c.id === modalMode?.id) return false
                      return (c.reference_number || '').trim().toLowerCase() === trimmed
                    })
                    if (dup) {
                      setFieldErrors((fe) => ({ ...fe, reference_number: `Reference number is already used by collection receipt ${dup.receipt_number}.` }))
                    } else {
                      setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                    }
                  } else {
                    setFieldErrors((fe) => ({ ...fe, reference_number: '' }))
                  }
                }}
                className={`${INPUT} ${fieldErrors.reference_number ? 'border-status-danger-border' : ''}`}
                placeholder="REF-COL-001"
              />
              {fieldErrors.reference_number && (
                <p className="mt-1 text-xs text-status-danger">
                  {fieldErrors.reference_number}
                </p>
              )}
            </div>
          </div>

          {/* Status is workflow-driven — always Pending on create,
              changed only via the Confirm / Cancel action buttons.
              Show it as a read-only badge when editing so the user
              can see the current state without being able to override it. */}
          {isEditing && (
            <div>
              <label className={LABEL}>Status</label>
              <div className="flex items-center gap-2 h-9">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[form.status] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {STATUS_LABELS[form.status] || form.status}
                </span>
                <span className="text-[11px] text-muted">Controlled by Confirm / Cancel actions.</span>
              </div>
            </div>
          )}

          <div>
            <label className={LABEL}>Remarks</label>
            <input type="text" value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} className={INPUT} placeholder="Optional notes" />
          </div>

          {/* Strictly require Proof of Receipt / Payment before submitting to Awaiting Confirmation */}
          {modalMode === 'add' && (
            <div>
              <label className={LABEL}>
                Proof of Receipt / Deposit Slip <span className="text-status-danger">*</span>
              </label>
              <div className={`relative border-2 border-dashed rounded-lg p-3.5 text-center transition-colors ${fieldErrors.proof ? 'border-status-danger-border bg-status-danger-bg' : proofFile ? 'border-primary/50 bg-primary/5 dark:bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                {proofFile ? (
                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Paperclip size={16} />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-semibold text-ink truncate">{proofFile.name}</p>
                        <p className="text-[11px] text-muted">{(proofFile.size / 1024).toFixed(1)} KB • Ready to upload</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProofFile(null)}
                      className="p-1 rounded-md text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      title="Remove file"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer block">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setProofFile(file)
                          setFieldErrors((fe) => ({ ...fe, proof: '' }))
                        }
                      }}
                      className="hidden"
                    />
                    <Upload size={22} className="mx-auto text-muted mb-1.5" />
                    <p className="text-xs font-medium text-ink">
                      Click to upload proof of payment <span className="text-primary underline">or browse</span>
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">
                      Bank deposit slip, transfer screenshot, or check image (PDF, JPG, PNG up to 10MB)
                    </p>
                  </label>
                )}
              </div>
              {fieldErrors.proof ? (
                <p className="mt-1.5 text-xs font-medium text-status-danger">{fieldErrors.proof}</p>
              ) : (
                <p className="mt-1 text-[11px] text-muted">
                  Strictly required: Finance mandates verified deposit or payment proof before queuing for confirmation.
                </p>
              )}
            </div>
          )}

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
            {detailRecord && (
              <Button
                variant="secondary"
                size="md"
                icon={Paperclip}
                onClick={() => {
                  const target = detailRecord
                  closeDetail()
                  setProofTarget(target)
                }}
              >
                Proof of Receipt
              </Button>
            )}
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
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[collectionStage(detailRecord)] ?? 'bg-slate-100 text-slate-600'}`}>{STATUS_LABELS[collectionStage(detailRecord)] || collectionStage(detailRecord)}</span>
            </div>

            {/* Proof of Receipt preview banner in details */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-slate-50 dark:bg-slate-900/40">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Paperclip size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink">Proof of Receipt</p>
                  <p className="text-[11px] text-muted">View attached files or upload new proof</p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={Paperclip}
                onClick={() => {
                  const target = detailRecord
                  closeDetail()
                  setProofTarget(target)
                }}
              >
                View Proof
              </Button>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Invoice"         value={detailRecord.invoice_number || arInfo(detailRecord.ar_id)?.invoice_number} />
                <DetailRow label="Collector"       value={detailRecord.collector_name || collectorName(detailRecord.collector_id)} />
                <DetailRow label="Collection Date" value={formatDate(detailRecord.collection_date)} />
                <DetailRow label="Receipt Verified" value={detailRecord.receipt_verified_at ? formatDateTime(detailRecord.receipt_verified_at) : 'Not separately verified'} />
                <DetailRow label="Deposit Confirmed" value={detailRecord.confirmed_at ? formatDateTime(detailRecord.confirmed_at) : 'Not recorded'} />
                <DetailRow label="Receipt Journal" value={detailRecord.receipt_journal_entry_id || 'None'} />
                <DetailRow label="Deposit Journal" value={detailRecord.deposit_journal_entry_id || 'None'} />
                <DetailRow label="Deposit Date" value={detailRecord.deposit_date ? formatDate(detailRecord.deposit_date) : 'Not deposited'} />
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

            {/* Related Activity & Audit Trail (Admin / users with audit-logs permission only) */}
            {canViewAuditLogs && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-ink">Related Activity & Audit Trail</p>
                  <span className="text-[11px] text-muted">
                    {auditLogsLoading ? 'Loading…' : `${auditLogs.length} event${auditLogs.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/30">
                  {auditLogsLoading && (
                    <ContentSkeleton />
                  )}
                  {!auditLogsLoading && auditLogsError && (
                    <p className="px-3 py-3 text-xs text-status-danger text-center">{auditLogsError}</p>
                  )}
                  {!auditLogsLoading && !auditLogsError && auditLogs.length === 0 && (
                    <p className="px-3 py-3 text-xs text-muted text-center">No audit logs recorded for this collection.</p>
                  )}
                  {!auditLogsLoading && !auditLogsError && auditLogs.map((log) => (
                    <div key={log.id} className="px-3 py-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink leading-relaxed">
                          {log.activity_description || log.action}
                        </span>
                        <span className="text-[11px] text-muted shrink-0 tabular-nums">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                      {log.user_name && (
                        <p className="text-[11px] text-muted mt-0.5">by <span className="font-medium text-ink">{log.user_name}</span></p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <DepositBatchesModal open={batchOpen} onClose={() => setBatchOpen(false)} onChanged={() => { refetch(); setBatchRevision(n => n + 1) }} cashAccounts={cashAccounts} canManage={hasPermission('collections.manage')} canConfirm={canConfirm} userId={profile?.id} />
      <RecordDepositModal record={depositTarget} onClose={() => setDepositTarget(null)} onSaved={refetch} onDocuments={record => {setDepositTarget(null);setProofTarget(record)}} />
      <Modal open={!!verifyTarget} onClose={() => !actioning && setVerifyTarget(null)} title="Verify collection receipt" size="lg"
        footer={<><Button variant="secondary" onClick={() => setVerifyTarget(null)} disabled={actioning}>Back</Button><Button onClick={handleVerifyReceipt} disabled={actioning || !receiptVerified || !verifyTarget?.has_proof || (verifyTarget?.payment_method === 'Check' && !checkCleared)}>{actioning ? 'Posting...' : 'Verify receipt'}</Button></>}>
        {verifyTarget && <div className="space-y-4">
          <p className="text-sm text-muted">Records this payment in Undeposited Funds and reduces the invoice balance. The bank balance changes only after deposit confirmation.</p>
          <DetailRow label="Receipt" value={verifyTarget.receipt_number} />
          <DetailRow label="Amount" value={formatCurrency(verifyTarget.amount_received)} />
          <DetailRow label="Receipt posting date" value={formatDate(verifyTarget.collection_date)} />
          <Button variant="secondary" onClick={() => setProofTarget(verifyTarget)}>{verifyTarget.has_proof ? 'Review receipt evidence' : 'Attach receipt evidence'}</Button>
          <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" className="mt-1" checked={receiptVerified} onChange={e => setReceiptVerified(e.target.checked)} />I verified the issued receipt, payer, invoice, and amount received.</label>
          {verifyTarget.payment_method === 'Check' && <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" className="mt-1" checked={checkCleared} onChange={e => setCheckCleared(e.target.checked)} />I verified bank clearance. Uncleared checks remain pending; cancel bounced checks with a reason.</label>}
          {actionError && <p className="text-sm text-status-danger" role="alert">{actionError}</p>}
        </div>}
      </Modal>
      {/* Confirm modal */}
      <Modal open={!!confirmTarget} onClose={closeConfirm} title="Confirm Collection"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeConfirm} disabled={actioning}>Back</Button>
            {confirmTarget && (
              <Button
                variant="secondary"
                size="md"
                icon={Paperclip}
                onClick={() => setProofTarget(confirmTarget)}
                disabled={actioning}
              >
                {confirmTarget.has_proof ? 'View Proof' : 'Upload Proof'}
              </Button>
            )}
            <Button
              variant="success"
              size="md"
              icon={CheckCircle2}
              onClick={handleConfirm}
              disabled={actioning || !confirmTarget?.has_proof || !confirmTarget?.deposit_date || (confirmTarget?.payment_method === 'Check' && !checkCleared)}
              loading={actioning}
              title={confirmTarget && !confirmTarget.has_proof ? 'Upload proof before confirming' : ''}
            >
              {actioning ? 'Confirming…' : 'Confirm Collection'}
            </Button>
          </>
        }
      >
        {confirmTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Confirmation posts the bank deposit on the deposit date. If the receipt is not yet verified, it also posts the collection to Undeposited Funds on the collection date. The invoice is settled only once.</p>
            {confirmTarget && !confirmTarget.has_proof && (
              <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-3 text-xs text-status-warning flex items-start gap-2.5">
                <AlertCircle size={18} className="shrink-0 text-status-warning mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-status-warning">Missing Proof of Receipt</p>
                  <p className="text-status-warning mt-0.5">
                    Finance internal controls strictly require an official proof of payment (deposit slip, bank transfer screenshot, or check scan) before confirmation.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const t = confirmTarget
                      closeConfirm()
                      setProofTarget(t)
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors"
                  >
                    <Paperclip size={13} />
                    Upload Proof of Receipt Now
                  </button>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-border divide-y divide-border">
              <div className="px-3 py-2">
                <DetailRow label="Receipt"         value={confirmTarget.receipt_number} />
                <DetailRow label="Invoice"         value={confirmTarget.invoice_number || arInfo(confirmTarget.ar_id)?.invoice_number} />
                <DetailRow label="Collector"       value={confirmTarget.collector_name || collectorName(confirmTarget.collector_id)} />
                <DetailRow label="Collection Date" value={formatDate(confirmTarget.collection_date)} />
                <DetailRow label="Deposit Date" value={confirmTarget.deposit_date ? formatDate(confirmTarget.deposit_date) : 'Not recorded'} />
              </div>
              <div className="px-3 py-2">
                <DetailRow label="Amount Received" value={formatCurrency(confirmTarget.amount_received)} />
                <DetailRow label="Payment Method"  value={confirmTarget.payment_method} />
                <DetailRow label="Deposit To"      value={confirmTarget.cash_account_name || accountName(confirmTarget.cash_account_id)} />
              </div>
            </div>
            {confirmTarget?.payment_method === 'Check' && <label className="flex gap-2 text-sm text-ink"><input type="checkbox" checked={checkCleared} disabled={actioning} onChange={e=>setCheckCleared(e.target.checked)} />I verified with the bank that this check has cleared.</label>}
            {actionError && (
              <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{actionError}</div>
            )}
          </div>
        )}
      </Modal>

      {/* Cancel modal */}
      <Modal open={!!cancelTarget} onClose={closeCancel} title="Cancel Collection"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={closeCancel} disabled={actioning}>Back</Button>
            <Button
              variant="danger"
              size="md"
              icon={XCircle}
              onClick={handleCancel}
              disabled={actioning}
              loading={actioning}
            >
              {actioning ? 'Cancelling…' : 'Cancel Collection'}
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{cancelTarget.receipt_journal_entry_id ? 'This reverses the verified receipt using the current date, restores the invoice balance, and removes the amount from Undeposited Funds. A reason is required.' : 'This cancels the unposted receipt without changing the invoice balance. For a bounced check, record the reason below.'}</p>
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
              <div className="rounded-lg border border-status-danger-border bg-status-danger-bg px-3 py-2 text-xs text-status-danger">{actionError}</div>
            )}
          </div>
        )}
      </Modal>

      {/* Proof of receipt history modal */}
      <CollectionProofHistoryModal
        open={!!proofTarget}
        onClose={() => setProofTarget(null)}
        collection={proofTarget}
        canManage={hasPermission('collections.manage')}
        onUploaded={() => {
          refetch()
          setVerifyTarget(current => current?.id === proofTarget?.id ? {...current, has_proof: true} : current)
          setConfirmTarget(current => current?.id === proofTarget?.id ? {...current, has_proof: true} : current)
          setDetailRecord(current => current?.id === proofTarget?.id ? {...current, has_proof: true} : current)
        }}
      />
    </div>
  )
}
