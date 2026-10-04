import { Children, Fragment, isValidElement, cloneElement, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Files } from 'lucide-react'
import Tooltip from './Tooltip'
import DocumentAction from './DocumentAction'

// Existing conditionals resolve before this component receives children, preserving permissions.
// Keep workflow actions visible; supporting documents and secondary utilities share More.
export default function RowActions({ children }) {
  const [position, setPosition] = useState(null)
  const trigger = useRef(null)
  const panel = useRef(null)
  const secondary = []
  function collect(nodes) {
    return Children.map(nodes, node => {
      if (!isValidElement(node)) return node
      if (node.type === DocumentAction) {
        secondary.push({ label: 'Documents', control: <button type="button" onClick={node.props.onClick}><Files size={16} /><span className="sr-only">{node.props.attached ? 'Attachments available. ' : ''}</span></button> })
        return null
      }
      if (node.type === Tooltip && /^(Print|Edit|Archive)\b/i.test(node.props.label || '')) {
        const control = Children.toArray(node.props.children)[0]
        if (isValidElement(control) && control.type === 'button') {
          secondary.push({ label: node.props.label, control })
          return null
        }
      }
      if (node.type === Fragment || node.type === 'div') return cloneElement(node, {}, collect(node.props.children))
      return node
    })
  }
  const visible = collect(children)
  useEffect(() => {
    if (!position) return
    panel.current?.querySelector('button:not(:disabled)')?.focus()
    const close = event => { if (!panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null) }
    const key = event => { if (event.key === 'Escape') { setPosition(null); trigger.current?.focus() } }
    const resize = () => setPosition(null)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', resize)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); window.removeEventListener('resize', resize) }
  }, [position])
  return <div className="flex flex-wrap items-center justify-end gap-1">{visible}{secondary.length > 0 && <Tooltip label="More actions" align="end"><button ref={trigger} type="button" aria-label="More actions" aria-expanded={!!position} onClick={() => { const r=trigger.current.getBoundingClientRect(); setPosition(position ? null : {left:Math.max(8,Math.min(r.right-192,window.innerWidth-200)),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-secondary.length*40-24))}) }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><MoreHorizontal size={18}/></button></Tooltip>}{position && createPortal(<div ref={panel} role="group" aria-label="More actions" style={{position:'fixed',...position,zIndex:10000,width:192}} className="rounded-xl border border-border bg-surface p-1 shadow-xl" onKeyDown={e => { if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) { e.preventDefault();const items=[...panel.current.querySelectorAll('button:not(:disabled)')];const i=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus() } if(e.key==='Tab') setPosition(null) }}>{secondary.map(({label,control},i)=>cloneElement(control,{key:i,'aria-label':label,className:'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-bg disabled:opacity-50',onClick:e=>{setPosition(null);trigger.current?.focus();control.props.onClick?.(e)}},<>{control.props.children}<span>{label}</span></>))}</div>,document.body)}</div>
}
