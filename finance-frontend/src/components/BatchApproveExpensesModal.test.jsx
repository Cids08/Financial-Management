import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import BatchApproveExpensesModal from './BatchApproveExpensesModal'
import { PrivacyProvider } from '../context/PrivacyContext'

/*
 * The auto-refresh effect skips scheduling while a load is in flight, and the
 * "Load Proposals" button is disabled during one too. So picking a filter
 * mid-load never issues a second request — the in-flight response simply
 * lands and advances the wizard to Step 1 showing the previous filter's
 * expenses, while the toolbar reports the filter the user just picked.
 *
 * Step 1 renders "{proposals.length} expenses", which is what these assert on.
 */

const deferred = []

const CATEGORIES = [
  { id: 1, category_name: 'Materials' },
  { id: 2, category_name: 'Subcontractors' },
]

// fetchApprovalProposals returns the already-parsed response body (the hook
// resolves json itself), not an axios-style {ok, json} envelope.
const proposalsResponse = (ids) => ({
  success: true,
  data: {
    proposals: ids.map((id) => ({ id, expense_amount: 10, expense_no: `EXP-${id}` })),
    totals: {
      count: ids.length,
      total_amount: ids.length * 10,
      attachment_missing_count: 0,
      withheld_expenses: [],
    },
  },
})

function makeLoader() {
  deferred.length = 0
  return vi.fn(() => {
    const entry = {}
    entry.promise = new Promise((resolve) => { entry.resolve = resolve })
    deferred.push(entry)
    return entry.promise
  })
}

function renderWizard(loader) {
  return render(
    <PrivacyProvider>
      <BatchApproveExpensesModal
        open
        onClose={() => {}}
        fetchApprovalProposals={loader}
        categories={CATEGORIES}
        eligibleFromProps={[]}
        onBatchApprove={async () => ({ success: true, data: { count: 0, total_amount: 0 } })}
      />
    </PrivacyProvider>
  )
}

const categorySelect = () => screen.getAllByRole('combobox')[0]

describe('BatchApproveExpensesModal proposal loading', () => {
  it('reloads instead of showing stale results when the filter changes mid-flight', async () => {
    const loader = makeLoader()
    renderWizard(loader)

    fireEvent.click(screen.getByRole('button', { name: /load proposals/i }))
    await waitFor(() => expect(deferred.length).toBe(1))
    expect(loader.mock.calls[0][0]).toEqual({})

    // Change the filter while the first request is still unresolved. The
    // button is disabled and the debounce guard skips, so no second request
    // is issued at this point.
    fireEvent.change(categorySelect(), { target: { value: '2' } })
    expect(loader).toHaveBeenCalledTimes(1)

    // The stale response finally lands.
    await act(async () => { deferred[0].resolve(proposalsResponse([1, 2])) })

    // It must NOT be rendered: the user asked for category 2.
    expect(screen.queryByText(/2 expenses/)).toBeNull()

    // Instead a fresh load for the new filter is issued and shown.
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2))
    expect(loader.mock.calls[1][0]).toEqual({ expense_category_id: '2' })

    await act(async () => { deferred[1].resolve(proposalsResponse([7, 8, 9]) ) })
    await waitFor(() => expect(screen.getByText(/3 expenses/)).toBeTruthy())
  })

  it('does not loop when the filter settles before the load completes', async () => {
    const loader = makeLoader()
    renderWizard(loader)

    fireEvent.click(screen.getByRole('button', { name: /load proposals/i }))
    await waitFor(() => expect(deferred.length).toBe(1))

    // No filter change at all: the result stands and nothing re-issues.
    await act(async () => { deferred[0].resolve(proposalsResponse([4, 5])) })
    await waitFor(() => expect(screen.getByText(/2 expenses/)).toBeTruthy())

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('still shows an error when nothing else superseded the load', async () => {
    const loader = makeLoader()
    renderWizard(loader)

    fireEvent.click(screen.getByRole('button', { name: /load proposals/i }))
    await waitFor(() => expect(deferred.length).toBe(1))

    await act(async () => {
      deferred[0].resolve({ success: false, message: 'load failed' })
    })

    await waitFor(() => expect(screen.getByText(/load failed/)).toBeTruthy())
    expect(loader).toHaveBeenCalledTimes(1)
  })
})