// Shim for case-sensitive Linux filesystems.
// Git committed the hook as Useauth.js (capital U). This file ensures that
// imports using the conventional camelCase spelling '../hooks/useAuth' also
// resolve correctly on Linux/Docker where filenames are case-sensitive.
export * from './Useauth'