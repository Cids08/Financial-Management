# Budget-to-G/L allocations

Apply `php artisan migrate` before deploying the frontend. The additive migration
`2026_10_02_160000_add_budget_gl_allocations` creates account allocations and adds
budget/department dimensions to journal lines. It recovers historical dimensions
only from explicit expense/disbursement budget links. It does not rewrite ledger
amounts or invent approved account allocations.

## Workflow

- Add/Edit Budget includes account allocation rows. Their sum must equal the
  budget amount. Each account can appear once; amounts must be positive cents.
- Eligible accounts are active Expense accounts and Asset accounts whose category
  is Fixed Asset. Cash, receivable and liability settlements are excluded.
- Approval requires a complete allocation. Existing Active budgets can be linked
  through the register's G/L allocations action; both budget management and
  approval permissions are required. Allocation changes are audited. Closed and
  cancelled budgets remain locked.
- New expense forms require an explicit posting G/L account. When the budget has
  allocations, the choices are limited to those active accounts; a sole available
  account is preselected. A budget without allocations offers active eligible
  accounts and explains that the posting will be unplanned until allocated.
- Pending expense edits and approvals revalidate the account against current
  allocations. Approval also checks the expense date against the budget term and
  locks the expense before changing balances, preventing duplicate approvals.
- The additive migration `2026_10_02_170000_add_gl_account_to_expenses` stores this
  selection. Historical posted expenses and journal amounts are not rewritten.
- Budget utilization expands Department > Budget > G/L account. The Reports page's
  Budget vs. Actual uses the same posted G/L basis, including its export/print data.

## Accounting basis

Actual equals posted debit minus credit for the exact budget ID, department ID,
and inclusive budget start/end dates. Posted credit reversals reduce actuals.
Deleted journal entries and unposted entries do not count. Historical inactive
accounts continue to appear in actuals. Duplicate reference documents are not
summed separately: the report reads journal lines only.

New expense and payroll settlement journal lines preserve their source budget and
department. Any future journal posting or reversal writer must retain these
dimensions to be included. Sources without a reliable budget link are not guessed.

Payroll liability payments do not recognize salary expense. They therefore remain
in operational utilization but do not become G/L budget actuals. Salary accruals
must be posted to an expense account with the correct dimensions by the owning
accounting/payroll workflow. This change does not invent payroll accruals or
replace existing operational spending controls. New expense postings use their
explicit G/L selection. Legacy/system-generated pending expenses with no selection
can use a sole allocated account; multiple available allocations require an edit.
The previous category-based fallback is retained only for legacy/internal pending
expenses on budgets without account allocations.

Unallocated legacy budget amounts and unplanned posted accounts are displayed
explicitly. The report also flags differences between operational utilization and
G/L actuals. A zero actual is not a claim that a legacy operational balance has
been reconciled. The transaction drill-down shows the supporting posted entries.

The fiscal-year filter selects budgets for that year; actuals cover each budget's
full date range. Monthly allocations and arbitrary as-of-period comparisons are
not part of this change.

## Verification

`php artisan test --filter=BudgetGlTest` uses an isolated in-memory SQLite schema
and runs the new migration. It covers historical linking, reversals, date bounds,
department matching, unposted/deleted exclusion, settlement exclusion, account
eligibility, exact allocation totals, duplicate accounts, active-budget authority,
closed-budget locking, report reconciliation and audit logging.
It also verifies expense account eligibility, stale allocation rejection, balanced
expense journal creation and preservation of the budget/department dimensions.
