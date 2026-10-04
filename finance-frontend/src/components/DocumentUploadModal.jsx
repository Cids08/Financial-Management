import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadCloud, FileText, X, AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import DocumentScanPreview from './DocumentScanPreview'
import { compressImageToUploadable, cannotFitHostLimit, HOSTED_PDF_MAX_BYTES } from '../utils/fileUpload'

const DEFAULT_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
const fileSize = bytes => bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB'

export default function DocumentUploadModal({ open, onClose, record, onUpload, onSuccess, title = 'Attach document', extensions = DEFAULT_TYPES, compressImages = true, toolbar }) {
  const [file, setFile] = useState(null)
  const [scan, setScan] = useState(null)
  const onScanState = useCallback((scannedFile, status) => setScan({ file: scannedFile, status }), [])
  const needsScan = !!file && /\.(pdf|jpe?g|png|webp)$/i.test(file.name)
  const scanPassed = scan?.file === file && scan?.status === 'success'
  const canAttach = !!file && (!needsScan || scanPassed)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [preview, setPreview] = useState('')
  const inputRef = useRef(null)
  const busyRef = useRef(false)
  useEffect(() => { setFile(null); setScan(null); setError(''); setDragActive(false) }, [open, record?.id])
  useEffect(() => {
    if (!file || !open) { setPreview(''); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file, open])
  const close = () => { if (!busyRef.current) onClose() }
  const choose = candidate => {
    if (!candidate || busyRef.current) return
    const ext = candidate.name.split('.').pop()?.toLowerCase()
    const problem = !extensions.includes(ext) ? 'Choose a supported document: ' + extensions.join(', ').toUpperCase() + '.' : !candidate.size ? 'This file is empty.' : candidate.size > 10 * 1024 * 1024 ? 'Documents must be 10 MB or smaller.' : (ext === 'pdf' && candidate.size > HOSTED_PDF_MAX_BYTES ? 'PDFs must be under ' + Math.round(HOSTED_PDF_MAX_BYTES / 1024) + ' KB for this server.' : cannotFitHostLimit(candidate))
    setError(problem || '')
    if (!problem) { setScan(null); setFile(candidate) }
  }
  const submit = async () => {
    if (!canAttach || busyRef.current) return
    busyRef.current = true; setUploading(true); setError('')
    try {
      const result = await onUpload(compressImages ? await compressImageToUploadable(file) : file)
      if (!result?.success) throw new Error(result?.message || 'Upload failed. Your selected file is ready to retry.')
      setFile(null); (onSuccess || onClose)()
    } catch (e) { setError(e.message || 'Upload failed. Please try again.') }
    finally { busyRef.current = false; setUploading(false) }
  }
  return <Modal open={open} onClose={close} title={title} size="lg" footer={<>
    <Button variant="secondary" onClick={close} disabled={uploading}>Cancel</Button>
    <Button icon={UploadCloud} onClick={submit} loading={uploading} disabled={!canAttach}>{uploading ? 'Uploading document...' : 'Attach document'}</Button>
  </>}>
    <div className="space-y-4 min-w-0">
      <div className="rounded-xl border border-border bg-bg p-3"><p className="text-xs text-muted">{record?.label || 'Record #' + record?.id}</p><p className="mt-1 text-sm font-semibold text-ink break-words">{record?.description}</p></div>
      {toolbar?.(uploading)}
      <p className="text-xs text-muted">Review the document before attaching it. A new upload keeps earlier versions in document history.</p>
      <input ref={inputRef} type="file" aria-label="Choose document" accept={extensions.map(ext => '.' + ext).join(',')} className="hidden" disabled={uploading} onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }} />
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><span className="break-words">{error}</span></div>}
      {!file ? <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} onDragOver={e => { e.preventDefault(); setDragActive(true) }} onDragLeave={() => setDragActive(false)} onDrop={e => {e.preventDefault(); setDragActive(false); if(e.dataTransfer.files.length > 1) setError('Choose one document at a time.'); else choose(e.dataTransfer.files[0])}} className={'w-full rounded-xl border-2 border-dashed p-6 text-center space-y-2 focus-visible:outline-2 focus-visible:outline-primary ' + (dragActive ? 'border-primary bg-primary/10' : 'border-border hover:bg-bg')}>
        <UploadCloud size={30} className="mx-auto text-primary-dark" /><span className="block text-sm font-semibold text-ink">Choose a document or drop it here</span><span className="block text-xs text-muted">{extensions.join(', ').toUpperCase()} up to 10 MB. PDF server limit: {Math.round(HOSTED_PDF_MAX_BYTES / 1024)} KB.</span>
      </button> : <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-start gap-3 bg-bg p-3"><FileText size={20} className="shrink-0 text-primary-dark" /><div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold text-ink">{file.name}</p><p className="mt-1 text-xs text-muted">{fileSize(file.size)} &middot; {needsScan && !scanPassed ? 'Scan required before attaching' : 'Ready to attach'}</p></div><Button variant="ghost" size="sm" icon={X} iconOnly aria-label="Remove selected document" disabled={uploading} onClick={() => {setFile(null);setError('')}} /></div>
        {preview && (file.name.toLowerCase().endsWith('.pdf') ? <object data={preview} type="application/pdf" aria-label="Selected document preview" className="block h-64 sm:h-80 w-full"><p className="p-4 text-sm text-muted">PDF preview is unavailable in this browser. Check the selected file before attaching.</p></object> : /\.(jpe?g|png|webp)$/i.test(file.name) ? <img src={preview} alt="Selected document preview" className="block h-64 sm:h-80 w-full object-contain bg-bg p-3" /> : <p className="p-4 text-sm text-muted">Preview is available for images and PDFs. Office documents can be opened after upload.</p>)}
        <div className="border-t border-border p-3"><Button variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>Choose another file</Button></div>
      </div>}
      {open && file && /\.(pdf|jpe?g|png|webp)$/i.test(file.name) && <DocumentScanPreview key={file.name + file.lastModified + file.size} file={file} onScanState={onScanState} disabled={uploading} />}
      {uploading && <p role="status" className="text-xs text-muted">Preparing and uploading your document. Please keep this dialog open.</p>}
    </div>
  </Modal>
}
