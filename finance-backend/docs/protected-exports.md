# Protected financial exports

- Dashboard exports (admin, staff, and collector) use `POST /api/dashboard/export`. The JSON body must contain `export_password`, 12–64 characters. Existing year query parameters still apply.
- CSV exports use `POST /api/exports/csv` with `contents` and `export_password`. The response is an AES-256 ZIP containing `report.csv`. The CSV keeps its UTF-8 BOM, quoted fields, and formula-injection protection.
- Reports PDF exports use `POST /api/exports/pdf` with `html` and `export_password`. The isolated renderer blocks external/local resource loading and PHP/JavaScript execution. Reports offers separate PDF, CSV, and paper Print controls.
- PDFs use AES-256 document encryption through `tecnickcom/tc-lib-pdf`; ZIPs use PHP's `ZipArchive` AES-256 support. All export endpoints require authentication, rate-limit exports, and send `Cache-Control: no-store, private`.
- Passwords are chosen per download, sent in the request body, and are not persisted. They are excluded from Laravel's flashed validation input. Production must use HTTPS and must not enable request-body logging on these routes.
- Deployment requires `composer install` from the updated lockfile, PHP OpenSSL and ZIP extensions, and a frontend rebuild. ZIP clients must support AES encryption (for example, 7-Zip).
- Browser printing remains a paper-print workflow. The browser's own **Save as PDF** option cannot enforce an application password. Use the protected Export controls on Dashboard or Reports for encrypted files. Signature lines are sign-off spaces, not cryptographic signatures or proof of approval.

Validation: `php vendor/bin/phpunit tests/Unit/ProtectedExportServiceTest.php tests/Feature/ProtectedExportAccessTest.php`.
