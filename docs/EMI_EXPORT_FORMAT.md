# EMI export format

All spreadsheet cells originate from typed canonical export tables in `lib/emi/export-model.ts`. Numeric scientific values are exported as numeric cells without display formatting or unit suffixes. Missing or invalid values are empty cells; `NaN` and infinity are never written.

## XLSX workbook

`emi-analysis.xlsx` contains:

### Frequency Data

One row per dataset and original measured frequency. Columns include original/display/sample identity, Hz and GHz frequency, every real/imaginary S11/S21/S22/S12 component, forward and reverse measured SET/SER/SEA/R/T/A, and separately labeled Simon total/reflection/absorption terms. Dataset lengths are independent; no padding or frequency re-pairing occurs.

### Directional Data

One row per dataset, selected direction, and original frequency. This preserves the existing processed-CSV structure and adds editable identity plus separately labeled Simon fields.

### Summary Statistics

One row per dataset, selected direction, and measured metric. The standard deviation is the population standard deviation across valid frequency points, matching the in-app single-dataset summary.

### Electrical Properties

One row per raw resistance reading. Sample aggregate values are repeated so every row is self-describing. Columns include thickness in µm, reading number, raw resistance in Ω, correction factor, sheet resistance in Ω/sq, mean raw resistance, conductivity in S/m and S/cm, resistivity in Ω·m and Ω·cm, aggregation method, calculation version, and note. A dataset without electrical data receives an identity row with empty scientific cells.

## CSV exports

- Processed data CSV uses the same authoritative directional export model as the workbook.
- Summary statistics CSV uses the same authoritative summary model as the workbook.
- Replicate pointwise CSV reports sample statistics and contributing counts.
- Band-summary CSV distinguishes population deviation across frequency points from sample deviation across specimen means.

CSV uses invariant JavaScript numeric serialization and RFC-style quoting for commas, quotes, and line breaks. Units are carried in headers, not numeric cells.

## JSON and HTML

Project JSON schema `2.0.0` stores optional versioned electrical records. Manifest schema `1.1.0` includes electrical provenance and Simon unit conventions. The portable HTML summary labels Simon values as theoretical and includes electrical sample summaries.

