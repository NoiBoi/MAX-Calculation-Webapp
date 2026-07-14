# Laboratory Spreadsheet Comparison Record

The browser application never imports or depends on a spreadsheet at runtime. Comparison is a manual scientific-review activity. The engine is not promoted over an existing laboratory spreadsheet until every discrepancy is explained and approved.

For each comparison, copy this record into a reviewed issue or controlled document:

| Field | Required entry |
|---|---|
| Reference case ID | Stable `REF-nnn` identifier |
| Spreadsheet identifier / filename | Exact controlled filename |
| Spreadsheet revision or date | Revision label and effective date |
| Input cells used | Sheet names, cells/ranges, units, and displayed values |
| Engine input | Canonical versioned batch input or its immutable digest |
| Spreadsheet output | Each compared value with units and displayed precision |
| Engine output | Corresponding canonical value with units |
| Absolute difference | `engine - spreadsheet`, in the output unit |
| Relative difference | `(engine - spreadsheet) / spreadsheet` when denominator is nonzero |
| Difference explanation | Formula, data version, rounding stage, convention, or unresolved discrepancy |
| Reviewer | Named reviewer and affiliation |
| Review date | ISO date |
| Disposition | Match, approved explained difference, or blocked |

Procedure:

1. Freeze or identify the spreadsheet revision; never compare against an untracked live workbook.
2. Transcribe inputs with units and preserve entered precision. Record hidden cells, named ranges, lookup tables, and rounding formulas that affect the result.
3. Run the same scientific assumptions through `calculateBatchRecipe` and retain its canonical representation, engine version, atomic-data version, warnings, and trace.
4. Compare unrounded values where the spreadsheet exposes them, then compare final displayed/rounded values separately.
5. Resolve basis, yield, purity, retained-loss, and rounding-stage differences before judging agreement.
6. A named reviewer records disposition. Unresolved differences keep the case provisional and non-release-gating.
