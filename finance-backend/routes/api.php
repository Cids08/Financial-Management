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

// Public — no token exists yet at this point, so this cannot sit inside
// the auth:sanctum group. Throttled to slow down brute-force attempts.
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1'); // 5 attempts per minute per IP

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::prefix('profile')->group(function () {
        Route::get('/', [ProfileController::class, 'show']);
        Route::put('/', [ProfileController::class, 'update']);
        Route::post('/avatar', [ProfileController::class, 'updateAvatar']);
        Route::delete('/avatar', [ProfileController::class, 'removeAvatar']);
    });

    // Powers the Header's bell/dropdown (see Header.jsx -> <Notification />)
    Route::prefix('notifications')->group(function () {
        Route::get('/', [NotificationController::class, 'index']);
        Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
        Route::patch('/read-all', [NotificationController::class, 'markAllAsRead']);
        Route::patch('/{notification}/read', [NotificationController::class, 'markAsRead']);
        Route::delete('/{notification}', [NotificationController::class, 'destroy']);
    });

    Route::prefix('settings')->group(function () {
        Route::get('/', [SettingsController::class, 'show']);
        Route::put('/', [SettingsController::class, 'update']);
        Route::post('/logo', [SettingsController::class, 'updateLogo']);
        Route::delete('/logo', [SettingsController::class, 'removeLogo']);

        Route::get('/sessions', [AccountSecurityController::class, 'sessions']);
        Route::delete('/sessions/{tokenId}', [AccountSecurityController::class, 'revokeSession']);
        Route::delete('/sessions', [AccountSecurityController::class, 'revokeOtherSessions']);

        Route::get('/activity', [AccountSecurityController::class, 'activity']);

        Route::post('/2fa/initiate', [AccountSecurityController::class, 'initiateTwoFactor']);
        Route::post('/2fa/confirm', [AccountSecurityController::class, 'confirmTwoFactor']);

        // Sensitive account-security actions — rate limited separately from
        // general API traffic, and (password change already did; 2FA
        // disable / deactivate now also do) require re-confirming the
        // current password so a leaked/leftover session token alone isn't
        // enough to turn off 2FA or kill the account.
        Route::middleware('throttle:10,1')->group(function () {
            Route::put('/password', [AccountSecurityController::class, 'updatePassword']);
            Route::delete('/2fa', [AccountSecurityController::class, 'disableTwoFactor']);
            Route::post('/deactivate', [AccountSecurityController::class, 'deactivate']);
        });
    });

    // Users.jsx (User Management > Users)
    //
    // Example of actually enforcing permissions with the new middleware —
    // uncomment once you've seeded matching permission_name rows
    // ('users.view', 'users.manage') and assigned them to roles via
    // Roles.jsx's permissions modal. Left as plain auth:sanctum below so
    // this doesn't suddenly 403 everyone before you've set that up.
    Route::prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index']);
        // ->middleware('permission:users.view');
        Route::post('/', [UserController::class, 'store']);
        // ->middleware('permission:users.manage');
        Route::put('/{user}', [UserController::class, 'update']);
        // ->middleware('permission:users.manage');
        Route::delete('/{user}', [UserController::class, 'archive']);
        // ->middleware('permission:users.manage');

        // {user} must resolve a soft-deleted record here, hence withTrashed().
        Route::patch('/{user}/restore', [UserController::class, 'restore'])
            ->withTrashed();
    });

    // Powers the role filter/select on Users.jsx, and Roles.jsx's own CRUD.
    Route::prefix('roles')->group(function () {
        Route::get('/', [RoleController::class, 'index']);
        Route::get('/{role}', [RoleController::class, 'show']);
        Route::post('/', [RoleController::class, 'store']);
        Route::put('/{role}', [RoleController::class, 'update']);
        Route::delete('/{role}', [RoleController::class, 'destroy']);
        Route::put('/{role}/permissions', [RoleController::class, 'updatePermissions']);
    });

    // Powers the permission checkboxes in Roles.jsx's "Manage Permissions" modal.
    Route::get('/permissions', [PermissionController::class, 'index']);

    Route::prefix('departments')->group(function () {
        Route::get('/stats', [DepartmentController::class, 'stats']);
        Route::get('/', [DepartmentController::class, 'index']);
        Route::post('/', [DepartmentController::class, 'store']);
        Route::put('/{department}', [DepartmentController::class, 'update']);
        Route::delete('/{department}', [DepartmentController::class, 'destroy']);
    });

    Route::prefix('customers')->group(function () {
        Route::get('/stats', [CustomerController::class, 'stats']);
        Route::get('/', [CustomerController::class, 'index']);
        Route::post('/', [CustomerController::class, 'store']);
        Route::put('/{customer}', [CustomerController::class, 'update']);
        Route::patch('/{customer}/archive', [CustomerController::class, 'archive']);
        Route::patch('/{customer}/restore', [CustomerController::class, 'restore']);
    });

    Route::prefix('suppliers')->group(function () {
        Route::get('/stats', [SupplierController::class, 'stats']);
        Route::get('/', [SupplierController::class, 'index']);
        Route::post('/', [SupplierController::class, 'store']);
        Route::put('/{supplier}', [SupplierController::class, 'update']);
        Route::patch('/{supplier}/archive', [SupplierController::class, 'archive']);
        Route::patch('/{supplier}/restore', [SupplierController::class, 'restore']);
    });

    // Master Data — Collectors (see pages/Collectors.jsx)
    Route::prefix('collectors')->group(function () {
        Route::get('/', [CollectorController::class, 'index']);
        Route::post('/', [CollectorController::class, 'store']);
        Route::put('/{collector}', [CollectorController::class, 'update']);
        Route::delete('/{collector}', [CollectorController::class, 'archive']);
        Route::patch('/{collector}/restore', [CollectorController::class, 'restore']);
    });

    // Master Data — Cash Accounts (see pages/CashAccounts.jsx)
    Route::prefix('cash-accounts')->group(function () {
        Route::get('/', [CashAccountController::class, 'index']);
        Route::post('/', [CashAccountController::class, 'store']);
        Route::put('/{cashAccount}', [CashAccountController::class, 'update']);
        Route::delete('/{cashAccount}', [CashAccountController::class, 'archive']);
        Route::patch('/{cashAccount}/restore', [CashAccountController::class, 'restore']);
    });

    // Future modules (Fixed Assets, Accounts Receivable, etc.) get their
    // own Route::prefix(...) groups here.
});