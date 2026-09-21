<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Master data (customers, suppliers, collectors, cash accounts, fixed
 * assets, users)
 * is Admin/Super Admin territory. A non-admin role that still holds a
 * `*.manage` permission — either from the legacy staff seeder defaults or
 * from a manual Roles.jsx grant — is nonetheless blocked from mutating it
 * here. This role gate mirrors what the frontend hides (the Add/Edit/
 * Archive buttons are only rendered for Admin/Super Admin), so the button
 * and the enforcement can never drift: the UI hides it AND the backend
 * rejects it.
 */
trait RestrictsMasterDataToAdmins
{
    /**
     * @return JsonResponse|null 403 response when non-admin, else null
     */
    protected function ensureMasterDataAdmin(User $user): ?JsonResponse
    {
        if ($user->hasAnyRole(['admin', 'super-admin'])) {
            return null;
        }

        return response()->json([
            'success' => false,
            'message' => 'Only administrators are authorized to add, edit, or archive master data.',
        ], 403);
    }
}
