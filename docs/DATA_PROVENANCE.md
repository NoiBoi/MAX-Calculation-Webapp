# Data Provenance

## Policy

Scientific data is immutable by `dataVersion`. Corrections create a new version; saved snapshots retain their original version. Every record identifies its source, access date, units, interpretation policy, and any user override. A user override never mutates a standard dataset and is always visible in the trace.

## Atomic weights

The complete registry in `data/elements.json` is deterministically parsed from the IUPAC Commission on Isotopic Abundances and Atomic Weights (CIAAW) [2024 standard table](https://ciaaw.org/atomic-weights.htm) and [2024 abridged table](https://ciaaw.org/abridged-atomic-weights.htm), accessed 2026-07-14.

CIAAW represents some standard atomic weights as intervals because normal terrestrial materials vary isotopically. MAX Stoich preserves those intervals and separately stores the CIAAW abridged value used for routine molar-mass calculation. The `calculationValuePolicy` makes this choice explicit. Samples with known nonstandard isotopic composition require a user-defined value and provenance note.

The registry contains all 118 symbols, all 84 CIAAW entries with usable standard calculation values, and explicit unavailable records for 34 elements without a standard atomic weight.

Formula symbol validation is deliberately separate from atomic-weight availability. The parser recognizes the complete IUPAC element-symbol set in atomic-number order, based on the [IUPAC periodic table and element naming recommendations](https://iupac.org/what-we-do/periodic-table-of-elements/). Molar-mass calculation returns a structured data-unavailable error only when the valid record has no authoritative calculation value.

Molar-mass calculation validates the supplied dataset, selects each record's explicit `calculationValue`, and reports `calculationValuePolicy`, source IDs, data version, and warnings. Interval standard weights produce a deterministic notice explaining the selected calculation value. The existing `user-specified` record policy is the only atomic-weight customization consumed in this milestone and is always exposed in warnings and trace. No separate per-call override structure was invented.

## Atomic radii

Three separate radius definitions are installed under `data/radius-sets/`. Teatum metallic CN12 and Cordero covalent values are source-verified for screening; Rahm neutral-isodensity values remain provisional. No dataset is lab-approved. Any future laboratory approval must record:

1. Definition(s): metallic, covalent, ionic, or another named convention.
2. Source and edition/version.
3. Coordination, oxidation, and spin policies.
4. Missing-value behavior.
5. Whether a MAX-site-specific dataset is justified.

Datasets of different definitions remain separate. The engine rejects mixed definitions unless a future, scientifically documented conversion is explicitly selected.

## Precursors and lots

No default precursor purity, supplier, particle size, cost, or route is scientifically universal. The checked-in default file is empty pending laboratory review. Saved lots require supplier, lot identifier, purity value, purity source (certificate, assay, nominal, or user estimate), date, and optional molar-mass override provenance.

## Versioning and review

- Schema versions use semantic versioning.
- Scientific datasets use `YYYY.major.minor`.
- A dataset change records reviewer, reason, source diff, affected reference tests, and migration behavior.
- Production promotion requires two-person verification against the cited source for hand-transcribed values.
- Hashes of dataset files are captured in calculation snapshots in addition to human-readable versions.

## Known provenance gaps

- Representative mass numbers for no-standard-weight elements are intentionally not populated or used.
- Direct retrieval of the Rahm Supporting Information remains blocked; that dataset is provisional.
- Laboratory precursor routes and lots are not supplied.
- Numerical reference outputs for the named chemistry test cases require independent laboratory-approved values.

## Persisted scientific provenance

Every saved snapshot records the engine, parser, site-composition, matrix, solver, batch-pipeline, and atomic-weight dataset versions. SHA-256 digests cover canonical input, canonical output, and the complete selected atomic-weight dataset. Exact solver values retain their discriminated rational/finite-decimal object, reduced numerator, and positive denominator; the mass-domain approximation remains separately labeled with precision and half-even rounding policy.

Historical snapshots retain the original stored result even when the installed engine changes. “Recalculate with current engine” creates an unsaved working result and does not claim byte-identical reproduction or alter the historical record. Editable input may be migrated explicitly; original snapshots remain non-destructive evidence.
# Backup, import, and descriptor status

Full backups preserve snapshot engine/parser/solver/batch versions, atomic-weight dataset version and digest, exact rationals, canonical output, and record/manifest SHA-256 digests. Importing an older application snapshot preserves its historical output; it is never silently recalculated or relabeled with current versions.

No atomic-radius dataset is lab-approved. Source-verified datasets remain usable only for explicitly labeled screening. Radius values are never inferred from atomic weights or mixed across definitions.

# Current reviewed registries

The superseding atomic-weight source, ingestion policy, version, digest, coverage, and absence rules are in `ATOMIC_WEIGHT_INGESTION.md`. Atomic-radius primary sources, definitions, source locations, qualifiers, conversion, coverage, warnings, and digests are in `RADIUS_DATA_INGESTION.md`. Trust semantics are in `DATASET_TRUST.md`.

Historical schema-5 snapshots store the atomic-weight version/digest and, per explicit site, radius dataset ID/version/digest, source and laboratory status, resolved values including missing entries, overrides, descriptor results, and disclaimer version. Existing schema-4 snapshots migrate with `radiusDatasetSelections: null`; no dataset is assigned or recalculated silently.
# Atomic-radius registry gate (schema 2.0.0)

The installed registry contains three separate datasets and has a source-verified screening default. Validation requires pm units, positive decimals, real symbols, qualifier-aware uniqueness, complete source/policy/coverage metadata, and an independently verified SHA-256 digest. Imported trust is downgraded to `unverified-import`. Overrides require element, matching definition, reason, source/measurement basis, label, and revision date.
