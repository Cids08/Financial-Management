<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ProfileController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\AccountSecurityController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\PermissionController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\CollectorController;
use App\Http\Controllers\Api\CashAccountController;
use App\Http\Controllers\Api\FixedAssetController;
use App\Http\Controllers\Api\AccountsReceivableController;
use App\Http\Controllers\Api\AccountsPayableController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\ExpenseCategoryController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\GeneralLedgerController;
use App\Http\Controllers\Api\TaxObligationController;
use App\Http\Controllers\Api\InvoiceScanController;
use App\Http\Controllers\Api\AiRecommendationController;
use App\Http\Controllers\Api\AiAdvisorController;
use App\Http\Controllers\Api\FinancialForecastController;
use App\Http\Controllers\Api\ServiceAreaController;
use App\Http\Controllers\Api\CollectionController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\BudgetController;
use App\Http\Controllers\Api\DisbursementController;
use Illuminate\Support\Facades\Broadcast;

Broadcast::routes(['middleware' => ['auth:sanctum']]);
 

// Public — no token exists yet at this point, so this cannot sit inside
// the auth:sanctum group. Throttled to slow down brute-force attempts.
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1' , 'honeypot'); // 5 attempts per minute per IP

// Public — step 2 of a 2FA login. Same reasoning as /login above: the
// pending-login ticket proves the password was already verified, but no
// Sanctum token exists yet at this point, so these can't sit inside the
// auth:sanctum group. Throttled for the same guessing-attack reason as
// /settings/2fa/confirm below — a 6-digit code is only ~1,000,000
// possibilities, so this must never be left unthrottled.
Route::post('/login/verify-two-factor', [AuthController::class, 'verifyTwoFactor'])
    ->middleware('throttle:5,1' , 'honeypot');

Route::post('/login/resend-two-factor', [AuthController::class, 'resendTwoFactor'])
    ->middleware('throttle:5,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    // Profile and notifications are personal to the logged-in user — no
    // module permission applies, just being authenticated.
    Route::prefix('profile')->group(function () {
        Route::get('/', [ProfileController::class, 'show']);
        Route::put('/', [ProfileController::class, 'update']);
        Route::post('/avatar', [ProfileController::class, 'updateAvatar']);
        Route::delete('/avatar', [ProfileController::class, 'removeAvatar']);
    });

    Route::prefix('notifications')->group(function () {
        Route::get('/', [NotificationController::class, 'index']);
        Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
        Route::patch('/read-all', [NotificationController::class, 'markAllAsRead']);
        Route::patch('/{notification}/read', [NotificationController::class, 'markAsRead']);
        Route::delete('/{notification}', [NotificationController::class, 'destroy']);
    });

    // Any logged-in user needs their own permission list to render their
    // own sidebar/route guards — deliberately NOT gated by any permission.
    Route::get('/me/permissions', [PermissionController::class, 'mine']);

    // Settings: reading company branding/regional defaults is open to any
    // authenticated user — CompanyProvider fetches this on every page for
    // the sidebar's name/logo, so gating it behind settings.view broke
    // branding app-wide for any role without that permission (Staff,
    // Collector), not just on the Settings page itself. Editing still
    // requires settings.manage. Password/2FA/sessions/activity are the
    // logged-in user's OWN account, so no module permission applies there
    // — just being authenticated.
    Route::prefix('settings')->group(function () {
        Route::get('/', [SettingsController::class, 'show']);
        Route::put('/', [SettingsController::class, 'update'])->middleware('permission:settings.manage');
        Route::post('/logo', [SettingsController::class, 'updateLogo'])->middleware('permission:settings.manage');
        Route::delete('/logo', [SettingsController::class, 'removeLogo'])->middleware('permission:settings.manage');

        Route::get('/sessions', [AccountSecurityController::class, 'sessions']);
        Route::delete('/sessions/{tokenId}', [AccountSecurityController::class, 'revokeSession']);
        Route::delete('/sessions', [AccountSecurityController::class, 'revokeOtherSessions']);

        Route::get('/activity', [AccountSecurityController::class, 'activity']);
        Route::post('/2fa/initiate', [AccountSecurityController::class, 'initiateTwoFactor']);

        // 6-digit TOTP code = 1,000,000 possible values. This route used to
        // sit outside every throttle group, making the code brute-forceable
        // with no rate limit. Throttled tighter than the general settings
        // actions below since this is a guessing attack surface.
        Route::post('/2fa/confirm', [AccountSecurityController::class, 'confirmTwoFactor'])
            ->middleware('throttle:5,1' , 'honeypot');

        Route::middleware('throttle:10,1')->group(function () {
            Route::put('/password', [AccountSecurityController::class, 'updatePassword']);
            Route::delete('/2fa', [AccountSecurityController::class, 'disableTwoFactor']);
            Route::post('/deactivate', [AccountSecurityController::class, 'deactivate']);
            Route::get('/2fa', [AccountSecurityController::class, 'status']);
        });
    });

    // Users.jsx (User Management > Users) — Admin only
    Route::prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index'])->middleware('permission:users.view');
        Route::post('/', [UserController::class, 'store'])->middleware('permission:users.manage');
        Route::put('/{user}', [UserController::class, 'update'])->middleware('permission:users.manage');
        Route::delete('/{user}', [UserController::class, 'archive'])->middleware('permission:users.manage');

        Route::patch('/{user}/restore', [UserController::class, 'restore'])
            ->middleware('permission:users.manage')
            ->withTrashed();
    });

    // Roles.jsx — Admin only
    Route::prefix('roles')->group(function () {
        Route::get('/', [RoleController::class, 'index'])->middleware('permission:roles.view');
        Route::get('/{role}', [RoleController::class, 'show'])->middleware('permission:roles.view');
        Route::post('/', [RoleController::class, 'store'])->middleware('permission:roles.manage');
        Route::put('/{role}', [RoleController::class, 'update'])->middleware('permission:roles.manage');
        Route::delete('/{role}', [RoleController::class, 'destroy'])->middleware('permission:roles.manage');
        Route::put('/{role}/permissions', [RoleController::class, 'updatePermissions'])->middleware('permission:roles.manage');
    });

    // Powers the permission checkboxes in Roles.jsx — gated the same as
    // viewing roles, since it's only ever consumed from that screen.
    Route::get('/permissions', [PermissionController::class, 'index'])->middleware('permission:roles.view');

    // Master Data — not in the given hierarchy, defaulted to Admin-only.
    Route::prefix('departments')->group(function () {
        Route::get('/stats', [DepartmentController::class, 'stats'])->middleware('permission:departments.view');
        Route::get('/', [DepartmentController::class, 'index'])->middleware('permission:departments.view');
        Route::post('/', [DepartmentController::class, 'store'])->middleware('permission:departments.manage');
        Route::put('/{department}', [DepartmentController::class, 'update'])->middleware('permission:departments.manage');
        Route::delete('/{department}', [DepartmentController::class, 'destroy'])->middleware('permission:departments.manage');
    });

    // Customers — Admin + Staff (manage); Collector gets view only.
    Route::prefix('customers')->group(function () {
        Route::get('/stats', [CustomerController::class, 'stats'])->middleware('permission:customers.view');
        Route::get('/', [CustomerController::class, 'index'])->middleware('permission:customers.view');
        Route::post('/', [CustomerController::class, 'store'])->middleware('permission:customers.manage');
        Route::put('/{customer}', [CustomerController::class, 'update'])->middleware('permission:customers.manage');
        Route::patch('/{customer}/archive', [CustomerController::class, 'archive'])->middleware('permission:customers.manage');
        Route::patch('/{customer}/restore', [CustomerController::class, 'restore'])->middleware('permission:customers.manage');
    });

    // Suppliers — Admin + Staff
    Route::prefix('suppliers')->group(function () {
        Route::get('/stats', [SupplierController::class, 'stats'])->middleware('permission:suppliers.view');
        Route::get('/', [SupplierController::class, 'index'])->middleware('permission:suppliers.view');
        Route::post('/', [SupplierController::class, 'store'])->middleware('permission:suppliers.manage');
        Route::put('/{supplier}', [SupplierController::class, 'update'])->middleware('permission:suppliers.manage');
        Route::patch('/{supplier}/archive', [SupplierController::class, 'archive'])->middleware('permission:suppliers.manage');
        Route::patch('/{supplier}/restore', [SupplierController::class, 'restore'])->middleware('permission:suppliers.manage');
    });

    // Master Data — Collectors (the employee/master-data record, distinct
    // from the "Collector" role) — not in the hierarchy, Admin-only.
    Route::prefix('collectors')->group(function () {
        Route::get('/', [CollectorController::class, 'index'])->middleware('permission:collectors.view');
        Route::post('/', [CollectorController::class, 'store'])->middleware('permission:collectors.manage');
        Route::put('/{collector}', [CollectorController::class, 'update'])->middleware('permission:collectors.manage');
        Route::delete('/{collector}', [CollectorController::class, 'archive'])->middleware('permission:collectors.manage');
        Route::patch('/{collector}/restore', [CollectorController::class, 'restore'])->middleware('permission:collectors.manage');
        Route::get('/{collector}/efficiency', [CollectorController::class, 'efficiency'])->middleware('permission:collectors.view');
    });

    // Master Data — Cash Accounts — not in the hierarchy, Admin-only.
    // NOTE: hyphenated slug (cash-accounts), matching PermissionSeeder —
    // NOT cash_accounts (underscore), which never existed as a real permission.
    Route::prefix('cash-accounts')->group(function () {
        Route::get('/', [CashAccountController::class, 'index'])->middleware('permission:cash-accounts.view');
        Route::post('/', [CashAccountController::class, 'store'])->middleware('permission:cash-accounts.manage');
        Route::put('/{cashAccount}', [CashAccountController::class, 'update'])->middleware('permission:cash-accounts.manage');
        Route::delete('/{cashAccount}', [CashAccountController::class, 'archive'])->middleware('permission:cash-accounts.manage');
        Route::patch('/{cashAccount}/restore', [CashAccountController::class, 'restore'])->middleware('permission:cash-accounts.manage');
    });

    // Master Data — Fixed Assets — not in the hierarchy, Admin-only.
    // Hyphenated slug, same reasoning as cash-accounts above.
    Route::prefix('fixed-assets')->group(function () {
        Route::get('/', [FixedAssetController::class, 'index'])->middleware('permission:fixed-assets.view');
        Route::post('/', [FixedAssetController::class, 'store'])->middleware('permission:fixed-assets.manage');
        Route::put('/{fixedAsset}', [FixedAssetController::class, 'update'])->middleware('permission:fixed-assets.manage');
        Route::delete('/{fixedAsset}', [FixedAssetController::class, 'archive'])->middleware('permission:fixed-assets.manage');
        Route::patch('/{fixedAsset}/restore', [FixedAssetController::class, 'restore'])->middleware('permission:fixed-assets.manage');
    });

    // Master Data — Expense Categories. Staff gets .view (dropdown
    // dependency for the Expenses form); only Admin gets .manage.
    // Hyphenated slug (expense-categories), matching PermissionSeeder.
    Route::prefix('expense-categories')->group(function () {
        Route::get('/', [ExpenseCategoryController::class, 'index'])->middleware('permission:expense-categories.view');
        Route::post('/', [ExpenseCategoryController::class, 'store'])->middleware('permission:expense-categories.manage');
        Route::put('/{expenseCategory}', [ExpenseCategoryController::class, 'update'])->middleware('permission:expense-categories.manage');
        Route::patch('/{expenseCategory}/archive', [ExpenseCategoryController::class, 'archive'])->middleware('permission:expense-categories.manage');
        Route::patch('/{expenseCategory}/restore', [ExpenseCategoryController::class, 'restore'])
            ->middleware('permission:expense-categories.manage')
            ->withTrashed();
    });

    // Financial Transactions - Accounts Receivable — Admin + Staff (manage);
    // Collector gets view only via ar.view.
    Route::middleware('permission:ar.view')->get('accounts-receivable', [AccountsReceivableController::class, 'index']);
    Route::middleware('permission:ar.manage')->post('accounts-receivable', [AccountsReceivableController::class, 'store']);
    Route::middleware('permission:ar.manage')->put('accounts-receivable/{accountsReceivable}', [AccountsReceivableController::class, 'update']);
    Route::middleware('permission:ar.manage')->post('accounts-receivable/{accountsReceivable}/toggle-archive', [AccountsReceivableController::class, 'toggleArchive']);

    // Financial Transactions - Accounts Payable — Admin + Staff get
    // view/manage; approve is its OWN permission, Admin only, so Staff
    // having ap.manage (for create/edit) can never also approve.
    Route::prefix('accounts-payable')->group(function () {
        Route::get('/stats', [AccountsPayableController::class, 'stats'])->middleware('permission:ap.view');
        Route::get('/', [AccountsPayableController::class, 'index'])->middleware('permission:ap.view');
        Route::post('/', [AccountsPayableController::class, 'store'])->middleware('permission:ap.manage');
        Route::put('/{accountsPayable}', [AccountsPayableController::class, 'update'])->middleware('permission:ap.manage');
        Route::patch('/{accountsPayable}/approve', [AccountsPayableController::class, 'approve'])->middleware('permission:ap.approve');
        Route::patch('/{accountsPayable}/archive', [AccountsPayableController::class, 'archive'])->middleware('permission:ap.manage');
        Route::patch('/{accountsPayable}/restore', [AccountsPayableController::class, 'restore'])
            ->middleware('permission:ap.manage')
            ->withTrashed();
    });

    // Financial Transactions - Expenses — same pattern as Accounts Payable:
    // approve/reject require expenses.approve, NOT expenses.manage.
    Route::prefix('expenses')->group(function () {
        Route::get('/stats', [ExpenseController::class, 'stats'])->middleware('permission:expenses.view');
        Route::get('/', [ExpenseController::class, 'index'])->middleware('permission:expenses.view');
        Route::get('/{expense}', [ExpenseController::class, 'show'])->middleware('permission:expenses.view');
        Route::post('/', [ExpenseController::class, 'store'])->middleware('permission:expenses.manage');
        Route::put('/{expense}', [ExpenseController::class, 'update'])->middleware('permission:expenses.manage');
        Route::patch('/{expense}/approve', [ExpenseController::class, 'approve'])->middleware('permission:expenses.approve');
        Route::patch('/{expense}/reject', [ExpenseController::class, 'reject'])->middleware('permission:expenses.approve');
        Route::patch('/{expense}/archive', [ExpenseController::class, 'archive'])->middleware('permission:expenses.manage');

        Route::patch('/{expense}/restore', [ExpenseController::class, 'restore'])
            ->middleware('permission:expenses.manage')
            ->withTrashed();
    });

    // Dashboard — open to any authenticated user; DashboardController
    // itself renders different content per role (Admin/Super Admin see
    // one view, Staff/Collector see their own), so this route needs no
    // module permission gate — every role has its own dashboard, this
    // isn't an "Admin-only" module. Previously gated behind
    // permission:dashboard.view, which incorrectly 403'd every non-Admin
    // role out of their own dashboard.
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/dashboard/charts', [DashboardController::class, 'charts']);

    // Invoice OCR scan — shared utility used by both the AR and AP "Add"
    // forms. Left ungated by module permission (just auth:sanctum); anyone
    // who can reach an Add Invoice/Bill form can use the scanner that fills
    // it, which mirrors ar.manage/ap.manage access already implied by the
    // page they're on.
    Route::post('invoices/scan', [InvoiceScanController::class, 'scan'])->middleware('throttle:10,1');

    // General Ledger — not in the hierarchy, Admin-only (view only, no
    // manage action exists here — it's a derived/read view over posted
    // transactions, not something directly edited). Hyphenated slug.
    Route::middleware('permission:general-ledger.view')->prefix('general-ledger')->group(function () {
        Route::get('/lines', [GeneralLedgerController::class, 'lines']);
        Route::get('/trial-balance', [GeneralLedgerController::class, 'trialBalance']);
        Route::get('/entries/{journalEntry}', [GeneralLedgerController::class, 'entryDetail']);
        Route::get('/chart-of-accounts', [GeneralLedgerController::class, 'accounts']);
    });

    // Financial Transactions — Tax Obligations — not in the hierarchy,
    // Admin-only. Permission slug is 'tax' (not 'tax_obligations' or
    // 'tax-obligations'), matching PermissionSeeder exactly.
    Route::prefix('tax-obligations')->group(function () {
        Route::get('/', [TaxObligationController::class, 'index'])->middleware('permission:tax.view');
        Route::post('/', [TaxObligationController::class, 'store'])->middleware('permission:tax.manage');
        Route::put('/{taxObligation}', [TaxObligationController::class, 'update'])->middleware('permission:tax.manage');
        Route::delete('/{taxObligation}', [TaxObligationController::class, 'archive'])->middleware('permission:tax.manage');
        Route::patch('/{taxObligation}/restore', [TaxObligationController::class, 'restore'])->middleware('permission:tax.manage');
    });

    // Analytics — AI Recommendations (matches "AI Decision Support" in the
    // hierarchy) — Admin only. Permission slug is 'ai.view', not
    // 'ai_decision_support.view'.
    Route::middleware('permission:ai.view')->get('ai-recommendations', [AiRecommendationController::class, 'index']);

    // Analytics — AI Advisor chat (the "Ask the AI Advisor" panel on the
    // AI Recommendations page) — gated the same as ai-recommendations
    // itself (ai.view), since it's only ever reached from that screen and
    // reads the same underlying data. {conversation} route-model-binds to
    // AiAdvisorConversation; ownership is enforced in the controller via
    // AiAdvisorConversationPolicy (view/update), not by permission alone —
    // ai.view only gets you into the module, the policy stops you from
    // reading or posting to another user's conversation.
    Route::middleware('permission:ai.view')->prefix('ai-advisor')->group(function () {
        Route::get('/conversations', [AiAdvisorController::class, 'index']);
        Route::post('/conversations', [AiAdvisorController::class, 'start']);
        Route::get('/conversations/{conversation}', [AiAdvisorController::class, 'show']);
        Route::post('/conversations/{conversation}/messages', [AiAdvisorController::class, 'chat']);
    });

    // Analytics — Financial Forecasting (matches "Forecasting") — archive
    // and restore added, following the same pattern as collections below
    // (patch .../archive gated by .manage, patch .../restore gated by
    // .manage AND ->withTrashed() so the route-model-binding can resolve
    // an already-soft-deleted forecast).
    Route::prefix('forecasts')->group(function () {
        Route::get('/', [FinancialForecastController::class, 'index'])
            ->middleware('permission:forecasting.view');
        Route::get('/{financialForecast}', [FinancialForecastController::class, 'show'])
            ->middleware('permission:forecasting.view');
        Route::post('/', [FinancialForecastController::class, 'store'])
            ->middleware('permission:forecasting.manage');
        Route::patch('/{financialForecast}/archive', [FinancialForecastController::class, 'archive'])
            ->middleware('permission:forecasting.manage');
        Route::patch('/{financialForecast}/restore', [FinancialForecastController::class, 'restore'])
            ->middleware('permission:forecasting.manage')
            ->withTrashed();
    });

    // Master Data — Service Areas — not in the hierarchy, Admin-only.
    // Hyphenated slug, same reasoning as cash-accounts/fixed-assets.
    Route::prefix('service-areas')->group(function () {
        Route::get('/', [ServiceAreaController::class, 'index'])->middleware('permission:service-areas.view');
        Route::post('/', [ServiceAreaController::class, 'store'])->middleware('permission:service-areas.manage');
        Route::put('/{serviceArea}', [ServiceAreaController::class, 'update'])->middleware('permission:service-areas.manage');
    });

    // Collections — matches the hierarchy exactly: Collector can view +
    // record (manage), but confirm/cancel (approval-like actions) are
    // Admin-only via collections.confirm.
    Route::prefix('collections')->group(function () {
        Route::get('/', [CollectionController::class, 'index'])->middleware('permission:collections.view');
        Route::post('/', [CollectionController::class, 'store'])->middleware('permission:collections.manage');
        Route::put('/{collection}', [CollectionController::class, 'update'])->middleware('permission:collections.manage');
        Route::patch('/{collection}/confirm', [CollectionController::class, 'confirm'])->middleware('permission:collections.confirm');
        Route::patch('/{collection}/cancel', [CollectionController::class, 'cancel'])->middleware('permission:collections.confirm');
        Route::patch('/{collection}/archive', [CollectionController::class, 'archive'])->middleware('permission:collections.manage');
        Route::patch('/{collection}/restore', [CollectionController::class, 'restore'])->middleware('permission:collections.manage')->withTrashed();
        Route::get('/{collector}/efficiency', [CollectorController::class, 'efficiency'])->middleware('permission:collectors.view');
    });

    // Reports (Financial Reports in the hierarchy) — Admin only.
    Route::middleware('permission:reports.view')->prefix('reports')->group(function () {
        Route::get('/income-statement', [ReportController::class, 'incomeStatement']);
        Route::get('/cash-flow', [ReportController::class, 'cashFlow']);
        Route::get('/ar-aging', [ReportController::class, 'arAging']);
        Route::get('/ap-aging', [ReportController::class, 'apAging']);
        Route::get('/budget-vs-actual', [ReportController::class, 'budgetVsActual']);
    });

    // Financial Transactions — Budgets. Separate module from Disbursements
    // (see below) — budgets.* permissions were seeded distinct from
    // disbursements.*. Same shape as Accounts Payable / Expenses: manage
    // covers create/edit, approve/reject is its OWN permission so Staff
    // with budgets.manage can create/edit but never self-approve.
    Route::prefix('budgets')->group(function () {
        Route::get('/stats', [BudgetController::class, 'stats'])->middleware('permission:budgets.view');
        Route::get('/', [BudgetController::class, 'index'])->middleware('permission:budgets.view');
        Route::get('/{budget}', [BudgetController::class, 'show'])->middleware('permission:budgets.view');
        Route::post('/', [BudgetController::class, 'store'])->middleware('permission:budgets.manage');
        Route::put('/{budget}', [BudgetController::class, 'update'])->middleware('permission:budgets.manage');

        // Attaching the plan is an edit-type action (budgets.manage), not an
        // approval action — this is the document that approve() checks for.
        Route::post('/{budget}/plan', [BudgetController::class, 'uploadPlan'])->middleware('permission:budgets.manage');

        Route::patch('/{budget}/approve', [BudgetController::class, 'approve'])->middleware('permission:budgets.approve');
        Route::patch('/{budget}/reject', [BudgetController::class, 'reject'])->middleware('permission:budgets.approve');
        Route::patch('/{budget}/archive', [BudgetController::class, 'archive'])->middleware('permission:budgets.manage');

        Route::patch('/{budget}/restore', [BudgetController::class, 'restore'])
            ->middleware('permission:budgets.manage')
            ->withTrashed();
    });

    // Disbursements — separate module from Budgets above. Same shape as
    // Accounts Payable: manage covers create/edit, approve is its own
    // permission. Release is gated under the SAME disbursements.approve
    // permission as approve — no separate "release" permission exists in
    // the seeder, and releasing funds is at least as sensitive as
    // approving them.
    Route::prefix('disbursements')->group(function () {
        Route::get('/stats', [DisbursementController::class, 'stats'])->middleware('permission:disbursements.view');
        Route::get('/', [DisbursementController::class, 'index'])->middleware('permission:disbursements.view');
        Route::get('/{disbursement}', [DisbursementController::class, 'show'])->middleware('permission:disbursements.view');
        Route::post('/', [DisbursementController::class, 'store'])->middleware('permission:disbursements.manage');
        Route::put('/{disbursement}', [DisbursementController::class, 'update'])->middleware('permission:disbursements.manage');
        Route::post('/{disbursement}/proof', [DisbursementController::class, 'uploadProof'])->middleware('permission:disbursements.manage');

        Route::patch('/{disbursement}/approve', [DisbursementController::class, 'approve'])->middleware('permission:disbursements.approve');
        Route::patch('/{disbursement}/reject', [DisbursementController::class, 'reject'])->middleware('permission:disbursements.approve');
        Route::patch('/{disbursement}/release', [DisbursementController::class, 'release'])->middleware('permission:disbursements.approve');

        Route::patch('/{disbursement}/archive', [DisbursementController::class, 'archive'])->middleware('permission:disbursements.manage');
        Route::patch('/{disbursement}/restore', [DisbursementController::class, 'restore'])
            ->middleware('permission:disbursements.manage')
            ->withTrashed();
    });

    // Future modules get their own Route::prefix(...) groups here.
});

