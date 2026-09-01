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

// Auth
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:5,1', 'honeypot');
Route::post('/login/verify-two-factor', [AuthController::class, 'verifyTwoFactor'])->middleware('throttle:5,1', 'honeypot');
Route::post('/login/resend-two-factor', [AuthController::class, 'resendTwoFactor'])->middleware('throttle:5,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    // Profile
    Route::prefix('profile')->group(function () {
        Route::get('/', [ProfileController::class, 'show']);
        Route::put('/', [ProfileController::class, 'update']);
        Route::post('/avatar', [ProfileController::class, 'updateAvatar']);
        Route::delete('/avatar', [ProfileController::class, 'removeAvatar']);
    });

    // Notifications
    Route::prefix('notifications')->group(function () {
        Route::get('/', [NotificationController::class, 'index']);
        Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
        Route::patch('/read-all', [NotificationController::class, 'markAllAsRead']);
        Route::patch('/{notification}/read', [NotificationController::class, 'markAsRead']);
        Route::delete('/{notification}', [NotificationController::class, 'destroy']);
    });

    // Current user's own permissions
    Route::get('/me/permissions', [PermissionController::class, 'mine']);

    // Settings
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
        Route::post('/2fa/confirm', [AccountSecurityController::class, 'confirmTwoFactor'])->middleware('throttle:5,1', 'honeypot');

        Route::middleware('throttle:10,1')->group(function () {
            Route::put('/password', [AccountSecurityController::class, 'updatePassword']);
            Route::delete('/2fa', [AccountSecurityController::class, 'disableTwoFactor']);
            Route::post('/deactivate', [AccountSecurityController::class, 'deactivate']);
            Route::get('/2fa', [AccountSecurityController::class, 'status']);
        });
    });

    // Users
    Route::prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index'])->middleware('permission:users.view');
        Route::post('/', [UserController::class, 'store'])->middleware('permission:users.manage');
        Route::put('/{user}', [UserController::class, 'update'])->middleware('permission:users.manage');
        Route::delete('/{user}', [UserController::class, 'archive'])->middleware('permission:users.manage');
        Route::patch('/{user}/restore', [UserController::class, 'restore'])->middleware('permission:users.manage')->withTrashed();
    });

    // Roles
    Route::prefix('roles')->group(function () {
        Route::get('/', [RoleController::class, 'index'])->middleware('permission:roles.view');
        Route::get('/{role}', [RoleController::class, 'show'])->middleware('permission:roles.view');
        Route::post('/', [RoleController::class, 'store'])->middleware('permission:roles.manage');
        Route::put('/{role}', [RoleController::class, 'update'])->middleware('permission:roles.manage');
        Route::delete('/{role}', [RoleController::class, 'destroy'])->middleware('permission:roles.manage');
        Route::put('/{role}/permissions', [RoleController::class, 'updatePermissions'])->middleware('permission:roles.manage');
    });

    // Permissions list (Roles.jsx checkboxes)
    Route::get('/permissions', [PermissionController::class, 'index'])->middleware('permission:roles.view');

    // Departments
    Route::prefix('departments')->group(function () {
        Route::get('/stats', [DepartmentController::class, 'stats'])->middleware('permission:departments.view');
        Route::get('/', [DepartmentController::class, 'index'])->middleware('permission:departments.view');
        Route::post('/', [DepartmentController::class, 'store'])->middleware('permission:departments.manage');
        Route::put('/{department}', [DepartmentController::class, 'update'])->middleware('permission:departments.manage');
        Route::delete('/{department}', [DepartmentController::class, 'destroy'])->middleware('permission:departments.manage');
    });

    // Customers
    Route::prefix('customers')->group(function () {
        Route::get('/stats', [CustomerController::class, 'stats'])->middleware('permission:customers.view');
        Route::get('/', [CustomerController::class, 'index'])->middleware('permission:customers.view');
        Route::post('/', [CustomerController::class, 'store'])->middleware('permission:customers.manage');
        Route::put('/{customer}', [CustomerController::class, 'update'])->middleware('permission:customers.manage');
        Route::patch('/{customer}/archive', [CustomerController::class, 'archive'])->middleware('permission:customers.manage');
        Route::patch('/{customer}/restore', [CustomerController::class, 'restore'])->middleware('permission:customers.manage');
    });

    // Suppliers
    Route::prefix('suppliers')->group(function () {
        Route::get('/stats', [SupplierController::class, 'stats'])->middleware('permission:suppliers.view');
        Route::get('/', [SupplierController::class, 'index'])->middleware('permission:suppliers.view');
        Route::post('/', [SupplierController::class, 'store'])->middleware('permission:suppliers.manage');
        Route::put('/{supplier}', [SupplierController::class, 'update'])->middleware('permission:suppliers.manage');
        Route::patch('/{supplier}/archive', [SupplierController::class, 'archive'])->middleware('permission:suppliers.manage');
        Route::patch('/{supplier}/restore', [SupplierController::class, 'restore'])->middleware('permission:suppliers.manage');
    });

    // Collectors (master data)
    Route::prefix('collectors')->group(function () {
        Route::get('/', [CollectorController::class, 'index'])->middleware('permission:collectors.view');
        Route::post('/', [CollectorController::class, 'store'])->middleware('permission:collectors.manage');
        Route::put('/{collector}', [CollectorController::class, 'update'])->middleware('permission:collectors.manage');
        Route::delete('/{collector}', [CollectorController::class, 'archive'])->middleware('permission:collectors.manage');
        Route::patch('/{collector}/restore', [CollectorController::class, 'restore'])->middleware('permission:collectors.manage');
        Route::get('/{collector}/efficiency', [CollectorController::class, 'efficiency'])->middleware('permission:collectors.view');
    });

    // Cash accounts
    Route::prefix('cash-accounts')->group(function () {
        Route::get('/', [CashAccountController::class, 'index'])->middleware('permission:cash-accounts.view');
        Route::post('/', [CashAccountController::class, 'store'])->middleware('permission:cash-accounts.manage');
        Route::put('/{cashAccount}', [CashAccountController::class, 'update'])->middleware('permission:cash-accounts.manage');
        Route::delete('/{cashAccount}', [CashAccountController::class, 'archive'])->middleware('permission:cash-accounts.manage');
        Route::patch('/{cashAccount}/restore', [CashAccountController::class, 'restore'])->middleware('permission:cash-accounts.manage');
    });

    // Fixed assets
    Route::prefix('fixed-assets')->group(function () {
        Route::get('/', [FixedAssetController::class, 'index'])->middleware('permission:fixed-assets.view');
        Route::post('/', [FixedAssetController::class, 'store'])->middleware('permission:fixed-assets.manage');
        Route::put('/{fixedAsset}', [FixedAssetController::class, 'update'])->middleware('permission:fixed-assets.manage');
        Route::delete('/{fixedAsset}', [FixedAssetController::class, 'archive'])->middleware('permission:fixed-assets.manage');
        Route::patch('/{fixedAsset}/restore', [FixedAssetController::class, 'restore'])->middleware('permission:fixed-assets.manage');
    });

    // Expense categories
    Route::prefix('expense-categories')->group(function () {
        Route::get('/', [ExpenseCategoryController::class, 'index'])->middleware('permission:expense-categories.view');
        Route::post('/', [ExpenseCategoryController::class, 'store'])->middleware('permission:expense-categories.manage');
        Route::put('/{expenseCategory}', [ExpenseCategoryController::class, 'update'])->middleware('permission:expense-categories.manage');
        Route::patch('/{expenseCategory}/archive', [ExpenseCategoryController::class, 'archive'])->middleware('permission:expense-categories.manage');
        Route::patch('/{expenseCategory}/restore', [ExpenseCategoryController::class, 'restore'])->middleware('permission:expense-categories.manage')->withTrashed();
    });

    // Accounts receivable
    Route::middleware('permission:ar.view')->get('accounts-receivable', [AccountsReceivableController::class, 'index']);
    Route::middleware('permission:ar.manage')->post('accounts-receivable', [AccountsReceivableController::class, 'store']);
    Route::middleware('permission:ar.manage')->put('accounts-receivable/{accountsReceivable}', [AccountsReceivableController::class, 'update']);
    Route::middleware('permission:ar.manage')->post('accounts-receivable/{accountsReceivable}/toggle-archive', [AccountsReceivableController::class, 'toggleArchive']);

    // Accounts payable
    Route::prefix('accounts-payable')->group(function () {
        Route::get('/stats', [AccountsPayableController::class, 'stats'])->middleware('permission:ap.view');
        Route::get('/', [AccountsPayableController::class, 'index'])->middleware('permission:ap.view');
        Route::post('/', [AccountsPayableController::class, 'store'])->middleware('permission:ap.manage');
        Route::put('/{accountsPayable}', [AccountsPayableController::class, 'update'])->middleware('permission:ap.manage');
        Route::patch('/{accountsPayable}/approve', [AccountsPayableController::class, 'approve'])->middleware('permission:ap.approve');
        Route::patch('/{accountsPayable}/archive', [AccountsPayableController::class, 'archive'])->middleware('permission:ap.manage');
        Route::patch('/{accountsPayable}/restore', [AccountsPayableController::class, 'restore'])->middleware('permission:ap.manage')->withTrashed();
    });

    // Expenses
    Route::prefix('expenses')->group(function () {
        Route::get('/stats', [ExpenseController::class, 'stats'])->middleware('permission:expenses.view');
        Route::get('/', [ExpenseController::class, 'index'])->middleware('permission:expenses.view');
        Route::get('/{expense}', [ExpenseController::class, 'show'])->middleware('permission:expenses.view');
        Route::post('/', [ExpenseController::class, 'store'])->middleware('permission:expenses.manage');
        Route::put('/{expense}', [ExpenseController::class, 'update'])->middleware('permission:expenses.manage');
        Route::patch('/{expense}/approve', [ExpenseController::class, 'approve'])->middleware('permission:expenses.approve');
        Route::patch('/{expense}/reject', [ExpenseController::class, 'reject'])->middleware('permission:expenses.approve');
        Route::patch('/{expense}/archive', [ExpenseController::class, 'archive'])->middleware('permission:expenses.manage');
        Route::patch('/{expense}/restore', [ExpenseController::class, 'restore'])->middleware('permission:expenses.manage')->withTrashed();
    });

    // Dashboard
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/dashboard/charts', [DashboardController::class, 'charts']);

    // Invoice OCR scan
    Route::post('invoices/scan', [InvoiceScanController::class, 'scan'])->middleware('throttle:10,1');

    // General ledger
    Route::middleware('permission:general-ledger.view')->prefix('general-ledger')->group(function () {
        Route::get('/lines', [GeneralLedgerController::class, 'lines']);
        Route::get('/trial-balance', [GeneralLedgerController::class, 'trialBalance']);
        Route::get('/entries/{journalEntry}', [GeneralLedgerController::class, 'entryDetail']);
        Route::get('/chart-of-accounts', [GeneralLedgerController::class, 'accounts']);
    });

    // Tax obligations
    Route::prefix('tax-obligations')->group(function () {
        Route::get('/', [TaxObligationController::class, 'index'])->middleware('permission:tax.view');
        Route::post('/', [TaxObligationController::class, 'store'])->middleware('permission:tax.manage');
        Route::put('/{taxObligation}', [TaxObligationController::class, 'update'])->middleware('permission:tax.manage');
        Route::delete('/{taxObligation}', [TaxObligationController::class, 'archive'])->middleware('permission:tax.manage');
        Route::patch('/{taxObligation}/restore', [TaxObligationController::class, 'restore'])->middleware('permission:tax.manage');
    });

    // AI recommendations
    Route::middleware('permission:ai.view')->get('ai-recommendations', [AiRecommendationController::class, 'index']);

    // AI advisor
    Route::middleware('permission:ai.view')->prefix('ai-advisor')->group(function () {
        Route::get('/conversations', [AiAdvisorController::class, 'index']);
        Route::post('/conversations', [AiAdvisorController::class, 'start']);
        Route::get('/conversations/{conversation}', [AiAdvisorController::class, 'show']);
        Route::post('/conversations/{conversation}/messages', [AiAdvisorController::class, 'chat']);
    });

    // Forecasting
    Route::prefix('forecasts')->group(function () {
        Route::get('/', [FinancialForecastController::class, 'index'])->middleware('permission:forecasting.view');
        Route::get('/{financialForecast}', [FinancialForecastController::class, 'show'])->middleware('permission:forecasting.view');
        Route::post('/', [FinancialForecastController::class, 'store'])->middleware('permission:forecasting.manage');
        Route::patch('/{financialForecast}/archive', [FinancialForecastController::class, 'archive'])->middleware('permission:forecasting.manage');
        Route::patch('/{financialForecast}/restore', [FinancialForecastController::class, 'restore'])->middleware('permission:forecasting.manage')->withTrashed();
    });

    // Service areas
    Route::prefix('service-areas')->group(function () {
        Route::get('/', [ServiceAreaController::class, 'index'])->middleware('permission:service-areas.view');
        Route::post('/', [ServiceAreaController::class, 'store'])->middleware('permission:service-areas.manage');
        Route::put('/{serviceArea}', [ServiceAreaController::class, 'update'])->middleware('permission:service-areas.manage');
    });

    // Collections
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

    // Reports
    Route::middleware('permission:reports.view')->prefix('reports')->group(function () {
        Route::get('/income-statement', [ReportController::class, 'incomeStatement']);
        Route::get('/cash-flow', [ReportController::class, 'cashFlow']);
        Route::get('/ar-aging', [ReportController::class, 'arAging']);
        Route::get('/ap-aging', [ReportController::class, 'apAging']);
        Route::get('/budget-vs-actual', [ReportController::class, 'budgetVsActual']);
    });

    // Budgets
    Route::prefix('budgets')->group(function () {
        Route::get('/stats', [BudgetController::class, 'stats'])->middleware('permission:budgets.view');
        Route::get('/', [BudgetController::class, 'index'])->middleware('permission:budgets.view');
        Route::get('/{budget}', [BudgetController::class, 'show'])->middleware('permission:budgets.view');
        Route::post('/', [BudgetController::class, 'store'])->middleware('permission:budgets.manage');
        Route::put('/{budget}', [BudgetController::class, 'update'])->middleware('permission:budgets.manage');
        Route::post('/{budget}/plan', [BudgetController::class, 'uploadPlan'])->middleware('permission:budgets.manage');
        Route::get('/{budget}/plan', [BudgetController::class, 'downloadPlan'])->middleware('permission:budgets.view');
        Route::get('/{budget}/plans', [BudgetController::class, 'planHistory'])->middleware('permission:budgets.view');
        Route::get('/{budget}/plans/{document}', [BudgetController::class, 'downloadPlanVersion'])->middleware('permission:budgets.view');
        Route::patch('/{budget}/approve', [BudgetController::class, 'approve'])->middleware('permission:budgets.approve');
        Route::patch('/{budget}/reject', [BudgetController::class, 'reject'])->middleware('permission:budgets.approve');
        Route::patch('/{budget}/archive', [BudgetController::class, 'archive'])->middleware('permission:budgets.manage');
        Route::patch('/{budget}/restore', [BudgetController::class, 'restore'])->middleware('permission:budgets.manage')->withTrashed();
        Route::get('/{budget}/plan/view', [BudgetController::class, 'viewPlan'])->middleware('permission:budgets.view');
        Route::get('/{budget}/plans/{document}/view', [BudgetController::class, 'viewPlanVersion'])->middleware('permission:budgets.view');
    });

    // Disbursements
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
        Route::patch('/{disbursement}/restore', [DisbursementController::class, 'restore'])->middleware('permission:disbursements.manage')->withTrashed();
    });

    // Future modules go here.
});