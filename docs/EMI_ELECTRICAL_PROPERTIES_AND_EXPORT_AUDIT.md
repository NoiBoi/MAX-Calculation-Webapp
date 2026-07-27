# EMI electrical properties and export audit

## Files and architecture inspected

The audit covered the `/emi` page and analyzer/plot components; EMI parser, calculations, validation, statistics, replicate logic and tests; project schema/repository and IndexedDB version 12; processed, summary, replicate, band, manifest, HTML, SVG and PNG exports; the 111-file `emi-reference-data` corpus; and the documented legacy master workbook comparison.

Canonical scientific flow remains:

```text
Keysight CSV → complex S-parameters + frequency Hz
             → measured directional calculation
             → validation/statistics
             → UI and typed export tables
```

Electrical and Simon calculations are a separate additive branch from user-entered measurements. They do not feed measured SET/SER/SEA/R/T/A.

## Defects and repairs

### Individual band standard deviation

**Defect:** the band CSV header said `Sample standard deviation`, while individual-dataset rows exported a blank even though the authoritative in-app dataset statistic had a population deviation.

**Root cause:** one mixed column was used for two different populations and the individual branch deliberately inserted `null`.

**Repair:** the export now provides `Standard deviation` plus an explicit convention. Individual rows export the authoritative population deviation across frequency points; group rows export sample deviation across specimen means (`n - 1`).

### Missing workbook export and round-trip verification

**Defect/gap:** no EMI XLSX exporter existed. There was therefore no worksheet, numeric-cell, unequal-length, or workbook round-trip contract.

**Repair:** a standards-based OOXML workbook now uses four stable worksheets driven by canonical typed tables. Automated tests unzip and read it back, verifying worksheet names, headers, cell positions, numeric types/values, row counts, unequal dataset lengths, missing values, and absence of nonfinite output.

### Fragmented primary export models

**Defect:** processed and summary CSV columns were assembled directly in the CSV functions, while any future workbook would require separate mapping logic.

**Repair:** processed CSV, summary CSV, and XLSX now consume shared normalized export tables. The layer holds numeric values and explicit units and never scrapes DOM text, chart tooltips, display strings, or transformed graph data.

### Missing identity and electrical provenance

**Defect:** primary CSVs contained only original filenames, and no export could represent electrical readings or a theoretical series.

**Repair:** display name and sample ID were added without removing the original filename. XLSX, project JSON, manifest, and HTML carry electrical inputs, derived values, correction factor, and calculation version. Frequency-resolved exports place Simon total/reflection/absorption in separately labeled theoretical columns.

## Numerical validation

For `R_raw = 1 Ω`, factor `4.532`, and thickness `10 µm`:

```text
R_sheet                 = 4.532 Ω/sq
conductivity            = 22065.31332744925 S/m
conductivity            = 220.6531332744925 S/cm
resistivity             = 0.00004532 Ω·m
resistivity             = 0.004532 Ω·cm
Simon estimate at 10 GHz = 35.962348609931205 dB
```

The tests also cover multiple readings, arithmetic-mean aggregation, extreme positive values, missing/zero/negative/nonfinite inputs, partial rows, Hz-to-MHz conversion, exact point ordering, and unchanged measured EMI results.

## Before and after

The pre-change deterministic CSV artifacts are retained in `docs/baselines`. Their measured frequencies, S-parameter-derived powers, SET, SER, SEA, and summaries are regression expectations. After the change, those canonical measured values are unchanged. New columns append sample identity and optional theoretical values. Invalid theoretical values remain empty rather than becoming zero, `NaN`, or infinity.

## Persistence compatibility

The EMI project schema is now `2.0.0`. The parser and local repository accept historical `1.0.0` projects and adapt them with absent electrical metadata—never fabricated zeroes. New electrical records are optional and retain raw readings, thickness, factor, note, derived snapshot, and calculation version. IndexedDB remains version 12 because the embedded optional project shape does not require a new store or index; existing local/cloud semantics are unchanged.

## Remaining limitations and deferred graph work

- The Simon equation is an empirical estimate, not a validation of measured shielding or a model of every material morphology.
- Four-point-probe edge/spacing/substrate corrections beyond the fixed requested factor are not inferred.
- No automatic outlier removal is performed.
- Simon graph overlays, visibility toggles, smoothing, smoothed export, interpolation changes, and graph redesign are explicitly deferred.

## Final validation

- TypeScript: passed.
- ESLint: passed with zero warnings.
- Unit and integration tests: 506 passed across 38 files.
- EMI browser tests: 3 passed, including electrical entry, persisted restore, and XLSX download.
- Keysight reference verification: 111/111 files parsed successfully; measured decomposition residual maximum remained `2.842170943040401e-14 dB`.
- Production build: passed with `/emi` included.
- XLSX round trip: passed for valid electrical metadata, unequal dataset lengths, missing metadata, multiple readings, partial readings, and empty workbooks.
