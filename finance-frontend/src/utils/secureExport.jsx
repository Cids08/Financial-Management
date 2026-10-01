import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { apiFetch } from './api'

function ExportDialog({ kind, execute, finish }) {
  const dialog = useRef(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current.showModal() }, [])
  const submit = async event => {
    event.preventDefault()
    if (password !== confirmation) { setError('The passwords do not match.'); return }
    setBusy(true)
    setError('')
    try { finish(await execute(password)) }
    catch (err) { setError(err.message || 'Export failed. Please try again.'); setBusy(false) }
  }
  return (
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) finish(null) }} aria-labelledby="export-title" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-surface p-6 text-ink shadow-xl backdrop:bg-black/60">
      <form onSubmit={submit} className="space-y-4">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-primary-dark">Secure download</p><h2 id="export-title" className="mt-1 text-xl font-bold">Protect your {kind} export</h2></div>
        <p className="text-sm text-muted">{kind === 'CSV' ? 'CSV will download inside an AES-encrypted ZIP. Extract it with a compatible archive app before opening it in Excel.' : 'You will need this password to open the PDF.'} Keep the password separately; it is not saved by the system.</p>
        <label className="block text-sm font-medium">Export password<input autoFocus type="password" required minLength={12} maxLength={64} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2" /><span className="text-xs font-normal text-muted">Use 12–64 characters. Do not use your login password.</span></label>
        <label className="block text-sm font-medium">Confirm password<input type="password" required minLength={12} maxLength={64} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2" /></label>
        {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-2"><button type="button" disabled={busy} onClick={() => finish(null)} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{busy ? 'Preparing…' : 'Download protected file'}</button></div>
      </form>
    </dialog>
  )
}

export function runProtectedExport(kind, execute) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const finish = value => {
      root.unmount()
      host.remove()
      previousFocus?.focus()
      resolve(value)
    }
    root.render(<ExportDialog kind={kind} execute={execute} finish={finish} />)
  })
}

export async function requireExportResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || 'Could not prepare the protected export.')
  }
  return response
}

export function protectedDashboardPdf(path) {
  return runProtectedExport('PDF', async password => requireExportResponse(await apiFetch(path, {
    method: 'POST', body: JSON.stringify({ export_password: password }),
  })))
}

export async function downloadProtectedPdf(html, filename) {
  const response = await runProtectedExport('PDF', async password => requireExportResponse(await apiFetch('/api/exports/pdf', {
    method: 'POST', body: JSON.stringify({ export_password: password, html }),
  })))
  if (!response) return
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
