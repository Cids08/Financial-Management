<?php

namespace App\Concerns;

use Illuminate\Support\Facades\DB;

/**
 * Serialises auto-generated business reference numbers across concurrent
 * requests.
 *
 * The generateReference*() helpers read "the highest existing number", add one
 * and insert. That read-then-write has no lock, so two concurrent creates both
 * read REF-AP-008, both decide on 009, and both insert — putting the same
 * business reference on two different documents and breaking every audit trail
 * that resolves a ledger line back to its source. A `Rule::unique()` in the
 * FormRequest does not help either: validation is still a read-then-write.
 *
 * pg_advisory_xact_lock takes a transaction-scoped advisory lock on a bigint
 * derived from the key. Because the lock is released only when the enclosing
 * transaction ends, and every create() path already wraps itself in one, a
 * second request blocks here, then re-reads the freshly committed number and
 * picks the following one. The partial unique indexes added in
 * 2026_10_06_000000 remain the hard guarantee for anything not in a
 * transaction.
 */
trait LocksReferencePrefix
{
    protected static function lockReferencePrefix(string $key): void
    {
        // Advisory locks are transaction-scoped, so there is nothing to lock
        // outside a transaction — the unique index covers that path.
        if (DB::transactionLevel() < 1) {
            return;
        }

        // pg_advisory_xact_lock is PostgreSQL-only. Tests run on SQLite
        // (single-threaded, so no concurrent generator is possible) and MySQL
        // is not a supported deployment target, so skip the lock rather than
        // emit invalid SQL on those drivers.
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        // hashtext() maps the key onto the bigint the single-argument
        // advisory-lock overload expects.
        DB::statement('SELECT pg_advisory_xact_lock(hashtext(?))', [$key]);
    }
}