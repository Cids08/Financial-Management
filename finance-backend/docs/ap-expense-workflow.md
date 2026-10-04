# AP and direct-expense posting controls

## Workflow
- AP approval recognizes the selected expense/asset against the AP liability. New postings use the invoice date and optional budget/department dimensions. No expense account is silently selected.
- A released disbursement settles AP; it must not create another expense record for the same bill.
- Expenses remains the direct-spending workflow: approval records settlement, reduces the cash balance, and posts G/L. Single approvals now show a cash-impact confirmation; the existing batch wizard also confirms drawdown. This is not a new unpaid employee-reimbursement subsystem. Unpaid items need the payable/payment workflow and an appropriate payee record.
- AP budget allocation is optional. Active budget, invoice period, and permitted expense/fixed-asset account are validated when provided. Posted G/L actuals include the bill; operational budget used_amount is a separate existing measure and is not rewritten by AP approval.

## Duplicate supplier documents
The service checks the same supplier plus case-insensitive, trimmed invoice/receipt number across AP and Expenses, including archived non-cancelled/non-rejected records. Checks run on creation, edits and approval within transactions, using a shared supplier lock. Supplier expenses require a document number. Punctuation and internal spaces are not removed. Different references, missing supplier identity, or receipt numbers that differ from invoice numbers cannot be automatically identified as the same cost. Existing duplicate records are not modified.

## Reports
Cash flow includes Confirmed collections, Released disbursements (net of withholding), and Approved direct expenses. Disbursements use released_date with payment_date as the legacy fallback. Direct expenses use expense_date and collections use collection_date. Archived settled records remain included. Unassigned historical cash accounts appear explicitly. Income statements exclude deleted journal entries.

## Deployment and validation
Apply migration 2026_10_03_180000_add_budget_to_accounts_payable.php. The migration adds a nullable foreign key and does not guess historical budget assignments or rewrite prior postings. Other installations must run the migration before deploying this code.
FinancialWorkflowTest uses isolated SQLite fixtures for report inclusion/exclusion, withheld tax, release-date boundaries, duplicates, account validation, AP journal dimensions, and avoiding expense duplication on liability settlement. Live financial balances were not reconciled or changed by these tests.
