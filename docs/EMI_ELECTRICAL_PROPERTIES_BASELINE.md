# EMI electrical-properties and export baseline

Baseline captured 2026-07-27 before the electrical-property implementation.

## Current calculation flow

- Route: `/emi`; server entry `app/emi/page.tsx`; client workflow `components/emi/emi-analyzer-shell.tsx`; SVG plots `components/emi/emi-plot.tsx`.
- Keysight complex CSV is parsed by `packages/chemistry-engine/emi/parser.ts`. The observed format has a `BEGIN`/`END` data section and nine columns for frequency plus real/imaginary S11, S21, S22, and S12. Header order is not assumed.
- Frequency is canonicalized and retained as Hz. Complex S-parameters are stored as finite real/imaginary pairs.
- `calculateEmiDataset` calculates forward S11/S21 and reverse S22/S12 values. `R`, `T`, `A`, `SET`, `SER`, and `SEA` are generated in `packages/chemistry-engine/emi/calculations.ts` without display rounding or graph transformations.
- Dataset identity is a project-local UUID plus the preserved original filename. Editable metadata is stored separately in `EmiSampleMetadata`.
- Saved EMI projects use schema `1.0.0`, parser `1.0.0-keysight-complex-csv`, and IndexedDB schema 12. Projects store structured parsed S-parameters, metadata, group definitions, selections, QC/interpolation/plot settings, and calculation/parser versions.
- Graph traces use calculated directional points directly. Invalid logarithmic values remain `null` and split plot segments.

## Export baseline

The pre-milestone EMI UI exposes four CSV exports, a project/manifest JSON export, SVG/PNG figures, and standalone HTML. It has no XLSX exporter or spreadsheet runtime dependency.

- Processed CSV: one row per dataset, direction, and measured frequency; includes directional complex reflection/transmission components and all six derived metrics.
- Summary CSV: one row per dataset, direction, and metric; includes range, validity counts, mean, median, population standard deviation, minimum, and maximum.
- Replicate pointwise CSV: group/frequency/metric statistics with sample standard deviation and confidence intervals.
- Band-summary CSV: individual and specimen-first group summaries.

Representative pre-change files generated from a two-point deterministic fixture:

- `docs/baselines/emi-processed-data.baseline.csv`
- `docs/baselines/emi-summary-statistics.baseline.csv`

## Export defects and gaps identified at baseline

1. There is no EMI XLSX path, so workbook structure, numeric cell types, and round-trip integrity cannot currently be verified.
2. The individual rows of the band-summary CSV label a column `Sample standard deviation` but emit a blank value even though the authoritative single-dataset calculation has a population standard deviation. This is a header/value semantic mismatch.
3. CSV assembly and escaping are duplicated in two modules rather than driven by one typed export model and stable column definitions.
4. Processed and summary CSV rows identify only the original filename; editable display name and sample ID are absent.
5. No export carries electrical measurements, their calculation version, or a separately labeled Simon theoretical estimate.

No baseline evidence was found of a Hz/GHz conversion error, magnitude/power confusion, SET/SER/SEA disagreement, off-by-one row error, or graph-transformed data entering the two primary CSV exports. Those properties still require explicit regression and workbook round-trip tests.

## Baseline validation

- Unit tests: 484 passed across 36 files.
- Production build: passed; `/emi` built successfully.
- Existing EMI scientific tests: 18 passed across the single-dataset and replicate engine suites.
- Existing EMI presentation/export unit tests: 9 passed.
- Reference corpus documented in `EMI_SCIENTIFIC_FOUNDATION.md`: 111/111 Keysight CSV files parsed, containing 22,311 measured rows.

