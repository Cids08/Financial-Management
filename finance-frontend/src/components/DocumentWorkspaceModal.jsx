import { useEffect, useState } from 'react'
import Button from './Button'
import DocumentUploadModal from './DocumentUploadModal'
import DocumentHistoryModal from './DocumentHistoryModal'

export default function DocumentWorkspaceModal({ open, onClose, record, fetchHistory, onUpload, onView, onUploaded, canUpload = true, extensions, title = 'Supporting documents', contextToolbar }) {
  const [mode, setMode] = useState('history')
  useEffect(() => { setMode('history') }, [open, record?.id])
  const toolbar = busy => <div className="space-y-3">{contextToolbar?.(busy)}<div className="flex flex-wrap gap-2 border-b border-border pb-3">
    <Button size="sm" variant={mode === 'history' ? 'primary' : 'secondary'} aria-pressed={mode==='history'} disabled={busy} onClick={() => setMode('history')}>View documents</Button>
    {canUpload && <Button size="sm" variant={mode === 'upload' ? 'primary' : 'secondary'} aria-pressed={mode==='upload'} disabled={busy} onClick={() => setMode('upload')}>Attach document</Button>}
    {!canUpload && <p className="w-full text-xs text-muted">Uploads are unavailable for this record or your permissions.</p>}
  </div></div>
  return mode === 'upload' && canUpload ? <DocumentUploadModal open={open} onClose={onClose} record={record} title={title} toolbar={toolbar} extensions={extensions} onUpload={onUpload} onSuccess={() => { setMode('history'); onUploaded?.() }} /> : <DocumentHistoryModal open={open} onClose={onClose} record={record} title={title} toolbar={toolbar} fetchHistory={fetchHistory} onView={onView} />
}
