import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

/*
 * A module-level mock of ../utils/api so the hooks can be driven without a
 * backend. Each test resolves fetches by hand, which is the whole point:
 * these races only appear when responses are reordered deliberately.
 */
const pending = []

vi.mock('../utils/api', () => ({
  apiFetch: vi.fn((url) => {
    const entry = { url, resolve: null, reject: null }
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = resolve
      entry.reject = reject
    })
    pending.push(entry)
    return entry.promise
  }),
}))

import { useExpenses } from './useExpenses'

const json = (data, meta) => ({ ok: true, json: async () => ({ success: true, data, meta }) })

function Harness() {
  const { expenses, setFilter, listLoading } = useExpenses()
  const [n, setN] = useState(0)
  return (
    <div>
      <button onClick={() => setFilter({ search: 'old' })}>old</button>
      <button onClick={() => setFilter({ search: 'new' })}>new</button>
      <button onClick={() => setN((v) => v + 1)}>bump</button>
      <span data-testid="ids">{expenses.map((e) => e.id).join(',')}</span>
      <span data-testid="loading">{String(listLoading)}</span>
      <span data-testid="n">{n}</span>
    </div>
  )
}

beforeEach(() => {
  pending.length = 0
})

describe('useExpenses list requests', () => {
  it('discards a slow earlier response instead of overwriting a newer one', async () => {
    render(<Harness />)

    // Mount fetch + stats fetch.
    await waitFor(() => expect(pending.length).toBeGreaterThanOrEqual(2))
    const mountList = pending.find((p) => p.url.includes('/api/expenses?'))
    const stats = pending.find((p) => p.url.includes('/stats'))
    await act(async () => {
      mountList.resolve(json([{ id: 1 }], { current_page: 1 }))
      stats.resolve(json({ total: 0 }))
    })
    await waitFor(() => expect(screen.getByTestId('ids').textContent).toBe('1'))

    // Two filters in quick succession: "old" then "new".
    fireEvent.click(screen.getByText('old'))
    fireEvent.click(screen.getByText('new'))
    await waitFor(() => expect(pending.length).toBeGreaterThanOrEqual(4))

    const oldReq = pending.find((p) => p.url.includes('search=old'))
    const newReq = pending.find((p) => p.url.includes('search=new'))

    // Resolve the NEWER request first, then let the older one land late.
    await act(async () => { newReq.resolve(json([{ id: 22 }], { current_page: 1 })) })
    await waitFor(() => expect(screen.getByTestId('ids').textContent).toBe('22'))

    await act(async () => { oldReq.resolve(json([{ id: 11 }], { current_page: 1 })) })

    // The late "old" response must not resurrect its own results.
    expect(screen.getByTestId('ids').textContent).toBe('22')
  })

  it('clears listLoading when the newest request finishes', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('true'))

    const mountList = pending.find((p) => p.url.includes('/api/expenses?'))
    const stats = pending.find((p) => p.url.includes('/stats'))
    await act(async () => {
      mountList.resolve(json([], { current_page: 1 }))
      stats.resolve(json({ total: 0 }))
    })

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
  })

  it('keeps mutating true until every overlapping write has settled', async () => {
    render(<MutateHarness />)
    await waitFor(() => expect(pending.length).toBeGreaterThanOrEqual(2))
    const mountList = pending.find((p) => p.url.includes('/api/expenses?'))
    const stats = pending.find((p) => p.url.includes('/stats'))
    await act(async () => {
      mountList.resolve(json([], { current_page: 1 }))
      stats.resolve(json({ total: 0 }))
    })

    // Two writes in flight at once.
    fireEvent.click(screen.getByText('approve'))
    fireEvent.click(screen.getByText('archive'))
    await waitFor(() => expect(pending.filter((p) => p.url.includes('/approve') || p.url.includes('/archive')).length).toBe(2))
    expect(screen.getByTestId('mutating').textContent).toBe('true')

    const approve = pending.find((p) => p.url.includes('/approve'))
    const archive = pending.find((p) => p.url.includes('/archive'))

    // First one lands — the second is still running, so the UI must stay busy.
    await act(async () => { approve.resolve({ ok: true, json: async () => ({ success: true, data: {} }) }) })
    expect(screen.getByTestId('mutating').textContent).toBe('true')

    await act(async () => { archive.resolve({ ok: true, json: async () => ({ success: true, data: {} }) }) })
    await waitFor(() => expect(screen.getByTestId('mutating').textContent).toBe('false'))
  })
})

function MutateHarness() {
  const { mutating, approveExpense, archiveExpense } = useExpenses()
  return (
    <div>
      <button onClick={() => approveExpense(1)}>approve</button>
      <button onClick={() => archiveExpense(2)}>archive</button>
      <span data-testid="mutating">{String(mutating)}</span>
    </div>
  )
}