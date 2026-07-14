# Atomic-radius registry and descriptor architecture

## Current decision

Schema `2.0.0` separates scientific-source verification from laboratory approval. Teatum metallic CN12 and Cordero covalent datasets are source-verified and usable for exploratory screening; neither is lab-approved. Rahm neutral-isodensity values are installed provisionally and cannot produce aggregates until the primary SI transcription is directly verified.

## Registry and validation

`radius-data.ts` validates named definition/source/version, pm units, coordination/oxidation/spin policy, qualified record uniqueness, positive Decimal values, coverage, missing-value policy, trust state, and an independently verified SHA-256 content digest. Multiple values for one element are legal only with distinct qualifier keys and an explicit default policy. Definitions remain separate; there is no fallback or merged “best radius” table.

The scientific content digest excludes local trust metadata, so imported trust can be downgraded without altering the immutable scientific payload. `source-verified` enables screening; `lab-approved` requires a separate explicit laboratory decision.

## Descriptor engine

`calculateSiteRadiusDescriptor` accepts one explicit `SiteComposition` site, one explicit dataset, and provenance-bearing same-definition overrides. It normalizes fractions over occupied atoms, excludes vacancy, blocks aggregates on missing/ambiguous values, and calculates mean, extrema/range, weighted variance/Decimal square root, standard deviation, and atomic-size mismatch. Site multiplicity does not scale statistics. Flat formulas never infer M/A/X sites, and different site definitions are never combined into a global mismatch.

## Persistence and history

Database schema 5 stores per-site dataset ID/version/digest, source and lab status, resolved values including missing entries, overrides, results, explicit site model, descriptor version, and disclaimer version in new immutable snapshots. Schema-4 snapshots migrate with `radiusDatasetSelections: null`; they are not recalculated or assigned a current dataset. Recalculation is an explicit new working result/revision.

Backups preserve these records and verify digests. Imported dataset trust is always downgraded to `unverified-import`.

Every mismatch display retains: “Atomic-size mismatch is a screening descriptor. It is not a direct prediction of physical stress, lattice strain, phase stability, or synthesis success.”
