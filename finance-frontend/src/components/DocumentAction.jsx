import { Paperclip } from 'lucide-react'
import Tooltip from './Tooltip'
export default function DocumentAction({ onClick, attached, label = 'record' }) {
  const hint = attached ? 'View attached documents' : 'View or attach documents'
  return <Tooltip label={hint}><button type="button" onClick={onClick} aria-label={'Documents for ' + label} className={'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ' + (attached ? 'bg-primary/10 text-primary-dark hover:bg-primary/20' : 'text-muted hover:bg-bg hover:text-ink')}><Paperclip size={16} />{attached && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />}</button></Tooltip>
}
