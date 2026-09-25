import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Tooltip from './Tooltip'
import Modal from './Modal'
import Button from './Button'
import { apiFetch } from '../utils/api'
import { useProfileContext } from '../context/ProfileContext'

/**
 * "Delete Permanently" action for ARCHIVED records, shown only to Admin /
 * Super Admin (mirrors the PermanentDeleteController admin gate). Opens a
 * destructive confirm modal, calls DELETE <endpoint>, then lets the page
 * refetch via onDeleted(). Errors surface inline in the modal.
 */
export default function DeletePermanentButton({ endpoint, label = 'record', name = '', onDeleted, onError }) {
  const { profile } = useProfileContext()
  const canDelete = !!(profile && ['admin', 'super-admin'].includes(profile.role_slug))
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  if (!canDelete) return null

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      const res = await apiFetch(endpoint, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to permanently delete.')
      }
      setOpen(false)
      onDeleted?.(json.message)
    } catch (err) {
      const message = err.message || 'Failed to permanently delete.'
      setError(message)
      onError?.(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Tooltip label={`Permanently delete ${label}`} align="end">
        <button
          type="button"
          onClick={() => { setError(''); setOpen(true) }}
          aria-label={`Permanently delete ${label}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors duration-150"
        >
          <Trash2 size={15} />
        </button>
      </Tooltip>

      <Modal
        open={open}
        onClose={() => !deleting && setOpen(false)}
        title="Delete Permanently"
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" size="md" loading={deleting} onClick={handleDelete}>Delete Permanently</Button>
          </>
        }
      >
        <p className="break-words text-sm text-ink">
          This will permanently delete the archived {label}
          {name ? <span className="break-words font-semibold">: {name}</span> : null}.
        </p>
        <p className="mt-2 break-words text-xs text-muted">
          This action cannot be undone. If you might need the record again, choose Restore instead.
        </p>
        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{error}</div>
        )}
      </Modal>
    </>
  )
}