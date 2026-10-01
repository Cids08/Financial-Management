import { useLayoutEffect, useRef } from 'react'

/** Reflow records using the space available inside the workspace or modal. */
export default function ResponsiveTable({ children, className = '', minTableWidth, ...props }) {
  const containerRef = useRef(null)
  const tableRef = useRef(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const table = tableRef.current
    let columnCount = 0
    const resize = () => {
      const threshold = minTableWidth ?? Math.max(640, columnCount * 150)
      container.dataset.layout = container.clientWidth < threshold ? 'cards' : 'table'
    }
    const labelCells = () => {
      const headers = Array.from(table.tHead?.rows ?? []).flatMap(row => Array.from(row.cells))
      const labels = headers.flatMap(cell => Array(cell.colSpan).fill(cell.textContent.trim() || cell.getAttribute('aria-label') || 'Select'))
      columnCount = labels.length
      headers.forEach(cell => {
        cell.setAttribute('role', 'columnheader')
        if (!cell.hasAttribute('scope')) cell.setAttribute('scope', 'col')
      })
      for (const section of [table.tHead, ...table.tBodies, table.tFoot].filter(Boolean)) {
        section.setAttribute('role', 'rowgroup')
        for (const row of section.rows) {
          row.setAttribute('role', 'row')
          let index = 0
          for (const cell of row.cells) {
            if (section !== table.tHead) {
              const label = labels[index] || ''
              cell.setAttribute('role', cell.tagName === 'TH' ? 'rowheader' : 'cell')
              cell.dataset.label = cell.colSpan > 1 ? '' : label
              cell.dataset.fullWidth = String(cell.colSpan > 1 || index === 0 || /actions/i.test(label))
              cell.dataset.actions = String(/actions/i.test(label))
            }
            index += cell.colSpan
          }
        }
      }
      resize()
    }
    labelCells()
    const observer = new MutationObserver(labelCells)
    observer.observe(table, { childList: true, characterData: true, subtree: true })
    const sizeObserver = new ResizeObserver(resize)
    sizeObserver.observe(container)
    return () => { observer.disconnect(); sizeObserver.disconnect() }
  }, [minTableWidth])

  return (
    <div ref={containerRef} className="responsive-table">
      <table {...props} ref={tableRef} role="table" className={className}>{children}</table>
    </div>
  )
}
