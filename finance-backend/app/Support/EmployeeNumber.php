<?php

namespace App\Support;

use App\Models\Collector;
use App\Models\User;

/**
 * The one place that mints employee numbers.
 *
 * Two tables keep the same identifier and their index rules differ:
 *
 *   users.employee_no      — plain unique index. An archived user keeps
 *                            their number forever, so it is never reissued.
 *   collectors.employee_no — partial unique index (live rows only), so an
 *                            archived collector releases its number. The
 *                            number is still skipped here on purpose: it
 *                            is somebody's historical record and reissuing
 *                            it would silently move their collections to
 *                            whoever receives it next.
 *
 * The counter derives from max(users.id) including trashed — the sequence
 * UserService has always used, which never reuses an archived user's slot —
 * then steps forward past anything either table already holds, so
 * generation can never collide and blow up as an unhandled 500 halfway
 * through someone's transaction.
 */
class EmployeeNumber
{
    public static function next(): string
    {
        $candidate = ((int) User::withTrashed()->max('id')) + 1;

        do {
            $employeeNo = 'EMP-'.str_pad((string) $candidate, 5, '0', STR_PAD_LEFT);
            $candidate++;
        } while (self::taken($employeeNo));

        return $employeeNo;
    }

    private static function taken(string $employeeNo): bool
    {
        return User::withTrashed()->where('employee_no', $employeeNo)->exists()
            || Collector::query()->where('employee_no', $employeeNo)->exists();
    }
}
