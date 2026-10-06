import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Modal from './Modal'

/*
 * Modals nest in this app — the batch-approve wizard opens a per-expense
 * confirmation, and detail views open their own edit dialog. Both behaviours
 * below were broken: closing the inner modal reset body overflow even though
 * the outer one was still open, and a single Escape in the inner dialog also
 * closed the dialog behind it, because every open Modal listens on the
 * document with a capture-phase listener.
 */

function Nested({ outerOpen, innerOpen }) {
  return (
    <>
      <Modal open={outerOpen} onClose={() => {}} title="Outer">
        outer body
        <Modal open={innerOpen} onClose={() => {}} title="Inner">
          inner body
        </Modal>
      </Modal>
    </>
  )
}

describe('Modal nesting', () => {
  it('keeps the page locked while an outer modal is still open', () => {
    const { rerender } = render(<Nested outerOpen innerOpen={false} />)
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<Nested outerOpen innerOpen />)
    expect(document.body.style.overflow).toBe('hidden')

    // Close only the inner dialog.
    rerender(<Nested outerOpen innerOpen={false} />)
    expect(document.body.style.overflow).toBe('hidden')

    // Now the outer one closes too.
    rerender(<Nested outerOpen={false} innerOpen={false} />)
    expect(document.body.style.overflow).toBe('')
  })

  it('closes only the topmost modal on Escape', () => {
    const onOuterClose = vi.fn()
    const onInnerClose = vi.fn()

    render(
      <>
        <Modal open onClose={onOuterClose} title="Outer">
          <Modal open onClose={onInnerClose} title="Inner">
            inner body
          </Modal>
        </Modal>
      </>
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onInnerClose).toHaveBeenCalledTimes(1)
    expect(onOuterClose).not.toHaveBeenCalled()
  })

  it('still closes a lone modal on Escape', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="Solo">body</Modal>)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape for non-topmost modals', () => {
    function Three({ innerOpen }) {
      return (
        <Modal open onClose={() => {}} title="A">
          <Modal open onClose={() => {}} title="B">
            <Modal open={innerOpen} onClose={() => {}} title="C">
              c
            </Modal>
          </Modal>
        </Modal>
      )
    }
    const onB = vi.fn()
    // B is not topmost while C is open, so B must not react.
    render(
      <Modal open onClose={() => {}} title="A">
        <Modal open onClose={onB} title="B">
          <Modal open onClose={() => {}} title="C">c</Modal>
        </Modal>
      </Modal>
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onB).not.toHaveBeenCalled()
    expect(Three).toBeDefined()
  })

  it('survives an onClose that changes identity every render', () => {
    // A caller passing an inline arrow must not corrupt the stack: membership
    // is keyed on `open`, not on the handler identity.
    function Churn() {
      const [n, setN] = useState(0)
      return (
        <>
          <button onClick={() => setN((v) => v + 1)}>rerender</button>
          <Modal open onClose={() => {}} title="Outer">
            <Modal open onClose={() => {}} title="Inner">i</Modal>
          </Modal>
        </>
      )
    }
    render(<Churn />)
    fireEvent.click(screen.getByText('rerender'))
    fireEvent.click(screen.getByText('rerender'))
    expect(document.body.style.overflow).toBe('hidden')
  })
})