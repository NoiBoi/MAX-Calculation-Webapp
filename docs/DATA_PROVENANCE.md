# Data Provenance

## Policy

Scientific data is immutable by `dataVersion`. Corrections create a new version; saved snapshots retain their original version. Every record identifies its source, access date, units, interpretation policy, and any user override. A user override never mutates a standard dataset and is always visible in the trace.

## Atomic weights

The seed subset in `data/elements.json` is transcribed from the IUPAC Commission on Isotopic Abundances and Atomic Weights (CIAAW) [2024 standard table](https://ciaaw.org/atomic-weights.htm) and [2024 abridged table](https://ciaaw.org/abridged-atomic-weights.htm), accessed 2026-07-13.

CIAAW represents some standard atomic weights as intervals because normal terrestrial materials vary isotopically. MAX Stoich preserves those intervals and separately stores the CIAAW abridged value used for routine molar-mass calculation. The `calculationValuePolicy` makes this choice explicit. Samples with known nonstandard isotopic composition require a user-defined value and provenance note.

The seed file includes only elements needed by the named initial reference cases. Expansion to the full periodic table is a reviewed data task, not a generated placeholder.

Formula symbol validation is deliberately separate from atomic-weight data. The parser recognizes the complete IUPAC element-symbol set in atomic-number order, based on the [IUPAC periodic table and element naming recommendations](https://iupac.org/what-we-do/periodic-table-of-elements/). The seed atomic-weight dataset remains smaller; molar-mass calculation returns a structured data-unavailable error for recognized elements it does not contain.

Molar-mass calculation validates the supplied dataset, selects each record's explicit `calculationValue`, and reports `calculationValuePolicy`, source IDs, data version, and warnings. Interval standard weights produce a deterministic notice explaining the selected calculation value. The existing `user-specified` record policy is the only atomic-weight customization consumed in this milestone and is always exposed in warnings and trace. No separate per-call override structure was invented.

## Atomic radii

No radius dataset is approved yet. `data/radius-sets.json` is intentionally empty. Before release of descriptors, the laboratory must approve:

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

- Full 118-element atomic-weight dataset is not yet transcribed and independently checked; all 118 symbols can still be parsed.
- Atomic-radius source/definition is unresolved and blocks descriptor implementation.
- Laboratory precursor routes and lots are not supplied.
- Numerical reference outputs for the named chemistry test cases require independent laboratory-approved values.

## Persisted scientific provenance

Every saved snapshot records the engine, parser, site-composition, matrix, solver, batch-pipeline, and atomic-weight dataset versions. SHA-256 digests cover canonical input, canonical output, and the complete selected atomic-weight dataset. Exact solver values retain their discriminated rational/finite-decimal object, reduced numerator, and positive denominator; the mass-domain approximation remains separately labeled with precision and half-even rounding policy.

Historical snapshots retain the original stored result even when the installed engine changes. “Recalculate with current engine” creates an unsaved working result and does not claim byte-identical reproduction or alter the historical record. Editable input may be migrated explicitly; original snapshots remain non-destructive evidence.
# Backup, import, and descriptor status

Full backups preserve snapshot engine/parser/solver/batch versions, atomic-weight dataset version and digest, exact rationals, canonical output, and record/manifest SHA-256 digests. Importing an older application snapshot preserves its historical output; it is never silently recalculated or relabeled with current versions.

No approved atomic-radius dataset is present. Descriptor release remains blocked until one definition/source/edition, units, coordination and oxidation-state policies, missing-value policy, named reviewer, and digest are recorded. Radius values must not be inferred from the atomic-weight dataset or mixed across definitions.
# Atomic-radius registry gate (schema 1.0.0)

The installed registry contains zero datasets and has no default. Dataset validation requires pm units, positive decimal strings, real unique element symbols, complete policies/source/reviewer metadata, and an independently verified SHA-256 content digest. Imported approval is downgraded to `imported-unverified`; only a separate local review may promote it. Overrides require element, pm value, matching definition, reason, source or measurement basis, label, and revision date, but remain disabled until a base dataset definition is approved.
