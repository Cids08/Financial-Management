<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountsPayable;
use App\Models\AccountsReceivable;
use App\Models\Budget;
use App\Models\CashAccount;
use App\Models\Collection;
use App\Models\Collector;
use App\Models\Customer;
use App\Models\Department;
use App\Models\Disbursement;
use App\Models\Expense;
use App\Models\FixedAsset;
use App\Models\Supplier;
use App\Models\TaxObligation;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Global hybrid search — real database records only. Menu/module matches
 * are handled entirely on the frontend (see SearchBar.jsx's PAGE_INDEX,
 * built from utils/menuData.js) and were already working before this
 * controller existed; this endpoint is purely the "DATABASE RESULTS"
 * half of the hybrid dropdown.
 *
 * GET /api/search?q=juan
 *
 * Response shape (one group per searchable entity the user is permitted
 * to view, only included when it actually has at least one match):
 *
 *   {
 *     "success": true,
 *     "message": "",
 *     "data": [
 *       {
 *         "type": "customers",              // matches menuData.js item id, so
 *                                            // SearchBar's existing ICON_MAP
 *                                            // (built from menuData) resolves
 *                                            // the icon with zero extra wiring
 *         "label": "Customers",
 *         "route": "/master-data/customers", // the EXISTING frontend route
 *                                            // for this module, taken from
 *                                            // menuData.js — never invented
 *         "has_more": false,
 *         "items": [
 *           {
 *             "id": 45,                     // raw primary key. Every existing
 *                                            // *Resource in this project just
 *                                            // renames `id` (customer_id,
 *                                            // supplier_id, ar_id, ...) so the
 *                                            // raw id already matches what
 *                                            // each list page compares against
 *             "title": "Juan Construction",
 *             "subtitle": "CUST-00045",
 *             "meta": "juan@email.com",
 *             "search_hint": "Juan Construction" // see note below
 *           }
 *         ]
 *       }
 *     ]
 *   }
 *
 * search_hint: several list pages (Customers, Suppliers, Expenses, ...)
 * load their table server-side, filtered by their own local `search` text
 * box (GET /api/customers?search=...), rather than loading every record
 * client-side (Users.jsx and AccountsReceivable.jsx are the two
 * exceptions — they fetch everything up front and filter in the
 * browser). For the server-filtered pages, simply navigating there and
 * highlighting a row by id doesn't work if that record isn't on the
 * first page of *that* page's own default listing. `search_hint` is a
 * value guaranteed to match that same page's existing search scope, so
 * the frontend can pre-fill that page's search box on arrival (see
 * useHighlightRow.js) and land the exact record on screen before
 * scrolling/highlighting it.
 *
 * PERMISSIONS: every entity below is gated by the same permission slug
 * already used for that module's own index route in routes/api.php (see
 * CheckPermission middleware / User::hasPermission()). A user only ever
 * sees search results for modules they already have `.view` access to —
 * there is no separate/second permission system here.
 */
class SearchController extends Controller
{
    private const PER_GROUP = 5;
    private const MIN_QUERY_LENGTH = 2;

    public function index(Request $request): JsonResponse
    {
        $term = trim((string) $request->query('q', ''));
        $user = $request->user();

        if (mb_strlen($term) < self::MIN_QUERY_LENGTH) {
            return response()->json(['success' => true, 'message' => '', 'data' => []]);
        }

        $groups = [];

        foreach ($this->searchableEntities() as $entity) {
            if (! $user->hasPermission($entity['permission'])) {
                continue;
            }

            /** @var Builder $query */
            $query = $entity['query']($term);

            $total = (clone $query)->count();
            if ($total === 0) {
                continue;
            }

            $records = $query->limit(self::PER_GROUP)->get();

            $groups[] = [
                'type' => $entity['type'],
                'label' => $entity['label'],
                'route' => $entity['route'],
                'has_more' => $total > self::PER_GROUP,
                'items' => $records->map($entity['map'])->values(),
            ];
        }

        return response()->json([
            'success' => true,
            'message' => '',
            'data' => $groups,
        ]);
    }

    /**
     * One entry per searchable module. `type`/`route`/`permission` are
     * taken directly from finance-frontend/src/utils/menuData.js and
     * routes/api.php — nothing here is invented.
     *
     * Every entity's `query` closure prefers the model's own scopeSearch()
     * when one already exists (Customer, Supplier, Collector, Department,
     * CashAccount, FixedAsset, Expense, TaxObligation) instead of
     * redefining the search fields here. AccountsReceivable,
     * AccountsPayable, Disbursement, Budget, Collection, and User don't
     * have a scopeSearch() on the model, so their field list mirrors
     * whatever that module's own controller/service already searches on
     * (e.g. AccountsReceivableService::list()'s inline search clause).
     *
     * @return array<int, array{type:string,label:string,route:string,permission:string,query:callable,map:callable}>
     */
    private function searchableEntities(): array
    {
        return [
            [
                'type' => 'users',
                'label' => 'Users',
                'route' => '/user-management/users',
                'permission' => 'users.view',
                'query' => fn (string $term) => User::query()->where(function (Builder $q) use ($term) {
                    $q->where('first_name', 'ilike', "%{$term}%")
                        ->orWhere('last_name', 'ilike', "%{$term}%")
                        ->orWhere('email', 'ilike', "%{$term}%")
                        ->orWhere('employee_no', 'ilike', "%{$term}%");
                }),
                'map' => fn (User $u) => [
                    'id' => $u->id,
                    'title' => trim("{$u->first_name} {$u->last_name}"),
                    'subtitle' => $u->employee_no,
                    'meta' => $u->email,
                    'search_hint' => $u->employee_no,
                ],
            ],
            [
                'type' => 'customers',
                'label' => 'Customers',
                'route' => '/master-data/customers',
                'permission' => 'customers.view',
                'query' => fn (string $term) => Customer::query()->search($term),
                'map' => fn (Customer $c) => [
                    'id' => $c->id,
                    'title' => $c->customer_name,
                    'subtitle' => $c->customer_code,
                    'meta' => $c->email,
                    'search_hint' => $c->customer_name,
                ],
            ],
            [
                'type' => 'suppliers',
                'label' => 'Suppliers',
                'route' => '/master-data/suppliers',
                'permission' => 'suppliers.view',
                'query' => fn (string $term) => Supplier::query()->search($term),
                'map' => fn (Supplier $s) => [
                    'id' => $s->id,
                    'title' => $s->supplier_name,
                    'subtitle' => $s->supplier_code,
                    'meta' => $s->email,
                    'search_hint' => $s->supplier_name,
                ],
            ],
            [
                'type' => 'collectors',
                'label' => 'Collectors',
                'route' => '/master-data/collectors',
                'permission' => 'collectors.view',
                'query' => fn (string $term) => Collector::query()->search($term),
                'map' => fn (Collector $c) => [
                    'id' => $c->id,
                    'title' => trim("{$c->first_name} {$c->last_name}"),
                    'subtitle' => $c->employee_no,
                    'meta' => $c->assigned_area,
                    'search_hint' => $c->employee_no,
                ],
            ],
            [
                'type' => 'departments',
                'label' => 'Departments',
                'route' => '/master-data/departments',
                'permission' => 'departments.view',
                'query' => fn (string $term) => Department::query()->search($term),
                'map' => fn (Department $d) => [
                    'id' => $d->id,
                    'title' => $d->department_name,
                    'subtitle' => $d->department_code,
                    'meta' => $d->department_head,
                    'search_hint' => $d->department_name,
                ],
            ],
            [
                'type' => 'cash-accounts',
                'label' => 'Cash Accounts',
                'route' => '/master-data/cash-accounts',
                'permission' => 'cash-accounts.view',
                'query' => fn (string $term) => CashAccount::query()->search($term),
                'map' => fn (CashAccount $a) => [
                    'id' => $a->id,
                    'title' => $a->account_name,
                    'subtitle' => $a->account_code,
                    'meta' => $a->bank_name,
                    'search_hint' => $a->account_name,
                ],
            ],
            [
                'type' => 'fixed-assets',
                'label' => 'Fixed Assets',
                'route' => '/master-data/fixed-assets',
                'permission' => 'fixed-assets.view',
                'query' => fn (string $term) => FixedAsset::query()->search($term),
                'map' => fn (FixedAsset $a) => [
                    'id' => $a->id,
                    'title' => $a->asset_name,
                    'subtitle' => $a->asset_code,
                    'meta' => $a->location,
                    'search_hint' => $a->asset_name,
                ],
            ],
            [
                'type' => 'ar',
                'label' => 'Accounts Receivable',
                'route' => '/transactions/receivable',
                'permission' => 'ar.view',
                // AccountsReceivable has no scopeSearch() on the model —
                // mirrors AccountsReceivableService::list()'s existing
                // inline search clause exactly (invoice_number,
                // reference_no, customer.customer_name).
                'query' => fn (string $term) => AccountsReceivable::query()
                    ->with('customer')
                    ->where(function (Builder $q) use ($term) {
                        $q->where('invoice_number', 'ilike', "%{$term}%")
                            ->orWhere('reference_no', 'ilike', "%{$term}%")
                            ->orWhereHas('customer', fn (Builder $cq) => $cq->where('customer_name', 'ilike', "%{$term}%"));
                    }),
                'map' => fn (AccountsReceivable $r) => [
                    'id' => $r->id,
                    'title' => $r->invoice_number,
                    'subtitle' => $r->customer?->customer_name,
                    'meta' => (float) $r->remaining_balance,
                    'search_hint' => $r->invoice_number,
                ],
            ],
            [
                'type' => 'ap',
                'label' => 'Accounts Payable',
                'route' => '/transactions/payable',
                'permission' => 'ap.view',
                // No scopeSearch() on AccountsPayable either — same field
                // choices as AR's own search, adapted to AP's columns
                // (reference_number, supplier relation instead of customer).
                'query' => fn (string $term) => AccountsPayable::query()
                    ->with('supplier')
                    ->where(function (Builder $q) use ($term) {
                        $q->where('invoice_number', 'ilike', "%{$term}%")
                            ->orWhere('reference_number', 'ilike', "%{$term}%")
                            ->orWhereHas('supplier', fn (Builder $sq) => $sq->where('supplier_name', 'ilike', "%{$term}%"));
                    }),
                'map' => fn (AccountsPayable $r) => [
                    'id' => $r->id,
                    'title' => $r->invoice_number,
                    'subtitle' => $r->supplier?->supplier_name,
                    'meta' => (float) $r->remaining_balance,
                    'search_hint' => $r->invoice_number,
                ],
            ],
            [
                'type' => 'collections',
                'label' => 'Collections',
                'route' => '/transactions/collections',
                'permission' => 'collections.view',
                'query' => fn (string $term) => Collection::query()->search($term),
                'map' => fn (Collection $c) => [
                    'id' => $c->id,
                    'title' => $c->receipt_number,
                    'subtitle' => $c->or_number,
                    'meta' => (float) $c->amount_received,
                    'search_hint' => $c->receipt_number,
                ],
            ],
            [
                'type' => 'disbursements',
                'label' => 'Disbursements',
                'route' => '/transactions/disbursements',
                'permission' => 'disbursements.view',
                // No scopeSearch() on Disbursement — voucher_number, payee,
                // reference_number are the only free-text identifying
                // columns on this table (see the model's $fillable).
                'query' => fn (string $term) => Disbursement::query()->where(function (Builder $q) use ($term) {
                    $q->where('voucher_number', 'ilike', "%{$term}%")
                        ->orWhere('payee', 'ilike', "%{$term}%")
                        ->orWhere('reference_number', 'ilike', "%{$term}%");
                }),
                'map' => fn (Disbursement $d) => [
                    'id' => $d->id,
                    'title' => $d->voucher_number,
                    'subtitle' => $d->payee,
                    'meta' => (float) $d->amount_paid,
                    'search_hint' => $d->voucher_number,
                ],
            ],
            [
                'type' => 'budgets',
                'label' => 'Budgets',
                'route' => '/transactions/budgets',
                'permission' => 'budgets.view',
                // No scopeSearch() on Budget — budget_name/budget_code are
                // the columns BudgetController/Budgets.jsx already treat as
                // the record's identity.
                'query' => fn (string $term) => Budget::query()->where(function (Builder $q) use ($term) {
                    $q->where('budget_name', 'ilike', "%{$term}%")
                        ->orWhere('budget_code', 'ilike', "%{$term}%");
                }),
                'map' => fn (Budget $b) => [
                    'id' => $b->id,
                    'title' => $b->budget_name,
                    'subtitle' => $b->budget_code,
                    'meta' => (float) $b->remaining_amount,
                    'search_hint' => $b->budget_name,
                ],
            ],
            [
                'type' => 'expenses',
                'label' => 'Expenses',
                'route' => '/transactions/expenses',
                'permission' => 'expenses.view',
                'query' => fn (string $term) => Expense::query()->search($term),
                'map' => fn (Expense $e) => [
                    'id' => $e->id,
                    'title' => $e->description ?: $e->expense_source,
                    'subtitle' => $e->receipt_number ? "Receipt: {$e->receipt_number}" : $e->expense_source,
                    'meta' => (float) $e->expense_amount,
                    'search_hint' => $e->receipt_number ?: $e->description,
                ],
            ],
            [
                'type' => 'tax',
                'label' => 'Tax Obligations',
                'route' => '/transactions/tax-obligations',
                'permission' => 'tax.view',
                'query' => fn (string $term) => TaxObligation::query()->search($term),
                'map' => fn (TaxObligation $t) => [
                    'id' => $t->id,
                    'title' => $t->tax_type,
                    'subtitle' => $t->tax_period,
                    'meta' => (float) $t->tax_amount,
                    'search_hint' => $t->tax_type,
                ],
            ],
        ];
    }
}
