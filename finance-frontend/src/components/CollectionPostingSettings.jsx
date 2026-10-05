import { useEffect, useState } from 'react'
import Button from './Button'
import { apiFetch } from '../utils/api'

export default function CollectionPostingSettings() {
  const [accounts, setAccounts] = useState([])
  const [account, setAccount] = useState('')
  const [cutoff, setCutoff] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    const read = async url => { const res = await apiFetch(url); const json = await res.json(); if (!res.ok || !json.success) throw new Error(json.message || 'Unable to load posting settings.'); return json }
    ;(async () => {
      try {
        const settings = await read('/api/settings')
        const rows = []; let page = 1, last = 1
        do { const result = await read('/api/chart-of-accounts?type=Asset&per_page=100&page=' + page); rows.push(...result.data); last = result.meta?.last_page || 1; page++ } while (page <= last)
        if (active) { setAccounts(rows); setAccount(settings.data.undepositedFundsAccountId || ''); setCutoff(settings.data.collectionClosedThrough || '') }
      } catch (e) { if (active) setError(e.message) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [])
  const save = async e => {
    e.preventDefault(); setSaving(true); setSaved(false); setError('')
    try {
      const res = await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify({undepositedFundsAccountId: account ? Number(account) : null, collectionClosedThrough: cutoff || null}) })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(Object.values(json.errors || {})[0]?.[0] || json.message || 'Unable to save settings.')
      setSaved(true)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const field = 'mt-2 h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-ink'
  return <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
    <h2 className="text-sm font-semibold text-ink">Collection posting controls</h2>
    <p className="mt-1 text-xs text-muted">Receipt verification settles AR into Undeposited Funds. Deposit confirmation transfers it to the bank.</p>
    <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-xs text-muted">Undeposited Funds account<select className={field} value={account} disabled={loading || saving} onChange={e => setAccount(e.target.value)}><option value="">Use the account named Undeposited Funds</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}</select></label>
      <label className="text-xs text-muted">Close collection postings through<input type="date" className={field} value={cutoff} disabled={loading || saving} onChange={e => setCutoff(e.target.value)} /><span className="mt-2 block">Blocks collection receipts, deposits, and reversals on or before this date. Other modules are not locked by this setting.</span></label>
      {error && <p role="alert" className="text-sm text-status-danger sm:col-span-2">{error}</p>}
      {saved && <p role="status" className="text-sm text-status-success sm:col-span-2">Collection posting controls saved.</p>}
      <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={loading || saving}>{saving ? 'Saving...' : 'Save posting controls'}</Button></div>
    </form>
  </section>
}
