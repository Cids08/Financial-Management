// Lowercase shim — Git committed this file as UseCashAccounts.js (capital U).
// Windows is case-insensitive so both names resolve locally, but Linux Docker
// only has the originally-committed casing. This shim ensures lowercase imports work.
export * from './useCashAccounts'