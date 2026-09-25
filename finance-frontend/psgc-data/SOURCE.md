# PSGC Data Snapshot (Official, Free)

Vendored machine-readable copy of the Philippine Standard Geographic Code (PSGC),
published by the Philippine Statistics Authority (PSA).

- Source: https://psa.gov.ph/classification/psgc/
- Snapshot: `psgc_2025-07-31.csv` (July 31, 2025 release)
- Mirror used: https://github.com/Ordonia/listOfCityMunicipalityAndBarangay2025
- Status: official government open data — free to use, no API key or fee.

The CSV is the full PSGC release trimmed to NON-barangay rows only
(Regions, Provinces, Cities, Municipalities, Sub-Municipalities ≈ 1,756 rows;
the ~42,000 barangays were dropped so the snapshot stays small).

## Refreshing

Th index is generated from this file (NOT hand-edited). To refresh:

1. Replace `psgc_2025-07-31.csv` with the latest PSGC release (drop barangay rows: keep `Reg`,`Prov`,`City`,`Mun`,`SubMun`).
2. Run `npm run generate:addresses` in `finance-frontend/`.
3. Commit the regenerated `src/data/generatedAddressIndex.js` plus the updated CSV.